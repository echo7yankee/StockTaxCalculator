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
  },
}));

// Canned shared-engine outputs. Each helper resets between tests via fnMock fields.
const sharedExports = {
  parseTrading212Csv: vi.fn(),
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
});

describe('UploadPage - paywall gating', () => {
  it('renders nothing and redirects to /pricing when no user is logged in', () => {
    authState = { user: null, loading: false };
    const { container } = renderPage();
    expect(container.firstChild).toBeNull();
    expect(mockNavigate).toHaveBeenCalledWith('/pricing', { replace: true });
  });

  it('renders nothing and redirects to /pricing when the user is on the free plan', () => {
    authState = {
      user: { id: 'u1', email: 'free@example.com', name: 'Free User', plan: 'free' },
      loading: false,
    };
    const { container } = renderPage();
    expect(container.firstChild).toBeNull();
    expect(mockNavigate).toHaveBeenCalledWith('/pricing', { replace: true });
  });

  it('does not redirect while auth is still loading', () => {
    authState = { user: null, loading: true };
    const { container } = renderPage();
    expect(container.firstChild).toBeNull();
    expect(mockNavigate).not.toHaveBeenCalled();
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
        'CSV does not account for stock splits. For most accurate results, use the PDF tab.',
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

  it('auto-fetches the BNR exchange rate when the PDF account currency is non-local', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ rate: 4.55 }), { status: 200 }),
    );
    const user = userEvent.setup();
    const { container } = renderPage();
    await user.upload(findHiddenFileInput(container), makePdfFile());

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        '/api/exchange-rates/2025/average?currency=USD',
      );
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
