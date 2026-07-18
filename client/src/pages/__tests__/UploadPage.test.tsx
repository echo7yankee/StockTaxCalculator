import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { romaniaTaxConfig } from '@shared/taxRules/romania';
import type { ParseResult } from '@shared/parsers/trading212';
import type { PdfParseResult } from '@shared/parsers/trading212Pdf';
import type { Transaction } from '@shared/types/transaction';

const mockNavigate = vi.fn();
const mockSetUploadData = vi.fn();
const mockExtractPdfPageTexts = vi.fn();
const mockReportParseEvent = vi.fn();

let authState: {
  user: { id: string; email: string; name: string; plan: string } | null;
  loading: boolean;
} = {
  user: { id: 'u1', email: 'maria@example.com', name: 'Maria Popescu', plan: 'paid' },
  loading: false,
};

let searchParamsValue = new URLSearchParams();
const mockSetSearchParams = vi.fn((next: URLSearchParams) => {
  searchParamsValue = new URLSearchParams(next.toString());
});

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useSearchParams: () => [searchParamsValue, mockSetSearchParams],
  };
});

vi.mock('../../contexts/AuthContext', async () => {
  const actual = await vi.importActual<typeof import('../../contexts/AuthContext')>(
    '../../contexts/AuthContext',
  );
  return {
    ...actual,
    useAuth: () => authState,
  };
});

vi.mock('../../contexts/CountryContext', () => ({
  useCountry: () => ({
    countryCode: 'RO',
    countryConfig: romaniaTaxConfig,
    setCountryCode: vi.fn(),
    supportedCountries: [{ code: 'RO', name: 'Romania' }],
  }),
}));

vi.mock('../../contexts/UploadContext', () => ({
  useUpload: () => ({ setUploadData: mockSetUploadData, clearUpload: vi.fn() }),
}));

vi.mock('../../utils/pdfExtractor', () => ({
  extractPdfPageTexts: (file: File) => mockExtractPdfPageTexts(file),
}));

vi.mock('../../lib/parseMonitor', () => ({
  reportParseEvent: (event: unknown) => mockReportParseEvent(event),
}));

vi.mock('../../lib/analytics', () => ({
  analytics: {
    pdfUploaded: vi.fn(),
    csvUploaded: vi.fn(),
    paymentCompleted: vi.fn(),
    paywallSeen: vi.fn(),
  },
}));

// Canned shared-engine outputs. Each helper resets between tests via fnMock fields.
const sharedExports = {
  parseTrading212Csv: vi.fn(),
  parseIbkrCsv: vi.fn(),
  parseRevolutStatement: vi.fn(),
  calculateTaxes: vi.fn(),
  parseTrading212AnnualStatement: vi.fn(),
  calculateTaxesFromPdf: vi.fn(),
  applyBnrRates: vi.fn(),
};

vi.mock('@shared/index', async () => {
  const actual = await vi.importActual<typeof import('@shared/index')>('@shared/index');
  return {
    ...actual,
    parseTrading212Csv: (...args: unknown[]) => sharedExports.parseTrading212Csv(...args),
    parseIbkrCsv: (...args: unknown[]) => sharedExports.parseIbkrCsv(...args),
    parseRevolutStatement: (...args: unknown[]) => sharedExports.parseRevolutStatement(...args),
    calculateTaxes: (...args: unknown[]) => sharedExports.calculateTaxes(...args),
    parseTrading212AnnualStatement: (...args: unknown[]) =>
      sharedExports.parseTrading212AnnualStatement(...args),
    calculateTaxesFromPdf: (...args: unknown[]) => sharedExports.calculateTaxesFromPdf(...args),
    applyBnrRates: (...args: unknown[]) => sharedExports.applyBnrRates(...args),
  };
});

// Papa.parse is callback-shaped; canned parsed rows feed `complete`.
const mockPapaParse = vi.fn();
vi.mock('papaparse', () => ({
  default: { parse: (...args: unknown[]) => mockPapaParse(...args) },
}));

// Revolut .xlsx is read via a lazy-loaded read-excel-file/browser (default export).
const mockReadXlsxFile = vi.fn();
vi.mock('read-excel-file/browser', () => ({
  default: (...args: unknown[]) => mockReadXlsxFile(...args),
}));

import UploadPage from '../UploadPage';
import { analytics } from '../../lib/analytics';
import { writePendingParse, readPendingParse } from '../../lib/pendingParse';

function renderPage(initialPath = '/upload') {
  return render(
    <HelmetProvider>
      <MemoryRouter initialEntries={[initialPath]}>
        <UploadPage />
      </MemoryRouter>
    </HelmetProvider>
  );
}

function makeCsvFile(name = 'transactions.csv'): File {
  return new File(['Action,Time\n'], name, { type: 'text/csv' });
}

function makeXlsxFile(name = 'revolut-account-statement.xlsx'): File {
  return new File([new Uint8Array(64)], name, {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

function makePdfFile(name = 'annual-statement.pdf', size = 1024): File {
  return new File([new Uint8Array(size)], name, { type: 'application/pdf' });
}

function makePdfParseResult(overrides: Partial<PdfParseResult> = {}): PdfParseResult {
  const base: PdfParseResult = {
    year: 2025,
    overview: {
      currency: 'USD',
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
      action: 'buy',
      ticker: 'AAPL',
      isin: 'US0378331005',
      shares: 10,
      price: 150,
      priceCurrency: 'USD',
      transactionDate: '2025-01-15',
      total: 1500,
      totalCurrency: 'USD',
    } as unknown as Transaction,
    {
      action: 'sell',
      ticker: 'AAPL',
      isin: 'US0378331005',
      shares: 5,
      price: 200,
      priceCurrency: 'USD',
      transactionDate: '2025-06-20',
      total: 1000,
      totalCurrency: 'USD',
    } as unknown as Transaction,
    {
      action: 'dividend',
      ticker: 'AAPL',
      isin: 'US0378331005',
      shares: 0,
      price: 0,
      priceCurrency: 'USD',
      transactionDate: '2025-07-01',
      total: 12.5,
      totalCurrency: 'USD',
    } as unknown as Transaction,
  ];
  const base: ParseResult = {
    transactions,
    skipped: [],
    warnings: [],
    structuredWarnings: [],
  } as ParseResult;
  return { ...base, ...overrides };
}

beforeEach(() => {
  vi.clearAllMocks();
  window.sessionStorage.clear();
  searchParamsValue = new URLSearchParams();
  authState = {
    user: { id: 'u1', email: 'maria@example.com', name: 'Maria Popescu', plan: 'paid' },
    loading: false,
  };
  sharedExports.parseTrading212Csv.mockReturnValue(makeCsvParseResult());
  sharedExports.parseIbkrCsv.mockReturnValue(makeCsvParseResult());
  sharedExports.parseRevolutStatement.mockReturnValue(makeCsvParseResult());
  sharedExports.parseTrading212AnnualStatement.mockReturnValue(makePdfParseResult());
  sharedExports.calculateTaxes.mockReturnValue({ taxResult: {}, securities: [] });
  sharedExports.calculateTaxesFromPdf.mockReturnValue({ taxResult: {}, securities: [], warnings: [] });
  sharedExports.applyBnrRates.mockImplementation((txs: Transaction[]) => txs);
  mockExtractPdfPageTexts.mockResolvedValue(['page 1 text', 'page 2 text']);
  mockPapaParse.mockImplementation(
    (_file: File, opts: { complete: (r: { data: unknown[] }) => void }) => {
      opts.complete({ data: [{ Action: 'Market buy', Time: '2025-01-15' }] });
    },
  );
  mockReadXlsxFile.mockResolvedValue([
    ['Date', 'Ticker', 'Type', 'Quantity', 'Price per share', 'Total Amount', 'Currency', 'FX Rate'],
    ['2025-01-15T10:00:00.000Z', 'AAPL', 'BUY - MARKET', '10', '$150', '$1500', 'USD', '1'],
  ]);
});

describe('UploadPage - paywall gating', () => {
  it('renders nothing and redirects to /pricing when no user is logged in', () => {
    authState = { user: null, loading: false };
    const { container } = renderPage();
    expect(container.firstChild).toBeNull();
    expect(mockNavigate).toHaveBeenCalledWith('/pricing', { replace: true });
    expect(analytics.paywallSeen).toHaveBeenCalledTimes(1);
  });

  it('renders nothing and redirects to /pricing when the user is on the free plan', () => {
    authState = {
      user: { id: 'u1', email: 'free@example.com', name: 'Free User', plan: 'free' },
      loading: false,
    };
    const { container } = renderPage();
    expect(container.firstChild).toBeNull();
    expect(mockNavigate).toHaveBeenCalledWith('/pricing', { replace: true });
    expect(analytics.paywallSeen).toHaveBeenCalledTimes(1);
  });

  it('does not redirect or fire paywall_seen while auth is still loading', () => {
    authState = { user: null, loading: true };
    const { container } = renderPage();
    expect(container.firstChild).toBeNull();
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(analytics.paywallSeen).not.toHaveBeenCalled();
  });

  it('does not fire paywall_seen for paid users', () => {
    // Default authState in beforeEach is plan: 'paid'; verifies the inverse case.
    renderPage();
    expect(analytics.paywallSeen).not.toHaveBeenCalled();
  });
});

describe('UploadPage - render', () => {
  it('renders the title, both file-type tabs, and the drop zone for a paid user', () => {
    renderPage();
    expect(screen.getByRole('heading', { name: 'Upload Broker Statement', level: 1 }))
      .toBeInTheDocument();
    expect(screen.getByRole('button', { name: /PDF Statement/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /CSV Export/ })).toBeInTheDocument();
    expect(screen.getByText('Drop your PDF statement here')).toBeInTheDocument();
  });
});

describe('UploadPage - welcome toast', () => {
  it('renders the welcome toast when ?welcome=1 and strips the query', async () => {
    searchParamsValue = new URLSearchParams('welcome=1');
    renderPage('/upload?welcome=1');
    expect(screen.getByText('Welcome to InvesTax!')).toBeInTheDocument();
    // The component clears the `welcome` query on mount via setSearchParams.
    await waitFor(() => {
      expect(mockSetSearchParams).toHaveBeenCalled();
    });
  });

  it('does not render the welcome toast when ?welcome=1 is absent', () => {
    renderPage();
    expect(screen.queryByText('Welcome to InvesTax!')).not.toBeInTheDocument();
  });

  it('fires analytics.paymentCompleted exactly once when ?welcome=1 is present', async () => {
    searchParamsValue = new URLSearchParams('welcome=1');
    renderPage('/upload?welcome=1');
    await waitFor(() => {
      expect(analytics.paymentCompleted).toHaveBeenCalledTimes(1);
    });
  });

  it('does not fire analytics.paymentCompleted when ?welcome=1 is absent', () => {
    renderPage();
    expect(analytics.paymentCompleted).not.toHaveBeenCalled();
  });
});

describe('UploadPage - tab switching', () => {
  it('shows the CSV-specific pre-upload warning when switching to the CSV tab', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: /CSV Export/ }));
    expect(screen.getByText('Drop your CSV export here')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Common stock splits (NVDA, TSLA, etc.) are adjusted automatically. For rarer splits, the PDF tab is the safest option.',
      ),
    ).toBeInTheDocument();
  });
});

function findHiddenFileInput(container: HTMLElement): HTMLInputElement {
  const input = container.querySelector('input[type="file"]') as HTMLInputElement | null;
  if (!input) throw new Error('hidden file input not found');
  return input;
}

describe('UploadPage - drop-zone keyboard accessibility (WCAG 2.1.1 / 4.1.2)', () => {
  it('exposes the drop-zone as a focusable button that opens the file picker on Enter and Space', async () => {
    const user = userEvent.setup();
    const { container } = renderPage();

    // The drop-zone is a button with an accessible name, not a bare clickable div.
    const dropzone = screen.getByRole('button', { name: /upload area/i });
    expect(dropzone).toHaveAttribute('tabindex', '0');

    // It can take keyboard focus.
    dropzone.focus();
    expect(dropzone).toHaveFocus();

    // Activating it via keyboard opens the visually hidden file picker, exactly
    // like a mouse click does: the only path a keyboard-only user has.
    const clickSpy = vi.spyOn(findHiddenFileInput(container), 'click').mockImplementation(() => {});
    await user.keyboard('{Enter}');
    expect(clickSpy).toHaveBeenCalledTimes(1);
    await user.keyboard(' ');
    expect(clickSpy).toHaveBeenCalledTimes(2);
  });
});

describe('UploadPage - PDF upload happy path', () => {
  it('renders the file-info card with parsed sells/dividends/distributions after a PDF upload', async () => {
    const user = userEvent.setup();
    const { container } = renderPage();
    const input = findHiddenFileInput(container);
    const file = makePdfFile('annual-statement.pdf');

    await user.upload(input, file);

    await waitFor(() => {
      expect(screen.getByText('annual-statement.pdf')).toBeInTheDocument();
    });
    expect(screen.getByText('Annual Statement 2025')).toBeInTheDocument();
    // Two sell trades, one dividend, zero distributions per makePdfParseResult().
    expect(screen.getByText('Sell Trades')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument(); // sells
    expect(mockReportParseEvent).toHaveBeenCalledWith(
      expect.objectContaining({ fileType: 'pdf', outcome: 'success' }),
    );
  });

  it('auto-fetches BNR average + daily rates when the PDF account currency is non-local', async () => {
    // fetchBnrRate fetches the annual average (dividends) and the daily map
    // (per-date capital gains, backlog #21) in parallel. Fresh Response per call
    // since a Response body can only be read once.
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({ rate: 4.55, rates: { '2025-06-01': 4.6 }, count: 1 }), {
          status: 200,
        }),
      ),
    );
    const user = userEvent.setup();
    const { container } = renderPage();
    await user.upload(findHiddenFileInput(container), makePdfFile());

    await waitFor(() => {
      const urls = fetchSpy.mock.calls.map((c) => String(c[0]));
      expect(urls).toContain('/api/exchange-rates/2025/average?currency=USD');
      expect(urls).toContain('/api/exchange-rates/2025/daily?currency=USD');
    });
  });

  it('renders an error banner when the PDF extractor throws', async () => {
    mockExtractPdfPageTexts.mockRejectedValueOnce(new Error('Corrupt PDF'));
    const user = userEvent.setup();
    const { container } = renderPage();
    await user.upload(findHiddenFileInput(container), makePdfFile());

    await waitFor(() => {
      expect(screen.getByText(/Failed to parse PDF.*Corrupt PDF/)).toBeInTheDocument();
    });
    expect(mockReportParseEvent).toHaveBeenCalledWith(
      expect.objectContaining({ fileType: 'pdf', outcome: 'error' }),
    );
  });

  it('renders a warnings panel when the parser surfaces warnings', async () => {
    sharedExports.parseTrading212AnnualStatement.mockReturnValueOnce(
      makePdfParseResult({ warnings: ['Sell total mismatch by 1.23'] }),
    );
    const user = userEvent.setup();
    const { container } = renderPage();
    await user.upload(findHiddenFileInput(container), makePdfFile());

    await waitFor(() => {
      expect(screen.getByText('Sell total mismatch by 1.23')).toBeInTheDocument();
    });
  });
});

describe('UploadPage - CSV upload happy path', () => {
  it('switches to the CSV tab, parses the upload, and shows buy/sell/dividend counts', async () => {
    const user = userEvent.setup();
    const { container } = renderPage();
    await user.click(screen.getByRole('button', { name: /CSV Export/ }));
    await user.upload(findHiddenFileInput(container), makeCsvFile());

    await waitFor(() => {
      expect(screen.getByText('transactions.csv')).toBeInTheDocument();
    });
    expect(screen.getByText('Buys')).toBeInTheDocument();
    expect(screen.getByText('Sells')).toBeInTheDocument();
    expect(screen.getByText('Dividends')).toBeInTheDocument();
  });

  it('renders an error banner when the CSV has no data rows', async () => {
    mockPapaParse.mockImplementationOnce(
      (_file: File, opts: { complete: (r: { data: unknown[] }) => void }) => {
        opts.complete({ data: [] });
      },
    );
    const user = userEvent.setup();
    const { container } = renderPage();
    await user.click(screen.getByRole('button', { name: /CSV Export/ }));
    await user.upload(findHiddenFileInput(container), makeCsvFile());

    await waitFor(() => {
      expect(screen.getByText('CSV file has no data rows.')).toBeInTheDocument();
    });
    expect(mockReportParseEvent).toHaveBeenCalledWith(
      expect.objectContaining({ fileType: 'csv', outcome: 'error' }),
    );
  });

  it('flags the missing-history block when sells exceed buys for at least one security', async () => {
    sharedExports.parseTrading212Csv.mockReturnValueOnce(
      makeCsvParseResult({
        transactions: [
          {
            action: 'sell',
            ticker: 'AAPL',
            isin: 'US0378331005',
            shares: 10,
            price: 200,
            priceCurrency: 'USD',
            transactionDate: '2025-06-20',
            total: 2000,
            totalCurrency: 'USD',
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
  });
});

describe('UploadPage - file-type and size guards', () => {
  it('rejects an upload that does not match the active tab (txt extension)', async () => {
    const user = userEvent.setup({ applyAccept: false });
    const { container } = renderPage();
    const file = new File(['hi'], 'notes.txt', { type: 'text/plain' });
    await user.upload(findHiddenFileInput(container), file);

    await waitFor(() => {
      expect(screen.getByText('Please upload a CSV or PDF file.')).toBeInTheDocument();
    });
  });

  it('rejects a CSV when the PDF tab is active', async () => {
    const user = userEvent.setup({ applyAccept: false });
    const { container } = renderPage();
    // PDF tab is the default; uploading a .csv hits the tab-mismatch guard.
    await user.upload(findHiddenFileInput(container), makeCsvFile());
    await waitFor(() => {
      expect(screen.getByText('Please upload a CSV or PDF file.')).toBeInTheDocument();
    });
  });

  it('rejects a file larger than 10MB', async () => {
    const user = userEvent.setup();
    const { container } = renderPage();
    // 11MB PDF.
    const big = makePdfFile('huge.pdf', 11 * 1024 * 1024);
    await user.upload(findHiddenFileInput(container), big);
    await waitFor(() => {
      expect(screen.getByText('File is too large (max 10MB).')).toBeInTheDocument();
    });
  });
});

describe('UploadPage - preview clear', () => {
  it('clearing the preview restores the drop zone', async () => {
    const user = userEvent.setup();
    const { container } = renderPage();
    await user.upload(findHiddenFileInput(container), makePdfFile());

    await waitFor(() => {
      expect(screen.getByText('annual-statement.pdf')).toBeInTheDocument();
    });
    // The single icon-only button next to the filename is the clear (X) button.
    const buttons = screen.getAllByRole('button');
    const clearBtn = buttons.find(
      (b) => b.querySelector('svg.lucide-x') !== null,
    );
    expect(clearBtn).toBeDefined();
    await user.click(clearBtn!);
    expect(screen.queryByText('annual-statement.pdf')).not.toBeInTheDocument();
    expect(screen.getByText('Drop your PDF statement here')).toBeInTheDocument();
  });
});

describe('UploadPage - Calculate Taxes flow', () => {
  it('navigates to /results with the PDF tax result on the happy path', async () => {
    sharedExports.calculateTaxesFromPdf.mockReturnValueOnce({
      taxResult: { totals: { totalTaxOwed: 1234 } },
      securities: [{ ticker: 'AAPL' }],
      warnings: [],
      structuredWarnings: [],
    });
    const user = userEvent.setup();
    const { container } = renderPage();
    await user.upload(findHiddenFileInput(container), makePdfFile());

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Calculate Taxes/ })).toBeInTheDocument(),
    );
    await user.click(screen.getByRole('button', { name: /Calculate Taxes/ }));

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/results'));
    expect(mockSetUploadData).toHaveBeenCalledWith(
      expect.objectContaining({
        fileName: 'annual-statement.pdf',
        taxYear: 2025,
        taxResult: expect.objectContaining({
          totals: expect.objectContaining({ totalTaxOwed: 1234 }),
        }),
      }),
    );
  });

  it('computes a supported prior year (PDF 2024): Calculate enabled, engine gets taxYear 2024', async () => {
    // The prior-year flip lets a paid user compute a 2024 statement. Calculate is
    // enabled, no unsupported-year note, and the engine + results carry taxYear 2024.
    sharedExports.parseTrading212AnnualStatement.mockReturnValueOnce(
      makePdfParseResult({ year: 2024 }),
    );
    sharedExports.calculateTaxesFromPdf.mockReturnValueOnce({
      taxResult: { totals: { totalTaxOwed: 500 } },
      securities: [],
      warnings: [],
      structuredWarnings: [],
    });
    const user = userEvent.setup();
    const { container } = renderPage();
    await user.upload(findHiddenFileInput(container), makePdfFile());

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Calculate Taxes/ })).toBeInTheDocument(),
    );
    expect(screen.queryByTestId('year-unsupported-note')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Calculate Taxes/ })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: /Calculate Taxes/ }));

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/results'));
    expect(mockSetUploadData).toHaveBeenCalledWith(
      expect.objectContaining({ taxYear: 2024 }),
    );
  });

  it('blocks an out-of-scope PDF year (2022, pre-CMP): Calculate disabled, note shown, engine never runs', async () => {
    // A pre-2023 statement would silently fall back to 2025 rates via
    // getTaxConfigForYear, so the year guard disables Calculate and explains.
    sharedExports.parseTrading212AnnualStatement.mockReturnValueOnce(
      makePdfParseResult({ year: 2022 }),
    );
    const user = userEvent.setup();
    const { container } = renderPage();
    await user.upload(findHiddenFileInput(container), makePdfFile());

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Calculate Taxes/ })).toBeInTheDocument(),
    );
    expect(screen.getByTestId('year-unsupported-note')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Calculate Taxes/ })).toBeDisabled();
    expect(sharedExports.calculateTaxesFromPdf).not.toHaveBeenCalled();
  });

  it('blocks Calculate when the PDF exchange rate is cleared to 0 (would zero out the RON result)', async () => {
    // Regression: clearing the rate input set exchangeRate to 0 and the Calculate
    // button had no rate>0 guard, so finalizePdf ran the engine at rate 0 -> an
    // all-zero RON result. Keep the BNR fetch from repopulating the rate so we can
    // clear it deterministically.
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('no network'));
    const user = userEvent.setup();
    const { container } = renderPage();
    await user.upload(findHiddenFileInput(container), makePdfFile());

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Calculate Taxes/ })).toBeInTheDocument(),
    );
    // The USD -> RON rate input is present and Calculate is enabled at the default rate.
    const rateInput = screen.getByRole('spinbutton');
    expect(screen.getByRole('button', { name: /Calculate Taxes/ })).toBeEnabled();

    // Clearing the rate sets it to 0: Calculate disables, the note shows, engine never runs.
    await user.clear(rateInput);
    expect(screen.getByTestId('rate-required-note')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Calculate Taxes/ })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: /Calculate Taxes/ }));
    expect(sharedExports.calculateTaxesFromPdf).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalledWith('/results');
  });

  it('passes the per-date daily BNR map to the engine for a single-currency PDF (backlog #21)', async () => {
    const dailyMap = { '2025-06-01': 4.7, '2025-07-15': 4.3 };
    vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({ rate: 4.46, rates: dailyMap, count: 2 }), { status: 200 }),
      ),
    );
    // Trades share the USD overview currency, so the engine takes the per-row
    // (per-trade-date) branch and the daily map is supplied as the 4th arg.
    sharedExports.parseTrading212AnnualStatement.mockReturnValueOnce(
      makePdfParseResult({
        sellTrades: [
          { ticker: 'AAPL', isin: 'US0378331005', executionTime: '01.06.2025', transactionCurrency: 'USD' },
          { ticker: 'MSFT', isin: 'US5949181045', executionTime: '15.07.2025', transactionCurrency: 'USD' },
        ] as unknown as PdfParseResult['sellTrades'],
      }),
    );
    const user = userEvent.setup();
    const { container } = renderPage();
    await user.upload(findHiddenFileInput(container), makePdfFile());

    // Wait until the daily map has loaded into state (rate-source note flips to
    // "per-date + average") so Calculate sees the populated map.
    await waitFor(() => expect(screen.getByText(/per-date \+ average/)).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /Calculate Taxes/ }));
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/results'));

    const lastCall = sharedExports.calculateTaxesFromPdf.mock.calls.at(-1);
    expect(lastCall?.[3]).toEqual(dailyMap);
  });

  it('withholds the daily map for a mixed-currency PDF (keeps the annual-average path)', async () => {
    const dailyMap = { '2025-06-01': 4.7 };
    vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({ rate: 4.46, rates: dailyMap, count: 1 }), { status: 200 }),
      ),
    );
    // Mixed USD + EUR trades do not all match the USD overview, so the engine
    // uses overview * annual-rate and the map is withheld (4th arg undefined).
    sharedExports.parseTrading212AnnualStatement.mockReturnValueOnce(
      makePdfParseResult({
        sellTrades: [
          { ticker: 'AAPL', isin: 'US0378331005', executionTime: '01.06.2025', transactionCurrency: 'USD' },
          { ticker: 'ASML', isin: 'NL0010273215', executionTime: '15.07.2025', transactionCurrency: 'EUR' },
        ] as unknown as PdfParseResult['sellTrades'],
      }),
    );
    const user = userEvent.setup();
    const { container } = renderPage();
    await user.upload(findHiddenFileInput(container), makePdfFile());
    await waitFor(() => expect(screen.getByText(/per-date \+ average/)).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /Calculate Taxes/ }));
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/results'));

    const lastCall = sharedExports.calculateTaxesFromPdf.mock.calls.at(-1);
    expect(lastCall?.[3]).toBeUndefined();
  });

  it('merges parser + engine warnings into parseWarnings on the PDF path', async () => {
    sharedExports.parseTrading212AnnualStatement.mockReturnValueOnce(
      makePdfParseResult({ warnings: ['Parser warning A'] }),
    );
    sharedExports.calculateTaxesFromPdf.mockReturnValueOnce({
      taxResult: { totals: { totalTaxOwed: 0 } },
      securities: [],
      warnings: ['Sign mismatch ...', 'Magnitude mismatch ...'],
    });
    const user = userEvent.setup();
    const { container } = renderPage();
    await user.upload(findHiddenFileInput(container), makePdfFile());

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Calculate Taxes/ })).toBeInTheDocument(),
    );
    await user.click(screen.getByRole('button', { name: /Calculate Taxes/ }));

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/results'));
    expect(mockSetUploadData).toHaveBeenCalledWith(
      expect.objectContaining({
        parseWarnings: ['Parser warning A', 'Sign mismatch ...', 'Magnitude mismatch ...'],
      }),
    );
  });

  it('Calculate Taxes is disabled when the CSV missing-history guard fires', async () => {
    sharedExports.parseTrading212Csv.mockReturnValueOnce(
      makeCsvParseResult({
        transactions: [
          {
            action: 'sell',
            ticker: 'AAPL',
            isin: 'US0378331005',
            shares: 5,
            price: 100,
            priceCurrency: 'USD',
            transactionDate: '2025-06-20',
            total: 500,
            totalCurrency: 'USD',
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
    const calcBtn = screen.getByRole('button', { name: /Calculate Taxes/ });
    expect(calcBtn).toBeDisabled();
  });

  it('applies a known stock split to a held-across-split Trading212 CSV (backlog #2)', async () => {
    // Bought 1 NVDA before the 2024-06-10 10:1 split, sold 10 after. Without the
    // split fix this looks like an oversell (the missing-history guard would fire);
    // injecting 9 zero-cost shares reconciles it and surfaces a transparency note.
    sharedExports.parseTrading212Csv.mockReturnValueOnce(
      makeCsvParseResult({
        transactions: [
          {
            action: 'buy', ticker: 'NVDA', isin: 'US67066G1040', shares: 1, price: 1200,
            priceCurrency: 'USD', transactionDate: '2024-01-15', total: 1200, totalCurrency: 'USD',
          } as unknown as Transaction,
          {
            action: 'sell', ticker: 'NVDA', isin: 'US67066G1040', shares: 10, price: 130,
            priceCurrency: 'USD', transactionDate: '2024-09-20', total: 1300, totalCurrency: 'USD',
          } as unknown as Transaction,
        ],
      }),
    );
    const user = userEvent.setup();
    const { container } = renderPage();
    await user.click(screen.getByRole('button', { name: /CSV Export/ }));
    await user.upload(findHiddenFileInput(container), makeCsvFile());

    await waitFor(() => {
      expect(
        screen.getByText('Adjusted cost basis for known stock split(s): NVDA 10:1 (Jun 2024).'),
      ).toBeInTheDocument();
    });
    // The injected shares quiet the missing-history false positive, so the user
    // can proceed.
    expect(screen.queryByText('Incomplete Transaction History Detected')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Calculate Taxes/ })).toBeEnabled();
  });

  it('does NOT apply the split table to a non-Trading212 broker (IBKR reports its own splits)', async () => {
    // Same NVDA-across-split shape, but IBKR statements carry split events, so the
    // table must not be consulted (or it would double-count).
    sharedExports.parseIbkrCsv.mockReturnValueOnce(
      makeCsvParseResult({
        transactions: [
          {
            action: 'buy', ticker: 'NVDA', isin: 'US67066G1040', shares: 1, price: 1200,
            priceCurrency: 'USD', transactionDate: '2024-01-15', total: 1200, totalCurrency: 'USD',
          } as unknown as Transaction,
          {
            action: 'sell', ticker: 'NVDA', isin: 'US67066G1040', shares: 1, price: 1300,
            priceCurrency: 'USD', transactionDate: '2024-09-20', total: 1300, totalCurrency: 'USD',
          } as unknown as Transaction,
        ],
      }),
    );
    const user = userEvent.setup();
    const { container } = renderPage();
    await user.click(screen.getByRole('button', { name: /CSV Export/ }));
    await user.click(screen.getByRole('button', { name: /Interactive Brokers/ }));
    await user.upload(findHiddenFileInput(container), makeCsvFile('ibkr-activity.csv'));

    await waitFor(() => {
      expect(screen.getByText('ibkr-activity.csv')).toBeInTheDocument();
    });
    expect(screen.queryByText(/Adjusted cost basis for known stock split/)).not.toBeInTheDocument();
  });

  it('fetches BNR rates for every foreign currency in a mixed-currency CSV (backlog #5)', async () => {
    // Fresh Response per call: finalizeCsv reads daily + average per currency in
    // parallel and a Response body can only be read once.
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({ rates: { '2025-03-15': 4.9 }, count: 1, rate: 4.9 }), {
          status: 200,
        }),
      ),
    );
    // Two buys in different currencies (no sells, so the missing-history guard stays quiet).
    sharedExports.parseTrading212Csv.mockReturnValueOnce(
      makeCsvParseResult({
        transactions: [
          {
            action: 'buy',
            ticker: 'AAPL',
            isin: 'US0378331005',
            shares: 10,
            price: 100,
            priceCurrency: 'USD',
            transactionDate: '2025-03-15',
            total: 1000,
            totalCurrency: 'USD',
          } as unknown as Transaction,
          {
            action: 'buy',
            ticker: 'VOD',
            isin: 'GB00BH4HKS39',
            shares: 10,
            price: 40,
            priceCurrency: 'GBP',
            transactionDate: '2025-03-15',
            total: 400,
            totalCurrency: 'GBP',
          } as unknown as Transaction,
        ],
      }),
    );
    const user = userEvent.setup();
    const { container } = renderPage();
    await user.click(screen.getByRole('button', { name: /CSV Export/ }));
    await user.upload(findHiddenFileInput(container), makeCsvFile());

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Calculate Taxes/ })).toBeInTheDocument(),
    );
    await user.click(screen.getByRole('button', { name: /Calculate Taxes/ }));

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/results'));

    // Both currencies are fetched (daily + average each), not just the dominant one.
    const fetchedUrls = fetchSpy.mock.calls.map((c) => String(c[0]));
    expect(fetchedUrls).toContain('/api/exchange-rates/2025/daily?currency=USD');
    expect(fetchedUrls).toContain('/api/exchange-rates/2025/average?currency=USD');
    expect(fetchedUrls).toContain('/api/exchange-rates/2025/daily?currency=GBP');
    expect(fetchedUrls).toContain('/api/exchange-rates/2025/average?currency=GBP');
  });

  it('partial currency failure: converts the currency that fetched, withholds the failed one + warning (backlog #25)', async () => {
    // USD daily/average succeed; GBP daily fails (502). The statement must NOT
    // fully degrade: USD converts at BNR, GBP is withheld from the map (engine
    // broker-rate fallback in calculateTaxes), and the status names GBP.
    vi.spyOn(globalThis, 'fetch').mockImplementation((url) => {
      const u = String(url);
      if (u.includes('currency=GBP') && u.includes('/daily')) {
        return Promise.resolve(new Response('upstream error', { status: 502 }));
      }
      return Promise.resolve(
        new Response(JSON.stringify({ rates: { '2025-03-15': 4.9 }, count: 1, rate: 4.9 }), { status: 200 }),
      );
    });
    sharedExports.parseTrading212Csv.mockReturnValueOnce(
      makeCsvParseResult({
        transactions: [
          { action: 'buy', ticker: 'AAPL', isin: 'US0378331005', shares: 10, price: 100, priceCurrency: 'USD', transactionDate: '2025-03-15', total: 1000, totalCurrency: 'USD' } as unknown as Transaction,
          { action: 'buy', ticker: 'VOD', isin: 'GB00BH4HKS39', shares: 10, price: 40, priceCurrency: 'GBP', transactionDate: '2025-03-15', total: 400, totalCurrency: 'GBP' } as unknown as Transaction,
        ],
      }),
    );
    const user = userEvent.setup();
    const { container } = renderPage();
    await user.click(screen.getByRole('button', { name: /CSV Export/ }));
    await user.upload(findHiddenFileInput(container), makeCsvFile());
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Calculate Taxes/ })).toBeInTheDocument(),
    );
    await user.click(screen.getByRole('button', { name: /Calculate Taxes/ }));
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/results'));

    // applyBnrRates received only the currency that fetched; GBP was withheld.
    const ratesArg = sharedExports.applyBnrRates.mock.calls.at(-1)?.[1] as Record<string, unknown>;
    expect(Object.keys(ratesArg)).toEqual(['USD']);
    // The partial status names the failed currency (yellow note, not a hard-stop).
    expect(screen.getByText(/For GBP, the broker rate was used/)).toBeInTheDocument();
  });

  it('all currencies fail: full broker-rate fallback (empty BNR map) + warning', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((url) => {
      const u = String(url);
      if (u.includes('/daily')) return Promise.resolve(new Response('err', { status: 502 }));
      return Promise.resolve(new Response(JSON.stringify({ rate: 4.9 }), { status: 200 }));
    });
    sharedExports.parseTrading212Csv.mockReturnValueOnce(
      makeCsvParseResult({
        transactions: [
          { action: 'buy', ticker: 'AAPL', isin: 'US0378331005', shares: 10, price: 100, priceCurrency: 'USD', transactionDate: '2025-03-15', total: 1000, totalCurrency: 'USD' } as unknown as Transaction,
        ],
      }),
    );
    const user = userEvent.setup();
    const { container } = renderPage();
    await user.click(screen.getByRole('button', { name: /CSV Export/ }));
    await user.upload(findHiddenFileInput(container), makeCsvFile());
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Calculate Taxes/ })).toBeInTheDocument(),
    );
    await user.click(screen.getByRole('button', { name: /Calculate Taxes/ }));
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/results'));

    const ratesArg = sharedExports.applyBnrRates.mock.calls.at(-1)?.[1] as Record<string, unknown>;
    expect(Object.keys(ratesArg)).toEqual([]);
    expect(screen.getByText(/Could not fetch BNR rates/)).toBeInTheDocument();
  });
});

describe('UploadPage - year-round carry-forward (board #3)', () => {
  // Route both the BNR-rate fetches and the opening-positions fetch off one spy.
  // `openingPositions` seeds the /api/uploads/opening-positions response; every
  // other URL returns a BNR-shaped body so the rate path is unaffected.
  function mockFetch(openingPositions: {
    year: number | null;
    positions: Array<Record<string, unknown>>;
  }) {
    return vi.spyOn(globalThis, 'fetch').mockImplementation((url) => {
      const u = String(url);
      if (u.includes('/api/uploads/opening-positions')) {
        return Promise.resolve(new Response(JSON.stringify(openingPositions), { status: 200 }));
      }
      return Promise.resolve(
        new Response(JSON.stringify({ rates: {}, count: 0, rate: 4.9 }), { status: 200 }),
      );
    });
  }

  async function runCsvCalculate() {
    const user = userEvent.setup();
    const { container } = renderPage();
    await user.click(screen.getByRole('button', { name: /CSV Export/ }));
    await user.upload(findHiddenFileInput(container), makeCsvFile());
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Calculate Taxes/ })).toBeInTheDocument(),
    );
    await user.click(screen.getByRole('button', { name: /Calculate Taxes/ }));
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/results'));
  }

  it('requests opening positions for the selected year on the CSV path', async () => {
    const fetchSpy = mockFetch({ year: null, positions: [] });
    await runCsvCalculate();
    const urls = fetchSpy.mock.calls.map((c) => String(c[0]));
    expect(urls).toContain('/api/uploads/opening-positions?year=2025');
  });

  it('excludes a carried security whose BUY is in the file (double-count guard)', async () => {
    // Default CSV has an AAPL buy. A carried AAPL must NOT be seeded, or the
    // engine would count the shares twice. Result: no positions passed, no note.
    mockFetch({
      year: 2024,
      positions: [
        { isin: 'US0378331005', ticker: 'AAPL', securityName: 'Apple Inc.', shares: 5, costPerShareLocal: 300 },
      ],
    });
    await runCsvCalculate();

    const lastCall = sharedExports.calculateTaxes.mock.calls.at(-1);
    expect(lastCall?.[4]).toEqual([]);
    expect(screen.queryByTestId('carry-forward-note')).not.toBeInTheDocument();
  });

  it('keeps a carried security that is only SOLD in the file and passes it to the engine', async () => {
    // A CSV that only SELLS MSFT (no MSFT buy), plus a prior-year buy of an
    // unrelated security so the file spans >1 year and the single-year
    // missing-history guard stays quiet (Calculate reachable). The carried MSFT
    // position must be seeded so the sell gets its real prior-year cost basis.
    sharedExports.parseTrading212Csv.mockReturnValueOnce(
      makeCsvParseResult({
        transactions: [
          {
            action: 'buy', ticker: 'VOO', isin: 'US9229083632', shares: 2, price: 400,
            priceCurrency: 'USD', transactionDate: '2024-02-01', total: 800, totalCurrency: 'USD',
          } as unknown as Transaction,
          {
            action: 'sell', ticker: 'MSFT', isin: 'US5949181045', shares: 4, price: 400,
            priceCurrency: 'USD', transactionDate: '2025-06-20', total: 1600, totalCurrency: 'USD',
          } as unknown as Transaction,
        ],
      }),
    );
    mockFetch({
      year: 2024,
      positions: [
        { isin: 'US5949181045', ticker: 'MSFT', securityName: 'Microsoft', shares: 10, costPerShareLocal: 250 },
      ],
    });
    await runCsvCalculate();

    const lastCall = sharedExports.calculateTaxes.mock.calls.at(-1);
    expect(lastCall?.[4]).toEqual([
      { isin: 'US5949181045', ticker: 'MSFT', securityName: 'Microsoft', shares: 10, costPerShareLocal: 250 },
    ]);
  });

  it('renders the transparency note only when a position was actually carried', async () => {
    sharedExports.parseTrading212Csv.mockReturnValueOnce(
      makeCsvParseResult({
        transactions: [
          {
            action: 'buy', ticker: 'VOO', isin: 'US9229083632', shares: 2, price: 400,
            priceCurrency: 'USD', transactionDate: '2024-02-01', total: 800, totalCurrency: 'USD',
          } as unknown as Transaction,
          {
            action: 'sell', ticker: 'MSFT', isin: 'US5949181045', shares: 4, price: 400,
            priceCurrency: 'USD', transactionDate: '2025-06-20', total: 1600, totalCurrency: 'USD',
          } as unknown as Transaction,
        ],
      }),
    );
    mockFetch({
      year: 2024,
      positions: [
        { isin: 'US5949181045', ticker: 'MSFT', securityName: 'Microsoft', shares: 10, costPerShareLocal: 250 },
      ],
    });
    await runCsvCalculate();

    expect(screen.getByTestId('carry-forward-note')).toBeInTheDocument();
    expect(
      screen.getByText('Carried 1 position(s) from 2024 (cost basis from your previous filing).'),
    ).toBeInTheDocument();
  });

  it('does not render the note when there are no carried positions', async () => {
    mockFetch({ year: null, positions: [] });
    await runCsvCalculate();

    const lastCall = sharedExports.calculateTaxes.mock.calls.at(-1);
    expect(lastCall?.[4]).toEqual([]);
    expect(screen.queryByTestId('carry-forward-note')).not.toBeInTheDocument();
  });

  it('falls back to no seeding when the opening-positions fetch fails (calc still runs)', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((url) => {
      const u = String(url);
      if (u.includes('/api/uploads/opening-positions')) {
        return Promise.reject(new Error('network down'));
      }
      return Promise.resolve(
        new Response(JSON.stringify({ rates: {}, count: 0, rate: 4.9 }), { status: 200 }),
      );
    });
    await runCsvCalculate();

    // Calc still runs, seeded with []; behaviour identical to the no-carry path.
    const lastCall = sharedExports.calculateTaxes.mock.calls.at(-1);
    expect(lastCall?.[4]).toEqual([]);
    expect(screen.queryByTestId('carry-forward-note')).not.toBeInTheDocument();
    expect(mockSetUploadData).toHaveBeenCalled();
  });

  it('falls back to no seeding when the endpoint returns a non-ok response', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((url) => {
      const u = String(url);
      if (u.includes('/api/uploads/opening-positions')) {
        return Promise.resolve(new Response('server error', { status: 500 }));
      }
      return Promise.resolve(
        new Response(JSON.stringify({ rates: {}, count: 0, rate: 4.9 }), { status: 200 }),
      );
    });
    await runCsvCalculate();

    const lastCall = sharedExports.calculateTaxes.mock.calls.at(-1);
    expect(lastCall?.[4]).toEqual([]);
    expect(screen.queryByTestId('carry-forward-note')).not.toBeInTheDocument();
  });
});

describe('UploadPage - carry-forward guard-relax (board #3 PR-3)', () => {
  // Route the opening-positions fetch (coverage check + finalizeCsv) and the BNR
  // fetches off one spy. openingPositions seeds the /api/uploads/opening-positions
  // body; every other URL returns a BNR-shaped body so the rate path is unaffected.
  function mockFetch(openingPositions: {
    year: number | null;
    positions: Array<Record<string, unknown>>;
  }) {
    return vi.spyOn(globalThis, 'fetch').mockImplementation((url) => {
      const u = String(url);
      if (u.includes('/api/uploads/opening-positions')) {
        return Promise.resolve(new Response(JSON.stringify(openingPositions), { status: 200 }));
      }
      return Promise.resolve(
        new Response(JSON.stringify({ rates: {}, count: 0, rate: 4.9 }), { status: 200 }),
      );
    });
  }

  // A single-year (2025-only) CSV that SELLS 10 AAPL it never bought -> the
  // missing-history guard fires (deficit: AAPL 10). Carry-forward is the fix.
  function singleYearOversellCsv() {
    return makeCsvParseResult({
      transactions: [
        {
          action: 'sell', ticker: 'AAPL', isin: 'US0378331005', shares: 10, price: 200,
          priceCurrency: 'USD', transactionDate: '2025-06-20', total: 2000, totalCurrency: 'USD',
        } as unknown as Transaction,
      ],
    });
  }

  // Upload a single-year oversell CSV without asserting on the (transient) block.
  // In the covered case the block appears then disappears once the coverage effect
  // resolves, so callers that need to observe the block should assert it themselves.
  async function uploadSingleYearOversell() {
    const user = userEvent.setup();
    const { container } = renderPage();
    await user.click(screen.getByRole('button', { name: /CSV Export/ }));
    await user.upload(findHiddenFileInput(container), makeCsvFile());
    // Wait until the CSV preview has rendered (the Calculate button exists).
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Calculate Taxes/ })).toBeInTheDocument();
    });
    return user;
  }

  it('(a) fully-covered: relaxes the block, enables Calculate, shows the covered note', async () => {
    sharedExports.parseTrading212Csv.mockReturnValueOnce(singleYearOversellCsv());
    // Prior 2024 filing holds 12 AAPL, covering the 10-share deficit.
    mockFetch({
      year: 2024,
      positions: [
        { isin: 'US0378331005', ticker: 'AAPL', securityName: 'Apple Inc.', shares: 12, costPerShareLocal: 300 },
      ],
    });
    await uploadSingleYearOversell();

    // The coverage check resolves -> the red block is dropped, the neutral covered
    // note appears, and Calculate becomes enabled.
    await waitFor(() => {
      expect(screen.getByTestId('carry-forward-covers-note')).toBeInTheDocument();
    });
    expect(screen.queryByText('Incomplete Transaction History Detected')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Calculate Taxes/ })).toBeEnabled();
  });

  it('(a) fully-covered: Calculate seeds the carried position and surfaces it to Results', async () => {
    sharedExports.parseTrading212Csv.mockReturnValueOnce(singleYearOversellCsv());
    mockFetch({
      year: 2024,
      positions: [
        { isin: 'US0378331005', ticker: 'AAPL', securityName: 'Apple Inc.', shares: 12, costPerShareLocal: 300 },
      ],
    });
    const user = await uploadSingleYearOversell();
    await waitFor(() => {
      expect(screen.getByTestId('carry-forward-covers-note')).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: /Calculate Taxes/ }));
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/results'));

    // Engine seeded with the carried AAPL (the sold-but-not-bought security).
    const lastCall = sharedExports.calculateTaxes.mock.calls.at(-1);
    expect(lastCall?.[4]).toEqual([
      { isin: 'US0378331005', ticker: 'AAPL', securityName: 'Apple Inc.', shares: 12, costPerShareLocal: 300 },
    ]);
    // Results receives the carried positions + source year.
    expect(mockSetUploadData).toHaveBeenCalledWith(
      expect.objectContaining({
        carriedPositions: [
          { isin: 'US0378331005', ticker: 'AAPL', securityName: 'Apple Inc.', shares: 12, costPerShareLocal: 300 },
        ],
        carryForwardYear: 2024,
      }),
    );
  });

  it('(a) one fetch, one result: Calculate reuses the coverage-effect fetch (no second request)', async () => {
    // The reuse guard keys on the REQUESTED tax year (2025), not the response's
    // prior year (2024). This guards the "one fetch, one result" design: when the
    // coverage effect already fetched opening-positions for the year Calculate
    // will file, finalizeCsv must NOT issue a second identical request.
    sharedExports.parseTrading212Csv.mockReturnValueOnce(singleYearOversellCsv());
    const fetchSpy = mockFetch({
      year: 2024,
      positions: [
        { isin: 'US0378331005', ticker: 'AAPL', securityName: 'Apple Inc.', shares: 12, costPerShareLocal: 300 },
      ],
    });
    const user = await uploadSingleYearOversell();
    await waitFor(() => {
      expect(screen.getByTestId('carry-forward-covers-note')).toBeInTheDocument();
    });

    // Exactly one opening-positions request so far (from the coverage effect).
    const openingCallsBefore = fetchSpy.mock.calls.filter((c) =>
      String(c[0]).includes('/api/uploads/opening-positions'),
    );
    expect(openingCallsBefore).toHaveLength(1);
    expect(String(openingCallsBefore[0][0])).toBe('/api/uploads/opening-positions?year=2025');

    await user.click(screen.getByRole('button', { name: /Calculate Taxes/ }));
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/results'));

    // Still exactly one: finalizeCsv reused the stash instead of re-fetching.
    const openingCallsAfter = fetchSpy.mock.calls.filter((c) =>
      String(c[0]).includes('/api/uploads/opening-positions'),
    );
    expect(openingCallsAfter).toHaveLength(1);
    // The reused stash still produced the correct engine seeding.
    const lastCall = sharedExports.calculateTaxes.mock.calls.at(-1);
    expect(lastCall?.[4]).toEqual([
      { isin: 'US0378331005', ticker: 'AAPL', securityName: 'Apple Inc.', shares: 12, costPerShareLocal: 300 },
    ]);
  });

  it('(b) partially-covered: block stays, Calculate disabled, no covered note', async () => {
    sharedExports.parseTrading212Csv.mockReturnValueOnce(singleYearOversellCsv());
    // Prior filing holds only 4 AAPL against a 10-share deficit -> not covered.
    mockFetch({
      year: 2024,
      positions: [
        { isin: 'US0378331005', ticker: 'AAPL', securityName: 'Apple Inc.', shares: 4, costPerShareLocal: 300 },
      ],
    });
    await uploadSingleYearOversell();

    // Give the coverage effect time to resolve; the block must remain.
    await waitFor(() => {
      const urls = (globalThis.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls.map((c) => String(c[0]));
      expect(urls).toContain('/api/uploads/opening-positions?year=2025');
    });
    expect(screen.getByText('Incomplete Transaction History Detected')).toBeInTheDocument();
    expect(screen.queryByTestId('carry-forward-covers-note')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Calculate Taxes/ })).toBeDisabled();
  });

  it('(c) no carry-forward (empty fetch): block stays (fail safe), Calculate disabled', async () => {
    sharedExports.parseTrading212Csv.mockReturnValueOnce(singleYearOversellCsv());
    mockFetch({ year: null, positions: [] });
    await uploadSingleYearOversell();

    await waitFor(() => {
      const urls = (globalThis.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls.map((c) => String(c[0]));
      expect(urls).toContain('/api/uploads/opening-positions?year=2025');
    });
    expect(screen.getByText('Incomplete Transaction History Detected')).toBeInTheDocument();
    expect(screen.queryByTestId('carry-forward-covers-note')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Calculate Taxes/ })).toBeDisabled();
  });

  it('(c) fetch failure: block stays (fail safe), Calculate disabled', async () => {
    sharedExports.parseTrading212Csv.mockReturnValueOnce(singleYearOversellCsv());
    vi.spyOn(globalThis, 'fetch').mockImplementation((url) => {
      const u = String(url);
      if (u.includes('/api/uploads/opening-positions')) {
        return Promise.reject(new Error('network down'));
      }
      return Promise.resolve(
        new Response(JSON.stringify({ rates: {}, count: 0, rate: 4.9 }), { status: 200 }),
      );
    });
    await uploadSingleYearOversell();

    // The block never relaxes on a failed fetch.
    expect(screen.getByText('Incomplete Transaction History Detected')).toBeInTheDocument();
    expect(screen.queryByTestId('carry-forward-covers-note')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Calculate Taxes/ })).toBeDisabled();
  });

  it('(d) multi-year upload is unaffected (guard never fired, no coverage fetch on that basis)', async () => {
    // A 2024 buy + 2025 sell of the same security spans 2 years, so the single-year
    // guard never fires. The block is absent and no covered note appears; the
    // coverage effect stays dormant (nothing to relax).
    sharedExports.parseTrading212Csv.mockReturnValueOnce(
      makeCsvParseResult({
        transactions: [
          {
            action: 'buy', ticker: 'AAPL', isin: 'US0378331005', shares: 10, price: 150,
            priceCurrency: 'USD', transactionDate: '2024-01-15', total: 1500, totalCurrency: 'USD',
          } as unknown as Transaction,
          {
            action: 'sell', ticker: 'AAPL', isin: 'US0378331005', shares: 5, price: 200,
            priceCurrency: 'USD', transactionDate: '2025-06-20', total: 1000, totalCurrency: 'USD',
          } as unknown as Transaction,
        ],
      }),
    );
    mockFetch({ year: 2024, positions: [] });
    const user = userEvent.setup();
    const { container } = renderPage();
    await user.click(screen.getByRole('button', { name: /CSV Export/ }));
    await user.upload(findHiddenFileInput(container), makeCsvFile());

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Calculate Taxes/ })).toBeInTheDocument(),
    );
    expect(screen.queryByText('Incomplete Transaction History Detected')).not.toBeInTheDocument();
    expect(screen.queryByTestId('carry-forward-covers-note')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Calculate Taxes/ })).toBeEnabled();
  });

  it('(e) double-count guard blocks coverage credit for an in-file-bought security', async () => {
    sharedExports.parseTrading212Csv.mockReturnValueOnce(
      makeCsvParseResult({
        transactions: [
          {
            action: 'buy', ticker: 'AAPL', isin: 'US0378331005', shares: 2, price: 150,
            priceCurrency: 'USD', transactionDate: '2025-01-15', total: 300, totalCurrency: 'USD',
          } as unknown as Transaction,
          {
            action: 'sell', ticker: 'AAPL', isin: 'US0378331005', shares: 10, price: 200,
            priceCurrency: 'USD', transactionDate: '2025-06-20', total: 2000, totalCurrency: 'USD',
          } as unknown as Transaction,
        ],
      }),
    );
    mockFetch({
      year: 2024,
      positions: [
        { isin: 'US0378331005', ticker: 'AAPL', securityName: 'Apple Inc.', shares: 50, costPerShareLocal: 300 },
      ],
    });
    const user = userEvent.setup();
    const { container } = renderPage();
    await user.click(screen.getByRole('button', { name: /CSV Export/ }));
    await user.upload(findHiddenFileInput(container), makeCsvFile());
    await waitFor(() => {
      expect(screen.getByText('Incomplete Transaction History Detected')).toBeInTheDocument();
    });
    // The carried AAPL is excluded (its buy is in-file), so coverage is never met.
    await waitFor(() => {
      const urls = (globalThis.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls.map((c) => String(c[0]));
      expect(urls).toContain('/api/uploads/opening-positions?year=2025');
    });
    expect(screen.getByText('Incomplete Transaction History Detected')).toBeInTheDocument();
    expect(screen.queryByTestId('carry-forward-covers-note')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Calculate Taxes/ })).toBeDisabled();
  });
});

describe('UploadPage - drag-and-drop drop zone', () => {
  it('processes a dropped PDF the same as a file-input upload', async () => {
    const { container } = renderPage();
    const dropZone = container.querySelector(
      '[class*="border-dashed"]',
    ) as HTMLElement | null;
    expect(dropZone).toBeTruthy();

    const file = makePdfFile('dropped.pdf');
    const dataTransfer = {
      files: [file] as unknown as FileList,
      items: [],
      types: ['Files'],
    } as unknown as DataTransfer;

    await act(async () => {
      dropZone!.dispatchEvent(
        new (class extends Event {
          dataTransfer = dataTransfer;
          constructor() {
            super('drop', { bubbles: true, cancelable: true });
          }
        })(),
      );
    });

    await waitFor(() => {
      expect(screen.getByText('dropped.pdf')).toBeInTheDocument();
    });
  });
});

describe('UploadPage - IBKR CSV (beta)', () => {
  it('swaps the Trading212 split warning for the IBKR beta notice when IBKR is selected', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: /CSV Export/ }));
    // Default broker is Trading 212: its stock-split pre-warning is shown.
    expect(
      screen.getByText('Common stock splits (NVDA, TSLA, etc.) are adjusted automatically. For rarer splits, the PDF tab is the safest option.'),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Interactive Brokers/ }));
    expect(screen.getByText(/Interactive Brokers support is in beta/)).toBeInTheDocument();
    expect(
      screen.queryByText('Common stock splits (NVDA, TSLA, etc.) are adjusted automatically. For rarer splits, the PDF tab is the safest option.'),
    ).not.toBeInTheDocument();
  });

  it('routes an IBKR CSV through parseIbkrCsv (not the Trading212 parser) and shows the beta note', async () => {
    const user = userEvent.setup();
    const { container } = renderPage();
    await user.click(screen.getByRole('button', { name: /CSV Export/ }));
    await user.click(screen.getByRole('button', { name: /Interactive Brokers/ }));
    await user.upload(findHiddenFileInput(container), makeCsvFile('ibkr-activity.csv'));

    await waitFor(() => {
      expect(screen.getByText('ibkr-activity.csv')).toBeInTheDocument();
    });
    expect(sharedExports.parseIbkrCsv).toHaveBeenCalled();
    expect(sharedExports.parseTrading212Csv).not.toHaveBeenCalled();
    // IBKR preview shows its own beta note, never the Trading212 split warning.
    expect(screen.getByText('Interactive Brokers (beta)')).toBeInTheDocument();
    expect(screen.queryByText('Stock splits: common ones are handled, rare ones are not')).not.toBeInTheDocument();
    expect(mockReportParseEvent).toHaveBeenCalledWith(
      expect.objectContaining({ fileType: 'csv', outcome: 'success' }),
    );
  });

  it('records broker:ibkr in the upload data on calculate', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ rates: {}, count: 0, rate: 4.9 }), { status: 200 }),
    );
    const user = userEvent.setup();
    const { container } = renderPage();
    await user.click(screen.getByRole('button', { name: /CSV Export/ }));
    await user.click(screen.getByRole('button', { name: /Interactive Brokers/ }));
    await user.upload(findHiddenFileInput(container), makeCsvFile('ibkr-activity.csv'));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Calculate Taxes/ })).toBeInTheDocument(),
    );
    await user.click(screen.getByRole('button', { name: /Calculate Taxes/ }));

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/results'));
    expect(mockSetUploadData).toHaveBeenCalledWith(
      expect.objectContaining({ broker: 'ibkr' }),
    );
  });

  it('still records broker:trading212 on the Trading212 CSV path', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ rates: {}, count: 0, rate: 4.9 }), { status: 200 }),
    );
    const user = userEvent.setup();
    const { container } = renderPage();
    await user.click(screen.getByRole('button', { name: /CSV Export/ }));
    await user.upload(findHiddenFileInput(container), makeCsvFile('t212.csv'));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Calculate Taxes/ })).toBeInTheDocument(),
    );
    await user.click(screen.getByRole('button', { name: /Calculate Taxes/ }));

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/results'));
    expect(mockSetUploadData).toHaveBeenCalledWith(
      expect.objectContaining({ broker: 'trading212' }),
    );
  });
});

describe('UploadPage - Revolut (beta)', () => {
  it('swaps the Trading212 split warning for the Revolut beta notice when Revolut is selected', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: /CSV Export/ }));
    expect(
      screen.getByText('Common stock splits (NVDA, TSLA, etc.) are adjusted automatically. For rarer splits, the PDF tab is the safest option.'),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Revolut/ }));
    expect(screen.getByText(/Revolut support is in beta/)).toBeInTheDocument();
    expect(
      screen.queryByText('Common stock splits (NVDA, TSLA, etc.) are adjusted automatically. For rarer splits, the PDF tab is the safest option.'),
    ).not.toBeInTheDocument();
  });

  it('routes a Revolut .csv through parseRevolutStatement (not Trading212/IBKR) and shows the beta note', async () => {
    const user = userEvent.setup();
    const { container } = renderPage();
    await user.click(screen.getByRole('button', { name: /CSV Export/ }));
    await user.click(screen.getByRole('button', { name: /Revolut/ }));
    await user.upload(findHiddenFileInput(container), makeCsvFile('revolut.csv'));

    await waitFor(() => {
      expect(screen.getByText('revolut.csv')).toBeInTheDocument();
    });
    expect(sharedExports.parseRevolutStatement).toHaveBeenCalled();
    expect(sharedExports.parseTrading212Csv).not.toHaveBeenCalled();
    expect(sharedExports.parseIbkrCsv).not.toHaveBeenCalled();
    expect(screen.getByText('Revolut (beta)')).toBeInTheDocument();
    expect(screen.queryByText('Stock splits: common ones are handled, rare ones are not')).not.toBeInTheDocument();
  });

  it('reads a Revolut .xlsx via read-excel-file and routes through parseRevolutStatement', async () => {
    const user = userEvent.setup();
    const { container } = renderPage();
    await user.click(screen.getByRole('button', { name: /CSV Export/ }));
    await user.click(screen.getByRole('button', { name: /Revolut/ }));
    await user.upload(findHiddenFileInput(container), makeXlsxFile('revolut.xlsx'));

    await waitFor(() => {
      expect(screen.getByText('revolut.xlsx')).toBeInTheDocument();
    });
    expect(mockReadXlsxFile).toHaveBeenCalled();
    expect(mockPapaParse).not.toHaveBeenCalled(); // the xlsx path bypasses Papa
    expect(sharedExports.parseRevolutStatement).toHaveBeenCalled();
  });

  it('records broker:revolut in the upload data on calculate', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ rates: {}, count: 0, rate: 4.9 }), { status: 200 }),
    );
    const user = userEvent.setup();
    const { container } = renderPage();
    await user.click(screen.getByRole('button', { name: /CSV Export/ }));
    await user.click(screen.getByRole('button', { name: /Revolut/ }));
    await user.upload(findHiddenFileInput(container), makeXlsxFile('revolut.xlsx'));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Calculate Taxes/ })).toBeInTheDocument(),
    );
    await user.click(screen.getByRole('button', { name: /Calculate Taxes/ }));

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/results'));
    expect(mockSetUploadData).toHaveBeenCalledWith(
      expect.objectContaining({ broker: 'revolut' }),
    );
  });
});

describe('UploadPage - multi-file CSV merge', () => {
  const buy2024 = {
    action: 'buy', ticker: 'AAPL', isin: 'US0378331005', shares: 10,
    priceCurrency: 'USD', transactionDate: '2024-02-01', totalAmountOriginal: 1500,
  } as unknown as Transaction;
  const sell2025 = {
    action: 'sell', ticker: 'AAPL', isin: 'US0378331005', shares: 10,
    priceCurrency: 'USD', transactionDate: '2025-06-01', totalAmountOriginal: 2000,
  } as unknown as Transaction;

  it('merges multiple CSV files into one preview with a files-merged note', async () => {
    sharedExports.parseTrading212Csv
      .mockReturnValueOnce(makeCsvParseResult({ transactions: [buy2024] }))
      .mockReturnValueOnce(makeCsvParseResult({ transactions: [sell2025] }));
    const user = userEvent.setup();
    const { container } = renderPage();
    await user.click(screen.getByRole('button', { name: /CSV Export/ }));
    await user.upload(findHiddenFileInput(container), [
      makeCsvFile('2024.csv'),
      makeCsvFile('2025.csv'),
    ]);

    await waitFor(() => {
      expect(screen.getByText('2 files merged')).toBeInTheDocument();
    });
    // Label is the multi-file summary, not a single filename.
    expect(screen.getByText('2 CSV files')).toBeInTheDocument();
    expect(sharedExports.parseTrading212Csv).toHaveBeenCalledTimes(2);
  });

  it('reports duplicates removed when the same transactions appear in overlapping files', async () => {
    // The default makeCsvParseResult() (3 identical transactions) is returned for
    // both files, simulating two exports whose periods overlap completely.
    const user = userEvent.setup();
    const { container } = renderPage();
    await user.click(screen.getByRole('button', { name: /CSV Export/ }));
    await user.upload(findHiddenFileInput(container), [
      makeCsvFile('jan-jun.csv'),
      makeCsvFile('jun-dec.csv'),
    ]);

    await waitFor(() => {
      expect(
        screen.getByText('3 duplicate transactions removed across overlapping files'),
      ).toBeInTheDocument();
    });
  });

  it('clears the missing-history block that one partial file would trip on its own', async () => {
    // File 1 has only the historical buy; file 2 has only the same-year sell,
    // which alone would fire the missing-history guard. Merged, buys cover sells.
    sharedExports.parseTrading212Csv
      .mockReturnValueOnce(
        makeCsvParseResult({
          transactions: [
            { action: 'buy', ticker: 'AAPL', isin: 'US0378331005', shares: 10, priceCurrency: 'USD', transactionDate: '2025-02-01', totalAmountOriginal: 1500 } as unknown as Transaction,
          ],
        }),
      )
      .mockReturnValueOnce(
        makeCsvParseResult({
          transactions: [
            { action: 'sell', ticker: 'AAPL', isin: 'US0378331005', shares: 10, priceCurrency: 'USD', transactionDate: '2025-06-01', totalAmountOriginal: 2000 } as unknown as Transaction,
          ],
        }),
      );
    const user = userEvent.setup();
    const { container } = renderPage();
    await user.click(screen.getByRole('button', { name: /CSV Export/ }));
    await user.upload(findHiddenFileInput(container), [
      makeCsvFile('buys.csv'),
      makeCsvFile('sells.csv'),
    ]);

    await waitFor(() => {
      expect(screen.getByText('2 files merged')).toBeInTheDocument();
    });
    expect(screen.queryByText('Incomplete Transaction History Detected')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Calculate Taxes/ })).not.toBeDisabled();
  });

  it('merges multiple IBKR files through parseIbkrCsv', async () => {
    sharedExports.parseIbkrCsv
      .mockReturnValueOnce(makeCsvParseResult({ transactions: [buy2024] }))
      .mockReturnValueOnce(makeCsvParseResult({ transactions: [sell2025] }));
    const user = userEvent.setup();
    const { container } = renderPage();
    await user.click(screen.getByRole('button', { name: /CSV Export/ }));
    await user.click(screen.getByRole('button', { name: /Interactive Brokers/ }));
    await user.upload(findHiddenFileInput(container), [
      makeCsvFile('ibkr-2024.csv'),
      makeCsvFile('ibkr-2025.csv'),
    ]);

    await waitFor(() => {
      expect(screen.getByText('2 files merged')).toBeInTheDocument();
    });
    expect(sharedExports.parseIbkrCsv).toHaveBeenCalledTimes(2);
    expect(sharedExports.parseTrading212Csv).not.toHaveBeenCalled();
  });

  it('calculates from the merged transaction set across files', async () => {
    // Fresh Response per call: finalizeCsv reads daily + average in parallel and
    // a Response body can only be read once.
    vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({ rates: {}, count: 0, rate: 4.9 }), { status: 200 }),
      ),
    );
    sharedExports.parseTrading212Csv
      .mockReturnValueOnce(makeCsvParseResult({ transactions: [buy2024] }))
      .mockReturnValueOnce(makeCsvParseResult({ transactions: [sell2025] }));
    const user = userEvent.setup();
    const { container } = renderPage();
    await user.click(screen.getByRole('button', { name: /CSV Export/ }));
    await user.upload(findHiddenFileInput(container), [
      makeCsvFile('a.csv'),
      makeCsvFile('b.csv'),
    ]);

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Calculate Taxes/ })).toBeInTheDocument(),
    );
    await user.click(screen.getByRole('button', { name: /Calculate Taxes/ }));

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/results'));
    expect(mockSetUploadData).toHaveBeenCalledWith(
      expect.objectContaining({
        broker: 'trading212',
        parseResult: expect.objectContaining({ sourceFileCount: 2 }),
      }),
    );
  });
});

describe('UploadPage - post-pay rehydration (backlog #24B Phase 2)', () => {
  // Seed a full PdfParseResult (not the preview shape) as the persisted parse.
  function makePdfPending(overrides: Partial<PdfParseResult> = {}) {
    return {
      fileType: 'pdf' as const,
      fileName: 'annual-statement-2025.pdf',
      pdf: makePdfParseResult(overrides),
    };
  }

  function makeCsvPending(selectedYear = 2025) {
    const parsed = makeCsvParseResult();
    return {
      fileType: 'csv' as const,
      fileName: 'transactions.csv',
      broker: 'trading212' as const,
      selectedYear,
      csv: { ...parsed, sourceFileCount: 1, duplicatesRemoved: 0 },
    };
  }

  it('rehydrates a persisted PDF parse on ?welcome=1, runs the engine, and lands on /results WITHOUT a file input', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({ rate: 4.55, rates: { '2025-06-01': 4.6 }, count: 1 }), {
          status: 200,
        }),
      ),
    );
    sharedExports.calculateTaxesFromPdf.mockReturnValueOnce({
      taxResult: { totals: { totalTaxOwed: 28053 } },
      securities: [{ ticker: 'AAPL' }],
      warnings: [],
      structuredWarnings: [],
    });
    writePendingParse(makePdfPending());
    searchParamsValue = new URLSearchParams('welcome=1');

    const { container } = renderPage('/upload?welcome=1');

    // No file was ever dropped; the engine runs purely from the rehydrated parse.
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/results'));
    expect(container.querySelector('input[type="file"]')).not.toBeNull(); // page rendered, no upload needed
    expect(sharedExports.calculateTaxesFromPdf).toHaveBeenCalledTimes(1);
    expect(mockSetUploadData).toHaveBeenCalledWith(
      expect.objectContaining({
        fileName: 'annual-statement-2025.pdf',
        taxYear: 2025,
        broker: 'trading212',
        taxResult: expect.objectContaining({
          totals: expect.objectContaining({ totalTaxOwed: 28053 }),
        }),
      }),
    );
  });

  it('clears the sessionStorage key after a successful rehydrated engine run', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({ rate: 4.55, rates: {}, count: 0 }), { status: 200 }),
      ),
    );
    writePendingParse(makePdfPending());
    searchParamsValue = new URLSearchParams('welcome=1');
    renderPage('/upload?welcome=1');

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/results'));
    // Consumed: a refresh must not re-run the engine on the same parse.
    expect(readPendingParse()).toBeNull();
  });

  it('rehydrates a persisted CSV parse, runs the engine, and lands on /results', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({ rates: {}, count: 0, rate: 4.9 }), { status: 200 }),
      ),
    );
    sharedExports.calculateTaxes.mockReturnValueOnce({
      taxResult: { totals: { totalTaxOwed: 1000 } },
      securities: [],
    });
    // Persist year 2024 (a supported prior year) so the assertion proves the
    // OVERRIDE drives the engine, not the hook default (which resolves to 2025).
    writePendingParse(makeCsvPending(2024));
    searchParamsValue = new URLSearchParams('welcome=1');
    renderPage('/upload?welcome=1');

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/results'));
    expect(sharedExports.calculateTaxes).toHaveBeenCalledTimes(1);
    // Parity guard: the engine runs on the PERSISTED year (2024), not the hook's
    // default selectedYear (which would be flushed a tick late).
    const calcCall = sharedExports.calculateTaxes.mock.calls.at(-1);
    expect(calcCall?.[2]).toBe(2024);
    expect(mockSetUploadData).toHaveBeenCalledWith(
      expect.objectContaining({ fileName: 'transactions.csv', broker: 'trading212', taxYear: 2024 }),
    );
  });

  it('does NOT rehydrate when there is no pending parse: the drop zone renders (today behaviour)', async () => {
    searchParamsValue = new URLSearchParams('welcome=1');
    renderPage('/upload?welcome=1');

    // The welcome toast and the normal drop zone render; no engine, no navigation.
    await waitFor(() => expect(screen.getByText('Welcome to InvesTax!')).toBeInTheDocument());
    expect(screen.getByText('Drop your PDF statement here')).toBeInTheDocument();
    expect(sharedExports.calculateTaxesFromPdf).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalledWith('/results');
  });

  it('does NOT rehydrate when NOT arriving from payment (no ?welcome=1), even if a parse is stored', async () => {
    writePendingParse(makePdfPending());
    // No welcome flag: a stored parse from a prior session must not auto-run.
    renderPage('/upload');

    await waitFor(() => expect(screen.getByText('Drop your PDF statement here')).toBeInTheDocument());
    expect(sharedExports.calculateTaxesFromPdf).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalledWith('/results');
    // The stored parse is left intact (it is not consumed off the non-welcome path).
    expect(readPendingParse()).not.toBeNull();
  });

  it('falls back to re-upload (no rehydrate) when the stored PDF year is unsupported', async () => {
    writePendingParse(makePdfPending({ year: 2021 }));
    searchParamsValue = new URLSearchParams('welcome=1');
    renderPage('/upload?welcome=1');

    await waitFor(() => expect(screen.getByText('Drop your PDF statement here')).toBeInTheDocument());
    expect(sharedExports.calculateTaxesFromPdf).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalledWith('/results');
  });

  it('falls back to re-upload when the stored blob is a version mismatch (stale schema)', async () => {
    // A v0 envelope from an older build: readPendingParse returns null -> re-upload.
    window.sessionStorage.setItem(
      'investax.pendingParse',
      JSON.stringify({ version: 'v0', payload: makePdfPending() }),
    );
    searchParamsValue = new URLSearchParams('welcome=1');
    renderPage('/upload?welcome=1');

    await waitFor(() => expect(screen.getByText('Drop your PDF statement here')).toBeInTheDocument());
    expect(sharedExports.calculateTaxesFromPdf).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalledWith('/results');
  });

  // Regression for the qa-flagged race (PR #234): `user`, `authLoading`, and
  // `countryConfig` settle on independent async timelines, so a benign dep-settle
  // fires the effect cleanup + re-run AFTER the first committed rehydrate. The old
  // cancel-on-cleanup aborted the in-flight run before navigate('/results'); the
  // fix must drive the committed run to completion regardless.
  it('completes the rehydrate even when a benign dep settles mid-flight (no cancel-on-settle)', async () => {
    // Hold the BNR fetch open so the async run is still in flight when we re-render
    // with a settled dep, reproducing the exact abort window.
    let resolveFetch: (r: Response) => void = () => {};
    const gate = new Promise<Response>((res) => {
      resolveFetch = res;
    });
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => gate.then((r) => r.clone()));
    sharedExports.calculateTaxesFromPdf.mockReturnValueOnce({
      taxResult: { totals: { totalTaxOwed: 28053 } },
      securities: [],
      warnings: [],
      structuredWarnings: [],
    });
    writePendingParse(makePdfPending());
    searchParamsValue = new URLSearchParams('welcome=1');

    const { rerender } = renderPage('/upload?welcome=1');

    // The effect has committed and is awaiting the (still-pending) BNR fetch. Now a
    // benign settle: `user` gets a fresh object identity (as /api/auth/me resolving
    // would produce), changing the effect dep and triggering cleanup + re-run.
    authState = {
      user: { id: 'u1', email: 'maria@example.com', name: 'Maria Popescu', plan: 'paid' },
      loading: false,
    };
    await act(async () => {
      rerender(
        <HelmetProvider>
          <MemoryRouter initialEntries={['/upload?welcome=1']}>
            <UploadPage />
          </MemoryRouter>
        </HelmetProvider>,
      );
    });

    // Release the BNR fetch; the committed run must finish and navigate.
    await act(async () => {
      resolveFetch(new Response(JSON.stringify({ rate: 4.55, rates: { '2025-06-01': 4.6 }, count: 1 }), { status: 200 }));
      await Promise.resolve();
    });

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/results'));
    // Exactly one engine run: the re-run must not double-fire, and the abort must
    // not swallow the run.
    expect(sharedExports.calculateTaxesFromPdf).toHaveBeenCalledTimes(1);
    expect(readPendingParse()).toBeNull();
  });

  it('runs the rehydrate when auth settles AFTER mount (initial authLoading=true)', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({ rate: 4.55, rates: {}, count: 0 }), { status: 200 }),
      ),
    );
    sharedExports.calculateTaxesFromPdf.mockReturnValueOnce({
      taxResult: { totals: { totalTaxOwed: 28053 } },
      securities: [],
      warnings: [],
      structuredWarnings: [],
    });
    writePendingParse(makePdfPending());
    searchParamsValue = new URLSearchParams('welcome=1');
    // Auth still loading at mount: the first effect run bails on the gate, no latch.
    authState = { user: null, loading: true };

    const { rerender } = renderPage('/upload?welcome=1');
    expect(sharedExports.calculateTaxesFromPdf).not.toHaveBeenCalled();

    // Auth resolves to a paid user: the effect re-runs and now commits.
    authState = {
      user: { id: 'u1', email: 'maria@example.com', name: 'Maria Popescu', plan: 'paid' },
      loading: false,
    };
    await act(async () => {
      rerender(
        <HelmetProvider>
          <MemoryRouter initialEntries={['/upload?welcome=1']}>
            <UploadPage />
          </MemoryRouter>
        </HelmetProvider>,
      );
    });

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/results'));
    expect(sharedExports.calculateTaxesFromPdf).toHaveBeenCalledTimes(1);
  });
});
