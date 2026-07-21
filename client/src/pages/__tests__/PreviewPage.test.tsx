import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import type { ParseResult } from '@shared/parsers/trading212';
import type { PdfParseResult } from '@shared/parsers/trading212Pdf';
import type { Transaction } from '@shared/types/transaction';

const mockNavigate = vi.fn();
const mockExtractPdfPageTexts = vi.fn();
const mockReportParseEvent = vi.fn();
const mockUseAuth = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

// The unlock carry-through (PR-3) branches on auth state, so PreviewPage now reads
// useAuth. Default: anonymous (no user); individual tests override per path.
vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock('../../utils/pdfExtractor', () => ({
  extractPdfPageTexts: (file: File) => mockExtractPdfPageTexts(file),
}));

vi.mock('../../lib/parseMonitor', () => ({
  reportParseEvent: (event: unknown) => mockReportParseEvent(event),
}));

vi.mock('../../lib/analytics', () => ({
  analytics: {
    previewStarted: vi.fn(),
    previewClean: vi.fn(),
    previewBlocked: vi.fn(),
    gateEligible: vi.fn(),
    gateBlocked: vi.fn(),
  },
}));

// Canned shared parser outputs. Crucially, the ENGINE functions are spied so the
// test can assert PreviewPage never calls them (the moat boundary). If any of
// them is invoked, the assertions at the bottom fail loudly.
const sharedExports = {
  parseTrading212Csv: vi.fn(),
  parseIbkrCsv: vi.fn(),
  parseRevolutStatement: vi.fn(),
  parseTrading212AnnualStatement: vi.fn(),
  calculateTaxes: vi.fn(),
  calculateTaxesFromPdf: vi.fn(),
};

vi.mock('@shared/index', async () => {
  const actual = await vi.importActual<typeof import('@shared/index')>('@shared/index');
  return {
    ...actual,
    parseTrading212Csv: (...args: unknown[]) => sharedExports.parseTrading212Csv(...args),
    parseIbkrCsv: (...args: unknown[]) => sharedExports.parseIbkrCsv(...args),
    parseRevolutStatement: (...args: unknown[]) => sharedExports.parseRevolutStatement(...args),
    parseTrading212AnnualStatement: (...args: unknown[]) =>
      sharedExports.parseTrading212AnnualStatement(...args),
    calculateTaxes: (...args: unknown[]) => sharedExports.calculateTaxes(...args),
    calculateTaxesFromPdf: (...args: unknown[]) => sharedExports.calculateTaxesFromPdf(...args),
  };
});

const mockPapaParse = vi.fn();
vi.mock('papaparse', () => ({
  default: { parse: (...args: unknown[]) => mockPapaParse(...args) },
}));

import PreviewPage from '../PreviewPage';
import { analytics } from '../../lib/analytics';
import { readPendingParse, hasEligiblePendingParse } from '../../lib/pendingParse';

function renderPage(initialPath = '/verifica-extras') {
  return render(
    <HelmetProvider>
      <MemoryRouter initialEntries={[initialPath]}>
        <PreviewPage />
      </MemoryRouter>
    </HelmetProvider>,
  );
}

function makeCsvFile(name = 'transactions.csv'): File {
  return new File(['Action,Time\n'], name, { type: 'text/csv' });
}

function makePdfFile(name = 'annual-statement.pdf', size = 1024): File {
  return new File([new Uint8Array(size)], name, { type: 'application/pdf' });
}

function findHiddenFileInput(container: HTMLElement): HTMLInputElement {
  const input = container.querySelector('input[type="file"]') as HTMLInputElement | null;
  if (!input) throw new Error('hidden file input not found');
  return input;
}

function makePdfParseResult(overrides: Partial<PdfParseResult> = {}): PdfParseResult {
  const base: PdfParseResult = {
    year: 2025,
    overview: {
      currency: 'USD',
      // A non-zero closed result the page must NOT render: it is engine-adjacent
      // and outside the moat boundary. If it ever shows up, the no-engine-output
      // test fails.
      closedResult: 5000.55,
      taxWithheld: 100,
    } as PdfParseResult['overview'],
    sellTrades: [
      { ticker: 'AAPL', isin: 'US0378331005', executionTime: '2025-06-01' },
      { ticker: 'MSFT', isin: 'US5949181045', executionTime: '2025-07-15' },
    ] as unknown as PdfParseResult['sellTrades'],
    dividends: [{ ticker: 'AAPL' }] as unknown as PdfParseResult['dividends'],
    distributions: [],
    warnings: [],
    structuredWarnings: [],
  } as PdfParseResult;
  return { ...base, ...overrides };
}

function makeCsvParseResult(overrides: Partial<ParseResult> = {}): ParseResult {
  const transactions: Transaction[] = [
    {
      action: 'buy', ticker: 'AAPL', isin: 'US0378331005', shares: 10, price: 150,
      priceCurrency: 'USD', transactionDate: '2025-01-15', total: 1500, totalCurrency: 'USD',
    } as unknown as Transaction,
    {
      action: 'sell', ticker: 'AAPL', isin: 'US0378331005', shares: 5, price: 200,
      priceCurrency: 'USD', transactionDate: '2025-06-20', total: 1000, totalCurrency: 'USD',
    } as unknown as Transaction,
    {
      action: 'dividend', ticker: 'AAPL', isin: 'US0378331005', shares: 0, price: 0,
      priceCurrency: 'USD', transactionDate: '2025-07-01', total: 12.5, totalCurrency: 'USD',
    } as unknown as Transaction,
  ];
  return { transactions, skipped: [], warnings: [], ...overrides } as ParseResult;
}

beforeEach(() => {
  vi.clearAllMocks();
  window.sessionStorage.clear();
  // Default auth state: anonymous visitor. Tests that exercise the logged-in or
  // paid unlock branch override this per-case.
  mockUseAuth.mockReturnValue({ user: null });
  sharedExports.parseTrading212Csv.mockReturnValue(makeCsvParseResult());
  sharedExports.parseIbkrCsv.mockReturnValue(makeCsvParseResult());
  sharedExports.parseRevolutStatement.mockReturnValue(makeCsvParseResult());
  sharedExports.parseTrading212AnnualStatement.mockReturnValue(makePdfParseResult());
  mockExtractPdfPageTexts.mockResolvedValue(['page 1 text', 'page 2 text']);
  mockPapaParse.mockImplementation(
    (_file: File, opts: { complete: (r: { data: unknown[] }) => void }) => {
      opts.complete({ data: [{ Action: 'Market buy', Time: '2025-01-15' }] });
    },
  );
});

describe('PreviewPage - drop-zone keyboard accessibility (WCAG 2.1.1 / 4.1.2)', () => {
  it('exposes the drop-zone as a focusable button that opens the file picker on Enter and Space', async () => {
    const user = userEvent.setup();
    const { container } = renderPage();

    // The free checker's drop-zone is a button with an accessible name, so a
    // keyboard-only visitor can reach the top of the funnel at all.
    const dropzone = screen.getByRole('button', { name: /upload area/i });
    expect(dropzone).toHaveAttribute('tabindex', '0');

    dropzone.focus();
    expect(dropzone).toHaveFocus();

    const clickSpy = vi.spyOn(findHiddenFileInput(container), 'click').mockImplementation(() => {});
    await user.keyboard('{Enter}');
    expect(clickSpy).toHaveBeenCalledTimes(1);
    await user.keyboard(' ');
    expect(clickSpy).toHaveBeenCalledTimes(2);
  });
});

describe('PreviewPage - public access (no paywall)', () => {
  it('renders the checker for an anonymous visitor (no auth gate, no redirect)', () => {
    renderPage();
    expect(
      screen.getByRole('heading', { name: 'Check your statement for free', level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /PDF Statement/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /CSV Export/ })).toBeInTheDocument();
    // No navigation away (the upload paywall redirects to /pricing; this page must not).
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});

describe('PreviewPage - MOAT BOUNDARY (headline test: zero engine output)', () => {
  it('never calls the tax engine and renders no tax/gains/CASS figure after a clean PDF parse', async () => {
    const user = userEvent.setup();
    const { container } = renderPage();
    await user.upload(findHiddenFileInput(container), makePdfFile());

    await waitFor(() => {
      expect(screen.getByTestId('support-verdict')).toBeInTheDocument();
    });

    // 1. The engine functions are never invoked.
    expect(sharedExports.calculateTaxes).not.toHaveBeenCalled();
    expect(sharedExports.calculateTaxesFromPdf).not.toHaveBeenCalled();

    // 2. No engine-output value or label appears anywhere on the page. This is the
    //    PR #124 lesson encoded: counts + warnings + verdict are free, the numbers
    //    are paid.
    const body = container.textContent ?? '';
    expect(body).not.toContain('5000.55'); // the closed-result engine-adjacent value
    expect(body).not.toContain('5,000.55');
    expect(screen.queryByText(/Closed Result/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/capital gains/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/tax owed/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/CASS/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/total tax/i)).not.toBeInTheDocument();
    // No currency-formatted RON figure (engine output is the only thing in RON here).
    expect(body).not.toMatch(/RON/);
    expect(body).not.toMatch(/lei/);

    // 3. Parser output IS shown (counts + a verdict), confirming the page works.
    expect(screen.getByText('Sell Trades')).toBeInTheDocument();
    expect(screen.getByText('annual-statement.pdf')).toBeInTheDocument();
  });

  it('never calls the engine on the CSV path either', async () => {
    const user = userEvent.setup();
    const { container } = renderPage();
    await user.click(screen.getByRole('button', { name: /CSV Export/ }));
    await user.upload(findHiddenFileInput(container), makeCsvFile());

    await waitFor(() => {
      expect(screen.getByTestId('support-verdict')).toBeInTheDocument();
    });
    expect(sharedExports.calculateTaxes).not.toHaveBeenCalled();
    expect(sharedExports.calculateTaxesFromPdf).not.toHaveBeenCalled();
    // Parser counts are shown.
    expect(screen.getByText('Buys')).toBeInTheDocument();
    expect(screen.getByText('Sells')).toBeInTheDocument();
  });
});

describe('PreviewPage - support verdict', () => {
  it('GREEN (anonymous): trusted broker + supported year unlock routes to signup with redirect back to pricing', async () => {
    const user = userEvent.setup();
    const { container } = renderPage();
    await user.upload(findHiddenFileInput(container), makePdfFile());

    await waitFor(() => {
      expect(screen.getByText('We can process this statement. Unlock your numbers.')).toBeInTheDocument();
    });
    // Trusted broker + 2025 supported.
    expect(screen.getByText('Trading 212: full support.')).toBeInTheDocument();
    expect(screen.getByText('We calculate tax year 2025.')).toBeInTheDocument();
    // Unlock CTA present; an anonymous buyer is sent to signup, then back to pricing
    // to complete the purchase (the stashed parse survives the round-trip).
    const unlock = screen.getByTestId('preview-unlock-cta');
    expect(unlock).toBeInTheDocument();
    await user.click(unlock);
    expect(mockNavigate).toHaveBeenCalledWith('/signup?redirect=/pricing');
    // No contact CTA in the green state.
    expect(screen.queryByTestId('preview-contact-cta')).not.toBeInTheDocument();
    expect(analytics.previewClean).toHaveBeenCalledTimes(1);
    expect(analytics.previewBlocked).not.toHaveBeenCalled();
    // Gate telemetry: the eligible event fires, the blocked event does not.
    expect(analytics.gateEligible).toHaveBeenCalledTimes(1);
    expect(analytics.gateBlocked).not.toHaveBeenCalled();
  });

  it('GREEN PDF: clicking unlock persists the parsed PDF result for post-pay rehydration (PR-2)', async () => {
    const user = userEvent.setup();
    const { container } = renderPage();
    await user.upload(findHiddenFileInput(container), makePdfFile('annual-statement-2025.pdf'));

    await waitFor(() => expect(screen.getByTestId('preview-unlock-cta')).toBeInTheDocument());
    // Nothing stashed until the buyer commits to unlock.
    expect(readPendingParse()).toBeNull();
    await user.click(screen.getByTestId('preview-unlock-cta'));

    const pending = readPendingParse();
    expect(pending).not.toBeNull();
    expect(pending?.fileType).toBe('pdf');
    expect(pending?.fileName).toBe('annual-statement-2025.pdf');
    // The persisted blob is the full PDF parser result the engine consumes.
    if (pending?.fileType === 'pdf') {
      expect(pending.pdf.year).toBe(2025);
      expect(pending.pdf.sellTrades.length).toBeGreaterThan(0);
    }
    expect(mockNavigate).toHaveBeenCalledWith('/signup?redirect=/pricing');
  });

  it('GREEN CSV: clicking unlock persists the merged CSV parse with broker + selected year', async () => {
    const user = userEvent.setup();
    const { container } = renderPage();
    await user.click(screen.getByRole('button', { name: /CSV Export/ }));
    await user.upload(findHiddenFileInput(container), makeCsvFile('transactions.csv'));

    await waitFor(() => expect(screen.getByTestId('preview-unlock-cta')).toBeInTheDocument());
    await user.click(screen.getByTestId('preview-unlock-cta'));

    const pending = readPendingParse();
    expect(pending?.fileType).toBe('csv');
    if (pending?.fileType === 'csv') {
      expect(pending.broker).toBe('trading212');
      expect(pending.selectedYear).toBe(2025);
      expect(pending.csv.transactions.length).toBeGreaterThan(0);
    }
    expect(mockNavigate).toHaveBeenCalledWith('/signup?redirect=/pricing');
  });

  it('GREEN (logged-in free): unlock persists the parse and routes to /pricing to buy (PR-3)', async () => {
    mockUseAuth.mockReturnValue({ user: { id: 'u1', email: 'a@example.com', plan: 'free' } });
    const user = userEvent.setup();
    const { container } = renderPage();
    await user.upload(findHiddenFileInput(container), makePdfFile('annual-statement-2025.pdf'));

    await waitFor(() => expect(screen.getByTestId('preview-unlock-cta')).toBeInTheDocument());
    await user.click(screen.getByTestId('preview-unlock-cta'));

    // A logged-in free user is sent to pricing, where the gate token (now set)
    // lets the Buy click proceed into checkout.
    expect(mockNavigate).toHaveBeenCalledWith('/pricing');
    expect(readPendingParse()).not.toBeNull();
  });

  it('GREEN (failed stash write): keeps the purchase gate open via the tiny marker so checkout stays reachable', async () => {
    // Regression for the CRITICAL dead-end: an oversized parse (or a storage throw)
    // makes writePendingParse skip the full blob. Without a fallback the /pricing gate
    // bounces the buyer back to the checker forever. Simulate a quota failure on the
    // large blob while the tiny gate marker still writes.
    mockUseAuth.mockReturnValue({ user: { id: 'u1', email: 'a@example.com', plan: 'free' } });
    const realSetItem = Storage.prototype.setItem;
    // Restored in the finally so the spy never leaks into the next test (the suite's
    // beforeEach uses clearAllMocks, which does not restore spy implementations).
    const setItemSpy = vi.spyOn(window.sessionStorage, 'setItem').mockImplementation(function (
      this: Storage,
      key: string,
      value: string,
    ) {
      // Fail the full parse blob (as an oversized write would) but let the tiny gate
      // marker persist, so the fallback path is what keeps the gate open.
      if (key === 'investax.pendingParse') throw new DOMException('QuotaExceededError');
      realSetItem.call(this, key, value);
    });

    try {
      const user = userEvent.setup();
      const { container } = renderPage();
      await user.upload(findHiddenFileInput(container), makePdfFile('annual-statement-2025.pdf'));

      await waitFor(() => expect(screen.getByTestId('preview-unlock-cta')).toBeInTheDocument());
      await user.click(screen.getByTestId('preview-unlock-cta'));

      // The full stash was skipped (oversized), so rehydration would re-upload...
      expect(readPendingParse()).toBeNull();
      // ...but the gate marker keeps the purchase path open, and the buyer still routes
      // to pricing to buy rather than being trapped back at the checker.
      expect(hasEligiblePendingParse()).toBe(true);
      expect(mockNavigate).toHaveBeenCalledWith('/pricing');
    } finally {
      setItemSpy.mockRestore();
    }
  });

  it('GREEN (paid): unlock persists the parse and routes straight to /upload?welcome=1 (PR-3)', async () => {
    mockUseAuth.mockReturnValue({ user: { id: 'u1', email: 'a@example.com', plan: 'paid' } });
    const user = userEvent.setup();
    const { container } = renderPage();
    await user.upload(findHiddenFileInput(container), makePdfFile('annual-statement-2025.pdf'));

    await waitFor(() => expect(screen.getByTestId('preview-unlock-cta')).toBeInTheDocument());
    await user.click(screen.getByTestId('preview-unlock-cta'));

    // A paid user already owns access, so they skip checkout and land on the upload
    // page where the PR-2 rehydration runs the engine on the stashed parse (no charge).
    expect(mockNavigate).toHaveBeenCalledWith('/upload?welcome=1');
    expect(readPendingParse()).not.toBeNull();
  });

  it('BLOCKED: the contact CTA does NOT persist a pending parse', async () => {
    sharedExports.parseTrading212AnnualStatement.mockReturnValueOnce(
      makePdfParseResult({ year: 2022 }),
    );
    const user = userEvent.setup();
    const { container } = renderPage();
    await user.upload(findHiddenFileInput(container), makePdfFile());

    await waitFor(() => expect(screen.getByTestId('preview-contact-cta')).toBeInTheDocument());
    await user.click(screen.getByTestId('preview-contact-cta'));
    // A blocked file must never be stashed for rehydration.
    expect(readPendingParse()).toBeNull();
  });

  it('GREEN (now-supported prior year 2023): unlock CTA, supported-year copy, no waitlist', async () => {
    // The prior-year flip made 2023 engine-supported, so a clean 2023 statement
    // converts (unlock) instead of routing to the old prior-year waitlist. This is
    // the demand-probe -> conversion transition the go-live is meant to deliver.
    sharedExports.parseTrading212AnnualStatement.mockReturnValueOnce(
      makePdfParseResult({ year: 2023 }),
    );
    const user = userEvent.setup();
    const { container } = renderPage();
    await user.upload(findHiddenFileInput(container), makePdfFile());

    await waitFor(() => {
      expect(screen.getByTestId('support-verdict')).toBeInTheDocument();
    });
    expect(screen.getByText('We calculate tax year 2023.')).toBeInTheDocument();
    expect(screen.getByTestId('preview-unlock-cta')).toBeInTheDocument();
    expect(screen.queryByTestId('preview-contact-cta')).not.toBeInTheDocument();
    // The prior-year waitlist is retired now that 2023/2024 are supported.
    expect(screen.queryByText("Notify me when it's ready")).not.toBeInTheDocument();
    expect(analytics.previewClean).toHaveBeenCalledTimes(1);
    expect(analytics.previewBlocked).not.toHaveBeenCalled();
  });

  it('AMBER (out-of-scope year 2022): no pay button, contact CTA, prior_years waitlist (PR-4)', async () => {
    // A pre-2023 year is genuinely unsupported (pre-CMP cost-method territory). It
    // stays amber -> contact, and since PR-4 the blocked visitor can also join the
    // prior_years list (the year is the problem, so no origin select is shown).
    sharedExports.parseTrading212AnnualStatement.mockReturnValueOnce(
      makePdfParseResult({ year: 2022 }),
    );
    const user = userEvent.setup();
    const { container } = renderPage();
    await user.upload(findHiddenFileInput(container), makePdfFile());

    await waitFor(() => {
      expect(screen.getByTestId('support-verdict')).toBeInTheDocument();
    });
    expect(screen.getByText(/We do not calculate 2022 yet/)).toBeInTheDocument();
    expect(screen.queryByTestId('preview-unlock-cta')).not.toBeInTheDocument();
    expect(screen.getByTestId('preview-contact-cta')).toBeInTheDocument();
    // PR-4: the unsupported-year block now offers the year waitlist...
    expect(screen.getByText("Notify me when it's ready")).toBeInTheDocument();
    // ...but not the statement-origin select (the year, not the file, is the problem).
    expect(screen.queryByTestId('preview-origin-select')).not.toBeInTheDocument();
    expect(analytics.previewBlocked).toHaveBeenCalledTimes(1);
    expect(analytics.previewClean).not.toHaveBeenCalled();
    // Gate telemetry: blocked with the unsupported-year reason (Mihai's case).
    expect(analytics.gateBlocked).toHaveBeenCalledTimes(1);
    expect(analytics.gateBlocked).toHaveBeenCalledWith('unsupported_year');
    expect(analytics.gateEligible).not.toHaveBeenCalled();
  });

  it('AMBER (2022) capture posts to /api/subscribe with the prior_years topic + checker source', async () => {
    sharedExports.parseTrading212AnnualStatement.mockReturnValueOnce(
      makePdfParseResult({ year: 2022 }),
    );
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', fetchMock);
    try {
      const user = userEvent.setup();
      const { container } = renderPage();
      await user.upload(findHiddenFileInput(container), makePdfFile());
      await waitFor(() => expect(screen.getByText("Notify me when it's ready")).toBeInTheDocument());

      await user.type(screen.getByRole('textbox', { name: /email/i }), 'lead@example.com');
      await user.click(screen.getByRole('button', { name: 'Notify me' }));

      await waitFor(() => expect(fetchMock).toHaveBeenCalled());
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('/api/subscribe');
      const body = JSON.parse((init as RequestInit).body as string);
      expect(body.topic).toBe('prior_years');
      expect(body.source).toBe('checker:unsupported_year:trading212');
      expect(body.email).toBe('lead@example.com');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('BENIGN warning (skipped rows on a supported broker + year): warnings shown but the gate stays OPEN', async () => {
    // The refinement PR-1 delivers: a supported-broker + supported-year file
    // whose only warnings are benign (here a skipped-rows note) now shows the
    // green unlock CTA instead of the old lead-capture path, while STILL
    // rendering the informational warning. This is the case the old
    // verdict === 'green' gate wrongly blocked.
    sharedExports.parseTrading212Csv.mockReturnValueOnce(
      makeCsvParseResult({ warnings: ['3 rows skipped (unknown action)'] }),
    );
    const user = userEvent.setup();
    const { container } = renderPage();
    await user.click(screen.getByRole('button', { name: /CSV Export/ }));
    await user.upload(findHiddenFileInput(container), makeCsvFile());

    await waitFor(() => {
      expect(screen.getByTestId('support-verdict')).toBeInTheDocument();
    });
    // The benign warning is still surfaced informationally.
    expect(screen.getByText('3 rows skipped (unknown action)')).toBeInTheDocument();
    // Gate is OPEN: unlock CTA shown, no contact/lead-capture path.
    expect(screen.getByTestId('preview-unlock-cta')).toBeInTheDocument();
    expect(screen.queryByTestId('preview-contact-cta')).not.toBeInTheDocument();
    // Gate telemetry: eligible, not blocked.
    expect(analytics.gateEligible).toHaveBeenCalledTimes(1);
    expect(analytics.gateBlocked).not.toHaveBeenCalled();
  });

  it('BETA broker, clean + supported year: shows the beta caveat AND still allows unlock', async () => {
    // A beta broker (IBKR) with a clean parse and a supported year stays
    // unlockable, mirroring the live paid flow, which lets beta-broker users
    // calculate behind a verify-before-filing caveat (brokers.ts contract). The
    // beta status is surfaced as a line in the verdict, not a hard block: blocking
    // it here would be MORE restrictive than the paid path and suppress real IBKR
    // sales. The moat (engine output) stays paid regardless of broker status.
    const user = userEvent.setup();
    const { container } = renderPage();
    await user.click(screen.getByRole('button', { name: /CSV Export/ }));
    await user.click(screen.getByRole('button', { name: /Interactive Brokers/ }));
    await user.upload(findHiddenFileInput(container), makeCsvFile('ibkr.csv'));

    await waitFor(() => {
      expect(screen.getByTestId('support-verdict')).toBeInTheDocument();
    });
    // The beta caveat is shown so the user knows to verify before filing.
    expect(screen.getByText(/Interactive Brokers: support is in beta/)).toBeInTheDocument();
    // Clean + supported year -> unlock is allowed (matches the live paid flow).
    expect(screen.getByTestId('preview-unlock-cta')).toBeInTheDocument();
    expect(screen.queryByTestId('preview-contact-cta')).not.toBeInTheDocument();
  });

  it('RED: CSV missing-history hard-stop blocks, no pay button, shows the hard-stop copy', async () => {
    sharedExports.parseTrading212Csv.mockReturnValueOnce(
      makeCsvParseResult({
        transactions: [
          {
            action: 'sell', ticker: 'AAPL', isin: 'US0378331005', shares: 10, price: 200,
            priceCurrency: 'USD', transactionDate: '2025-06-20', total: 2000, totalCurrency: 'USD',
          } as unknown as Transaction,
        ],
      }),
    );
    const user = userEvent.setup();
    const { container } = renderPage();
    await user.click(screen.getByRole('button', { name: /CSV Export/ }));
    await user.upload(findHiddenFileInput(container), makeCsvFile());

    await waitFor(() => {
      expect(screen.getByText('Incomplete Transaction History Detected')).toBeInTheDocument();
    });
    expect(screen.getByText('This statement cannot be calculated correctly right now.')).toBeInTheDocument();
    expect(screen.queryByTestId('preview-unlock-cta')).not.toBeInTheDocument();
    expect(screen.getByTestId('preview-contact-cta')).toBeInTheDocument();
    // PR-4: missing-history deliberately gets NO waitlist (the fix is in the
    // user's hands: re-export with full history) and no origin select.
    expect(screen.queryByText("Notify me when it's ready")).not.toBeInTheDocument();
    expect(screen.queryByTestId('preview-origin-select')).not.toBeInTheDocument();
    // Gate telemetry: blocked with the missing-history reason.
    expect(analytics.gateBlocked).toHaveBeenCalledWith('missing_history');
    expect(analytics.gateEligible).not.toHaveBeenCalled();
  });
});

describe('PreviewPage - PDF broker mismatch (non-Trading212 PDF)', () => {
  it('shows the localized redirect, hides the verdict card, offers no unlock, suppresses the raw warning', async () => {
    // A non-T212 PDF (e.g. an IBKR Activity Statement PDF) parses to zero rows
    // with brokerMismatch true. The page must lead with a clear localized
    // "use the CSV export" redirect instead of the raw English parser warning,
    // and must NOT show a misleading "Trading 212: full support" verdict line.
    sharedExports.parseTrading212AnnualStatement.mockReturnValueOnce(
      makePdfParseResult({
        brokerMismatch: true,
        sellTrades: [],
        dividends: [],
        distributions: [],
        warnings: [
          'This does not look like a Trading 212 statement (no recognizable sections found). If it is an Interactive Brokers statement, upload its CSV Activity Statement instead.',
        ],
      }),
    );
    const user = userEvent.setup();
    const { container } = renderPage();
    await user.upload(findHiddenFileInput(container), makePdfFile('ibkr.pdf'));

    await waitFor(() => {
      expect(screen.getByTestId('pdf-broker-mismatch')).toBeInTheDocument();
    });
    // Localized redirect copy (EN locale in tests), pointing at the CSV export.
    expect(screen.getByText('This does not look like a Trading 212 statement')).toBeInTheDocument();
    expect(screen.getByText(/export the CSV \(Activity Statement\)/i)).toBeInTheDocument();
    // The misleading broker/year verdict card is hidden for a mismatch.
    expect(screen.queryByTestId('support-verdict')).not.toBeInTheDocument();
    // No pay button; the lead-capture / contact path is offered instead.
    expect(screen.queryByTestId('preview-unlock-cta')).not.toBeInTheDocument();
    expect(screen.getByTestId('preview-contact-cta')).toBeInTheDocument();
    // The raw English parser warning is NOT rendered as a separate warnings list.
    expect(screen.queryByText('Warnings')).not.toBeInTheDocument();
    // Moat: the engine is never invoked.
    expect(sharedExports.calculateTaxesFromPdf).not.toHaveBeenCalled();
    // Gate telemetry: blocked with the wrong-broker reason (PR-4 keys crypto /
    // Binance lead-capture off this reason).
    expect(analytics.gateBlocked).toHaveBeenCalledWith('wrong_broker');
    expect(analytics.gateEligible).not.toHaveBeenCalled();
    // PR-4: the statement-origin select and the generic waitlist are offered
    // (we do not know where this file came from).
    expect(screen.getByTestId('preview-origin-select')).toBeInTheDocument();
    expect(screen.getByText("Notify me when it's ready")).toBeInTheDocument();
  });

  it('picking a crypto origin routes the capture to the crypto_exchange list (board #6 instrumentation)', async () => {
    sharedExports.parseTrading212AnnualStatement.mockReturnValueOnce(
      makePdfParseResult({
        brokerMismatch: true,
        sellTrades: [],
        dividends: [],
        distributions: [],
        warnings: ['not a T212 statement'],
      }),
    );
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', fetchMock);
    try {
      const user = userEvent.setup();
      const { container } = renderPage();
      await user.upload(findHiddenFileInput(container), makePdfFile('binance-export.pdf'));

      await waitFor(() => expect(screen.getByTestId('preview-origin-select')).toBeInTheDocument());
      await user.selectOptions(screen.getByTestId('preview-origin-select'), 'binance');
      await user.type(screen.getByRole('textbox', { name: /email/i }), 'crypto@example.com');
      await user.click(screen.getByRole('button', { name: 'Notify me' }));

      await waitFor(() => expect(fetchMock).toHaveBeenCalled());
      const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
      expect(body.topic).toBe('crypto_exchange');
      expect(body.source).toBe('checker:wrong_broker:binance');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('PreviewPage - unreadable file (parse error, PR-4)', () => {
  it('a thrown PDF parse shows the error AND the contact + capture path, and fires gate_blocked_unreadable', async () => {
    // The Anda class: the parse dies before producing a preview. Pre-PR-4 this
    // rendered only a bare error box (no capture, no gate event); now the
    // visitor gets the same blocked-state path as any other fatal reason.
    mockExtractPdfPageTexts.mockRejectedValueOnce(new Error('bad xref'));
    const user = userEvent.setup();
    const { container } = renderPage();
    await user.upload(findHiddenFileInput(container), makePdfFile('corrupt.pdf'));

    await waitFor(() => {
      expect(screen.getByTestId('preview-contact-cta')).toBeInTheDocument();
    });
    // The error box still shows, and no preview/verdict card renders.
    expect(screen.getByText(/bad xref/)).toBeInTheDocument();
    expect(screen.queryByTestId('preview-result')).not.toBeInTheDocument();
    expect(screen.queryByTestId('preview-unlock-cta')).not.toBeInTheDocument();
    // Capture path: origin select + the generic waitlist.
    expect(screen.getByTestId('preview-origin-select')).toBeInTheDocument();
    expect(screen.getByText("Notify me when it's ready")).toBeInTheDocument();
    // Telemetry: the unreadable reason now actually records (it could not fire
    // off the old preview-only effect, because an unreadable file has no preview).
    expect(analytics.gateBlocked).toHaveBeenCalledTimes(1);
    expect(analytics.gateBlocked).toHaveBeenCalledWith('unreadable');
    expect(analytics.previewBlocked).toHaveBeenCalledTimes(1);
    expect(analytics.gateEligible).not.toHaveBeenCalled();
  });

  it('an unreadable CSV on a beta broker keeps that broker waitlist and skips the origin select', async () => {
    sharedExports.parseIbkrCsv.mockImplementationOnce(() => {
      throw new Error('unrecognized section');
    });
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', fetchMock);
    try {
      const user = userEvent.setup();
      const { container } = renderPage();
      await user.click(screen.getByRole('button', { name: /CSV Export/ }));
      await user.click(screen.getByRole('button', { name: /Interactive Brokers/ }));
      await user.upload(findHiddenFileInput(container), makeCsvFile('ibkr.csv'));

      await waitFor(() => expect(screen.getByTestId('preview-contact-cta')).toBeInTheDocument());
      // The broker is already known (a beta IBKR attempt): no origin select, and
      // the capture goes to the IBKR graduation list with the reason as source.
      expect(screen.queryByTestId('preview-origin-select')).not.toBeInTheDocument();
      await user.type(screen.getByRole('textbox', { name: /email/i }), 'ibkr@example.com');
      await user.click(screen.getByRole('button', { name: 'Notify me' }));

      await waitFor(() => expect(fetchMock).toHaveBeenCalled());
      const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
      expect(body.topic).toBe('broker_ibkr');
      expect(body.source).toBe('checker:unreadable');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('PreviewPage - validation-rejected file (telemetry split from unreadable)', () => {
  it('a wrong-extension file fires gate_blocked_rejected_file, not unreadable, and keeps the capture path', async () => {
    // The Binance-.xlsx-on-the-PDF-tab class: validation rejects the file before
    // any parser runs. The blocked STATE (error box + capture) is identical to
    // unreadable; only the telemetry name splits, so the unreadable histogram
    // counts real parse crashes only.
    // applyAccept off: the browser dialog can be bypassed (drag-drop, "All
    // files"), and that is exactly the path validateFile guards.
    const user = userEvent.setup({ applyAccept: false });
    const { container } = renderPage();
    const rejected = new File(['not a statement'], 'export.xlsx', { type: 'application/octet-stream' });
    await user.upload(findHiddenFileInput(container), rejected);

    await waitFor(() => {
      expect(screen.getByTestId('preview-contact-cta')).toBeInTheDocument();
    });
    // No parser ever ran: the rejection happened at validation.
    expect(mockExtractPdfPageTexts).not.toHaveBeenCalled();
    // Same capture surface as the unreadable case (qa-confirmed correct: these
    // ARE the unsupported-statement cohort, e.g. crypto exchange exports).
    expect(screen.getByTestId('preview-origin-select')).toBeInTheDocument();
    expect(screen.queryByTestId('preview-unlock-cta')).not.toBeInTheDocument();
    // The telemetry split under test.
    expect(analytics.gateBlocked).toHaveBeenCalledTimes(1);
    expect(analytics.gateBlocked).toHaveBeenCalledWith('rejected_file');
    expect(analytics.previewBlocked).toHaveBeenCalledTimes(1);
    expect(analytics.gateEligible).not.toHaveBeenCalled();
  });

  it('an over-the-size-cap file also records as rejected_file', async () => {
    const user = userEvent.setup();
    const { container } = renderPage();
    const oversized = makePdfFile('huge.pdf');
    Object.defineProperty(oversized, 'size', { value: 11 * 1024 * 1024 });
    await user.upload(findHiddenFileInput(container), oversized);

    await waitFor(() => {
      expect(analytics.gateBlocked).toHaveBeenCalledWith('rejected_file');
    });
    expect(mockExtractPdfPageTexts).not.toHaveBeenCalled();
  });
});

describe('PreviewPage - analytics', () => {
  it('fires preview_started when a parse begins', async () => {
    const user = userEvent.setup();
    const { container } = renderPage();
    await user.upload(findHiddenFileInput(container), makePdfFile());
    await waitFor(() => {
      expect(analytics.previewStarted).toHaveBeenCalled();
    });
  });
});

describe('PreviewPage - lead capture pre-fill', () => {
  it('contact CTA pre-fills the form with the file name + warnings (like the #24A banner)', async () => {
    // An unsupported year (2022) is a FATAL block, so the contact / lead-capture
    // path renders. (A benign warning on a SUPPORTED year now unlocks instead,
    // per the PR-1 gate refinement, so this case needs a genuinely fatal reason.)
    sharedExports.parseTrading212AnnualStatement.mockReturnValueOnce(
      makePdfParseResult({ year: 2022, warnings: ['Year mis-detected'] }),
    );
    const user = userEvent.setup();
    const { container } = renderPage();
    await user.upload(findHiddenFileInput(container), makePdfFile('mihai.pdf'));

    await waitFor(() => {
      expect(screen.getByTestId('preview-contact-cta')).toBeInTheDocument();
    });
    await user.click(screen.getByTestId('preview-contact-cta'));
    expect(mockNavigate).toHaveBeenCalledWith(
      '/contact',
      expect.objectContaining({
        state: expect.objectContaining({
          topic: 'support',
          subject: 'parseWarning',
          fileName: 'mihai.pdf',
        }),
      }),
    );
  });
});

describe('PreviewPage - CTA scroll-into-view on parse outcome (S9)', () => {
  // With the cookie banner up, the verdict used to render with its pay/contact
  // CTA beneath the fixed overlay (the qa screenshot in SUGGESTIONS S9). The
  // page now scrolls the CTA section into view when a parse outcome lands;
  // combined with the html scroll-padding-bottom rule fed by the banner's
  // published height, the CTA ends up clear of the overlay. Geometry itself is
  // E2E-covered (cookie-banner-occlusion.spec.ts); this pins the trigger.
  let scrollCalls: Array<{ el: Element; opts: unknown }>;
  const originalScrollIntoView = Element.prototype.scrollIntoView;

  beforeEach(() => {
    scrollCalls = [];
    Element.prototype.scrollIntoView = function (opts?: unknown) {
      scrollCalls.push({ el: this as Element, opts });
    } as typeof Element.prototype.scrollIntoView;
  });

  afterEach(() => {
    Element.prototype.scrollIntoView = originalScrollIntoView;
  });

  it('does not scroll on initial render, then scrolls the unlock CTA section into view when a clean parse lands', async () => {
    const user = userEvent.setup();
    const { container } = renderPage();
    expect(scrollCalls).toHaveLength(0);

    await user.upload(findHiddenFileInput(container), makePdfFile());
    await waitFor(() => expect(screen.getByTestId('preview-unlock-cta')).toBeInTheDocument());

    expect(scrollCalls.length).toBeGreaterThan(0);
    const last = scrollCalls[scrollCalls.length - 1];
    expect(last.opts).toEqual({ block: 'nearest' });
    // The scrolled element is the section CARRYING the unlock CTA, so the CTA
    // itself is what lands in view.
    expect(last.el.querySelector('[data-testid="preview-unlock-cta"]')).not.toBeNull();
  });

  it('scrolls the contact CTA section into view on a fatally blocked parse', async () => {
    sharedExports.parseTrading212AnnualStatement.mockReturnValueOnce(
      makePdfParseResult({ year: 2022 }),
    );
    const user = userEvent.setup();
    const { container } = renderPage();

    await user.upload(findHiddenFileInput(container), makePdfFile());
    await waitFor(() => expect(screen.getByTestId('preview-contact-cta')).toBeInTheDocument());

    expect(scrollCalls.length).toBeGreaterThan(0);
    const last = scrollCalls[scrollCalls.length - 1];
    expect(last.opts).toEqual({ block: 'nearest' });
    expect(last.el.querySelector('[data-testid="preview-contact-cta"]')).not.toBeNull();
  });
});
