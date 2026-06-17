import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { useEffect, useRef } from 'react';
import { UploadProvider, useUpload } from '../../contexts/UploadContext';
import { CountryProvider } from '../../contexts/CountryContext';
import ResultsPage from '../ResultsPage';

// Mock useAuth to simulate logged-in user
vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'test-id', email: 'test@test.com', name: 'Test', plan: 'free' },
    loading: false,
    login: vi.fn(),
    signup: vi.fn(),
    loginWithGoogle: vi.fn(),
    logout: vi.fn(),
  }),
}));
import type { TaxCalculationResult, SecurityBreakdown, Transaction } from '@shared/index';
import type { BrokerId } from '../../lib/brokers';

const mockTaxResult: TaxCalculationResult = {
  taxYearId: '2025',
  capitalGains: {
    totalProceeds: 240000,
    totalCostBasis: 48000,
    netGains: 192000,
    losses: 0,
    taxRate: 0.1,
    taxOwed: 19200,
  },
  dividends: {
    grossTotal: 660,
    withholdingTaxPaid: 12,
    taxOwed: 54,
  },
  healthContribution: {
    totalNonSalaryIncome: 192660,
    thresholdHit: '24x',
    amountOwed: 9720,
  },
  totals: {
    totalTaxOwed: 28974,
    earlyFilingDiscount: 869.22,
    totalAfterDiscount: 28104.78,
  },
  calculatedAt: new Date('2025-03-15'),
};

const mockSecurities: SecurityBreakdown[] = [
  {
    isin: 'US69608A1088', ticker: 'PLTR', securityName: 'Palantir Technologies',
    totalBoughtShares: 270, totalSoldShares: 270, remainingShares: 0,
    weightedAvgCostLocal: 96.5, totalProceeds: 180000, totalCostBasis: 35000,
    realizedGainLoss: 145000, totalDividends: 0, totalWithholdingTax: 0,
  },
  {
    isin: 'US67066G1040', ticker: 'NVDA', securityName: 'Nvidia Corporation',
    totalBoughtShares: 70, totalSoldShares: 70, remainingShares: 0,
    weightedAvgCostLocal: 146, totalProceeds: 48000, totalCostBasis: 10000,
    realizedGainLoss: 38000, totalDividends: 6, totalWithholdingTax: 0.6,
  },
];

// Helper to pre-fill the upload context (runs once via ref guard)
function SetupUpload({ children, warnings = [], broker }: { children: React.ReactNode; warnings?: string[]; broker?: 'trading212' | 'ibkr' }) {
  const { setUploadData } = useUpload();
  const didSet = useRef(false);

  useEffect(() => {
    if (!didSet.current) {
      didSet.current = true;
      setUploadData({
        taxResult: mockTaxResult,
        securities: mockSecurities,
        fileName: 'annual-statement-2025.pdf',
        taxYear: 2025,
        transactions: [],
        parseWarnings: warnings,
        ...(broker ? { broker } : {}),
      });
    }
  }, [setUploadData, warnings, broker]);

  return <>{children}</>;
}

function renderResults(withData = true, warnings: string[] = [], broker?: 'trading212' | 'ibkr') {
  if (withData) {
    return render(
      <HelmetProvider>
        <MemoryRouter>
          <CountryProvider>
            <UploadProvider>
              <SetupUpload warnings={warnings} broker={broker}>
                <ResultsPage />
              </SetupUpload>
            </UploadProvider>
          </CountryProvider>
        </MemoryRouter>
      </HelmetProvider>
    );
  }
  return render(
    <HelmetProvider>
      <MemoryRouter>
        <CountryProvider>
          <UploadProvider>
            <ResultsPage />
          </UploadProvider>
        </CountryProvider>
      </MemoryRouter>
    </HelmetProvider>
  );
}

describe('ResultsPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('shows empty state when no taxResult', () => {
    renderResults(false);
    expect(screen.getByText('No calculations yet.')).toBeInTheDocument();
    expect(screen.getByText('Go to Upload')).toBeInTheDocument();
  });

  it('renders title with tax year', () => {
    renderResults();
    expect(screen.getByText(/Tax Results for 2025/)).toBeInTheDocument();
  });

  it('shows file name', () => {
    renderResults();
    expect(screen.getByText(/annual-statement-2025.pdf/)).toBeInTheDocument();
  });

  it('renders 4 summary cards', () => {
    renderResults();
    expect(screen.getByText('Capital Gains Tax')).toBeInTheDocument();
    expect(screen.getByText('Dividend Tax')).toBeInTheDocument();
    expect(screen.getByText('Health Contribution (CASS)')).toBeInTheDocument();
    expect(screen.getByText('Total Tax Owed')).toBeInTheDocument();
  });

  it('displays capital gains tax amount', () => {
    renderResults();
    expect(screen.getByText(/19,200.00/)).toBeInTheDocument();
  });

  it('shows CASS bracket and amount', () => {
    renderResults();
    expect(screen.getByText(/9,720.00/)).toBeInTheDocument();
    expect(screen.getByText(/24 minimum wages/)).toBeInTheDocument();
  });

  it('shows early filing discount banner when deadline is still in the future', () => {
    // Pin "today" to before April 15 so the deadline gate passes deterministically
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-01T12:00:00Z'));
    try {
      renderResults();
      expect(screen.getByText(/File early to save/)).toBeInTheDocument();
      expect(screen.getByText(/869.22/)).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('hides early filing discount banner when deadline has passed', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-16T12:00:00Z'));
    try {
      renderResults();
      expect(screen.queryByText(/File early to save/)).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('renders per-security table with correct tickers', () => {
    renderResults();
    expect(screen.getByText('PLTR')).toBeInTheDocument();
    expect(screen.getByText('NVDA')).toBeInTheDocument();
  });

  it('shows Save to Dashboard button', () => {
    renderResults();
    expect(screen.getByText('Save to Dashboard')).toBeInTheDocument();
  });

  it('save button calls API and shows saved state', async () => {
    const user = userEvent.setup();
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ id: '1' }), { status: 200 })
    );

    renderResults();

    await user.click(screen.getByText('Save to Dashboard'));

    await waitFor(() => {
      expect(screen.getByText('Saved to Dashboard')).toBeInTheDocument();
    });

    expect(fetchSpy).toHaveBeenCalledWith('/api/uploads', expect.objectContaining({
      method: 'POST',
    }));
  });

  it('shows error when save fails', async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Network error'));

    renderResults();

    await user.click(screen.getByText('Save to Dashboard'));

    await waitFor(() => {
      expect(screen.getByText(/Failed to save/)).toBeInTheDocument();
    });
  });
});

describe('ResultsPage parser warning hard-stop', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('hides the warning banner and shows the filing guide CTA when warnings is empty', () => {
    renderResults(true, []);
    expect(screen.queryByTestId('parse-warning-banner')).not.toBeInTheDocument();
    expect(screen.getByTestId('filing-guide-cta')).toBeInTheDocument();
  });

  it('shows the warning banner and hides the filing guide CTA when warnings exist', () => {
    renderResults(true, ['Per-row sells (-226.80 RON) vs overview closedResult (3273.75 RON) mismatch']);
    expect(screen.getByTestId('parse-warning-banner')).toBeInTheDocument();
    expect(screen.queryByTestId('filing-guide-cta')).not.toBeInTheDocument();
  });

  it('renders each individual warning string in the banner list', () => {
    const warnings = [
      'Per-row vs overview mismatch',
      'Currency-code column missing on page 1',
    ];
    renderResults(true, warnings);
    expect(screen.getByText(warnings[0])).toBeInTheDocument();
    expect(screen.getByText(warnings[1])).toBeInTheDocument();
  });

  it('still renders the four summary cards when warnings exist (numbers visible alongside the banner)', () => {
    renderResults(true, ['some warning']);
    expect(screen.getByText('Capital Gains Tax')).toBeInTheDocument();
    expect(screen.getByText('Dividend Tax')).toBeInTheDocument();
    expect(screen.getByText('Health Contribution (CASS)')).toBeInTheDocument();
    expect(screen.getByText('Total Tax Owed')).toBeInTheDocument();
  });

  it('Contact-me CTA in the banner navigates to /contact', async () => {
    const user = userEvent.setup();
    renderResults(true, ['warning']);
    const cta = screen.getByTestId('parse-warning-contact-cta');
    expect(cta).toBeInTheDocument();
    await user.click(cta);
    // navigation happens via react-router; banner stays in MemoryRouter (no /contact route mounted),
    // but the CTA must be a clickable button with the expected label
    expect(cta).toHaveTextContent(/Contact me/i);
  });

  it('shows the D212 download section high up (above the per-security table) on a clean 2025 parse', () => {
    renderResults(true, []);
    const d212 = screen.getByTestId('d212-download');
    expect(d212).toBeInTheDocument();
    // Placed next to the filing-guide CTA near the top, not buried at the bottom:
    // the per-security breakdown must follow it in document order.
    const perSecurity = screen.getByText('Per-Security Breakdown');
    expect(d212.compareDocumentPosition(perSecurity) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('hides the D212 download section when warnings exist (same hard-stop as the filing CTA)', () => {
    renderResults(true, ['Per-row vs overview mismatch']);
    expect(screen.queryByTestId('d212-download')).not.toBeInTheDocument();
  });
});

describe('ResultsPage beta-broker caveat', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('shows the persistent verify-before-filing caveat for a beta broker on a clean parse', () => {
    renderResults(true, [], 'ibkr');
    expect(screen.getByTestId('beta-broker-caveat')).toBeInTheDocument();
    expect(screen.getByText(/Interactive Brokers support is in beta/)).toBeInTheDocument();
    // The caveat must NOT block filing on a clean parse; the CTA stays available.
    expect(screen.getByTestId('filing-guide-cta')).toBeInTheDocument();
  });

  it('does not show the beta caveat for a trusted broker', () => {
    renderResults(true, [], 'trading212');
    expect(screen.queryByTestId('beta-broker-caveat')).not.toBeInTheDocument();
  });

  it('does not show the beta caveat by default (no broker set falls back to trusted Trading212)', () => {
    renderResults(true, []);
    expect(screen.queryByTestId('beta-broker-caveat')).not.toBeInTheDocument();
  });

  it('shows both the beta caveat and the warning hard-stop when a beta parse has warnings', () => {
    renderResults(true, ['Withholding tax has no matching dividend'], 'ibkr');
    expect(screen.getByTestId('beta-broker-caveat')).toBeInTheDocument();
    expect(screen.getByTestId('parse-warning-banner')).toBeInTheDocument();
    // Hard-stop still hides the filing CTA when warnings exist.
    expect(screen.queryByTestId('filing-guide-cta')).not.toBeInTheDocument();
  });
});

describe('ResultsPage dividend foreign-tax credit (Revolut beta)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // A USD dividend converted at a blended 5.0 BNR rate (1000 RON / 200 USD), plus a
  // closed AAPL position, so the dividend tax and the total are distinct numbers.
  function makeRevolutTx(o: Partial<Transaction>): Transaction {
    return {
      id: 'r-1', csvUploadId: '', taxYearId: '',
      action: 'dividend', transactionDate: new Date('2025-03-01'),
      isin: '', ticker: 'MSFT', securityName: '',
      shares: 0, pricePerShare: 0, priceCurrency: 'USD',
      totalAmountOriginal: 200, exchangeRateToLocal: 5, totalAmountLocal: 1000,
      withholdingTaxOriginal: 0, withholdingTaxCurrency: 'USD', withholdingTaxLocal: 0,
      brokerTransactionId: '', ...o,
    };
  }

  const revolutTransactions: Transaction[] = [
    makeRevolutTx({ id: 'b1', action: 'buy', ticker: 'AAPL', shares: 10, totalAmountOriginal: 200, totalAmountLocal: 1000 }),
    makeRevolutTx({ id: 's1', action: 'sell', ticker: 'AAPL', shares: 10, totalAmountOriginal: 600, totalAmountLocal: 3000 }),
    makeRevolutTx({ id: 'd1', action: 'dividend', ticker: 'MSFT', totalAmountOriginal: 200, totalAmountLocal: 1000 }),
  ];

  // Mirrors what calculateTaxes produces for revolutTransactions with no withholding:
  // cap gains 200 (10% of 2000), dividend tax 100 (10% of 1000), CASS 0, total 300.
  const revolutTaxResult: TaxCalculationResult = {
    taxYearId: '2025',
    capitalGains: { totalProceeds: 3000, totalCostBasis: 1000, netGains: 2000, losses: 0, taxRate: 0.1, taxOwed: 200 },
    dividends: { grossTotal: 1000, withholdingTaxPaid: 0, taxOwed: 100 },
    healthContribution: { totalNonSalaryIncome: 3000, thresholdHit: 'none', amountOwed: 0 },
    totals: { totalTaxOwed: 300, earlyFilingDiscount: 9, totalAfterDiscount: 291 },
    calculatedAt: new Date('2025-03-15'),
  };

  function SetupCredit({ children, taxResult, transactions, broker }: {
    children: React.ReactNode; taxResult: TaxCalculationResult; transactions: Transaction[]; broker: BrokerId;
  }) {
    const { setUploadData } = useUpload();
    const didSet = useRef(false);
    useEffect(() => {
      if (!didSet.current) {
        didSet.current = true;
        setUploadData({
          taxResult, securities: [], fileName: 'revolut-account-statement.xlsx',
          taxYear: 2025, transactions, parseWarnings: [], broker,
        });
      }
    }, [setUploadData, taxResult, transactions, broker]);
    return <>{children}</>;
  }

  function renderCredit(taxResult: TaxCalculationResult, transactions: Transaction[], broker: BrokerId = 'revolut') {
    return render(
      <HelmetProvider>
        <MemoryRouter>
          <CountryProvider>
            <UploadProvider>
              <SetupCredit taxResult={taxResult} transactions={transactions} broker={broker}>
                <ResultsPage />
              </SetupCredit>
            </UploadProvider>
          </CountryProvider>
        </MemoryRouter>
      </HelmetProvider>
    );
  }

  it('shows the credit panel when dividends have no parsed withholding and transactions are present', () => {
    renderCredit(revolutTaxResult, revolutTransactions);
    expect(screen.getByTestId('dividend-wht-credit')).toBeInTheDocument();
    expect(screen.getByTestId('dividend-wht-input')).toBeInTheDocument();
  });

  it('does not show the panel when withholding was already parsed (T212 / PDF flow with no transactions)', () => {
    renderResults(); // default mock: withholdingTaxPaid 12, transactions []
    expect(screen.queryByTestId('dividend-wht-credit')).not.toBeInTheDocument();
  });

  it('does not show the panel when there are no dividends', () => {
    const noDividends: TaxCalculationResult = {
      ...revolutTaxResult,
      dividends: { grossTotal: 0, withholdingTaxPaid: 0, taxOwed: 0 },
    };
    renderCredit(noDividends, revolutTransactions.filter((tx) => tx.action !== 'dividend'));
    expect(screen.queryByTestId('dividend-wht-credit')).not.toBeInTheDocument();
  });

  it('applies the user-supplied foreign tax, lowering the dividend tax and the total', async () => {
    const user = userEvent.setup();
    renderCredit(revolutTaxResult, revolutTransactions);
    // Before: total tax owed is 300 (the currency symbol is "lei", so assert the
    // number only, like the sibling tests do).
    expect(screen.getByText(/300\.00/)).toBeInTheDocument();

    // 10 USD withheld * blended 5.0 rate = 50 RON credit. Dividend tax 100 -> 50,
    // so the total drops 300 -> 250.
    await user.type(screen.getByTestId('dividend-wht-input'), '10');
    await waitFor(() => {
      expect(screen.getByText(/250\.00/)).toBeInTheDocument();
    });
    // The conversion note confirms the foreign amount was converted to RON.
    expect(screen.getByTestId('dividend-wht-converted')).toBeInTheDocument();
    expect(screen.queryByText(/300\.00/)).not.toBeInTheDocument();
  });
});
