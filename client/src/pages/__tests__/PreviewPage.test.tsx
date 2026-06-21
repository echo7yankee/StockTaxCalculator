import { describe, it, expect, vi, beforeEach } from 'vitest';
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

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

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
  it('GREEN: trusted broker + supported year shows the unlock CTA to /pricing', async () => {
    const user = userEvent.setup();
    const { container } = renderPage();
    await user.upload(findHiddenFileInput(container), makePdfFile());

    await waitFor(() => {
      expect(screen.getByText('We can process this statement. Unlock your numbers.')).toBeInTheDocument();
    });
    // Trusted broker + 2025 supported.
    expect(screen.getByText('Trading 212: full support.')).toBeInTheDocument();
    expect(screen.getByText('We calculate tax year 2025.')).toBeInTheDocument();
    // Unlock CTA present; routes to /pricing.
    const unlock = screen.getByTestId('preview-unlock-cta');
    expect(unlock).toBeInTheDocument();
    await user.click(unlock);
    expect(mockNavigate).toHaveBeenCalledWith('/pricing');
    // No contact CTA in the green state.
    expect(screen.queryByTestId('preview-contact-cta')).not.toBeInTheDocument();
    expect(analytics.previewClean).toHaveBeenCalledTimes(1);
    expect(analytics.previewBlocked).not.toHaveBeenCalled();
  });

  it('AMBER (unsupported year): no pay button, shows contact CTA + prior-year waitlist', async () => {
    sharedExports.parseTrading212AnnualStatement.mockReturnValueOnce(
      makePdfParseResult({ year: 2023 }),
    );
    const user = userEvent.setup();
    const { container } = renderPage();
    await user.upload(findHiddenFileInput(container), makePdfFile());

    await waitFor(() => {
      expect(screen.getByTestId('support-verdict')).toBeInTheDocument();
    });
    // 2023 is not engine-supported -> prior-year copy + no unlock button.
    expect(screen.getByText(/We do not calculate 2023 yet/)).toBeInTheDocument();
    expect(screen.queryByTestId('preview-unlock-cta')).not.toBeInTheDocument();
    expect(screen.getByTestId('preview-contact-cta')).toBeInTheDocument();
    // Prior-year waitlist capture is offered.
    expect(screen.getByText("Notify me when it's ready")).toBeInTheDocument();
    expect(analytics.previewBlocked).toHaveBeenCalledTimes(1);
    expect(analytics.previewClean).not.toHaveBeenCalled();
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
    sharedExports.parseTrading212AnnualStatement.mockReturnValueOnce(
      makePdfParseResult({ year: 2023, warnings: ['Year mis-detected'] }),
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
