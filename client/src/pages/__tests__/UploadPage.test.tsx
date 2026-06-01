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
  } as ParseResult;
  return { ...base, ...overrides };
}

beforeEach(() => {
  vi.clearAllMocks();
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
