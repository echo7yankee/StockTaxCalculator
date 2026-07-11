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
import type { TaxCalculationResult, SecurityBreakdown, Transaction, OpeningPosition } from '@shared/index';
import { calculateTaxes, getTaxConfigForYear, romaniaTaxConfig } from '@shared/index';
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
    taxBeforeCredit: 66,
    withholdingTaxPaid: 12,
    foreignTaxCredit: 12,
    taxOwed: 54,
    taxRate: 0.1,
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
function SetupUpload({ children, warnings = [], broker, carriedPositions, carryForwardYear, taxResult = mockTaxResult, transactions = [] }: {
  children: React.ReactNode;
  warnings?: string[];
  broker?: 'trading212' | 'ibkr';
  carriedPositions?: OpeningPosition[];
  carryForwardYear?: number | null;
  taxResult?: TaxCalculationResult;
  transactions?: Transaction[];
}) {
  const { setUploadData } = useUpload();
  const didSet = useRef(false);

  useEffect(() => {
    if (!didSet.current) {
      didSet.current = true;
      setUploadData({
        taxResult,
        securities: mockSecurities,
        fileName: 'annual-statement-2025.pdf',
        taxYear: 2025,
        transactions,
        parseWarnings: warnings,
        ...(broker ? { broker } : {}),
        ...(carriedPositions ? { carriedPositions } : {}),
        ...(carryForwardYear !== undefined ? { carryForwardYear } : {}),
      });
    }
  }, [setUploadData, warnings, broker, carriedPositions, carryForwardYear, taxResult, transactions]);

  return <>{children}</>;
}

function renderResults(
  withData = true,
  warnings: string[] = [],
  broker?: 'trading212' | 'ibkr',
  carriedPositions?: OpeningPosition[],
  carryForwardYear?: number | null,
  overrides?: { taxResult?: TaxCalculationResult; transactions?: Transaction[] },
) {
  if (withData) {
    return render(
      <HelmetProvider>
        <MemoryRouter>
          <CountryProvider>
            <UploadProvider>
              <SetupUpload
                warnings={warnings}
                broker={broker}
                carriedPositions={carriedPositions}
                carryForwardYear={carryForwardYear}
                {...(overrides?.taxResult ? { taxResult: overrides.taxResult } : {})}
                {...(overrides?.transactions ? { transactions: overrides.transactions } : {})}
              >
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
      // The total-card detail line shows the discounted total while the deadline is ahead
      expect(screen.getByText(/After early filing discount: 28,104.78/)).toBeInTheDocument();
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

  it('hides the discounted total on the total card once the deadline has passed', () => {
    // Past the deadline ANAF forfeits the bonificatie, so the total card must not
    // show an "after discount" detail the D212 XML no longer claims. The full tax
    // (totalTaxOwed) still renders as the card's headline value.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-16T12:00:00Z'));
    try {
      renderResults();
      expect(screen.queryByText(/After early filing discount/)).not.toBeInTheDocument();
      expect(screen.queryByText(/28,104.78/)).not.toBeInTheDocument();
      expect(screen.getByTestId('total-tax-owed-value')).toHaveTextContent('28,974.00');
    } finally {
      vi.useRealTimers();
    }
  });

  it('renders per-security table with correct tickers', () => {
    renderResults();
    expect(screen.getByText('PLTR')).toBeInTheDocument();
    expect(screen.getByText('NVDA')).toBeInTheDocument();
  });

  it('does not render the carried-positions panel when nothing was carried', () => {
    renderResults();
    expect(screen.queryByTestId('carried-positions')).not.toBeInTheDocument();
  });

  it('surfaces carried prior-year positions (count, source year, per-position rows)', () => {
    renderResults(true, [], undefined, [
      { isin: 'US5949181045', ticker: 'MSFT', securityName: 'Microsoft', shares: 10, costPerShareLocal: 250 },
    ], 2024);

    const panel = screen.getByTestId('carried-positions');
    expect(panel).toBeInTheDocument();
    // Source year is named in the body.
    expect(screen.getByText(/from your 2024 filing/)).toBeInTheDocument();
    // The carried security row shows ticker + carried shares + cost basis.
    expect(screen.getByText('MSFT')).toBeInTheDocument();
    expect(screen.getByText('Microsoft')).toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument();
    expect(screen.getByText(/250\.00/)).toBeInTheDocument();
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

describe('ResultsPage dividend-credit recompute preserves carry-forward cost basis', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // Regression: the dividend-WHT-credit recompute (displayResult) must pass the
  // carried opening positions through to the engine, exactly like the original
  // UploadPage computation does. Otherwise a carried sell recomputes with cost
  // basis 0 and the capital gains balloon the moment the user enters a credit,
  // producing a wrong (over-stated) tax number on screen, in the save, and in the
  // D212/audit exports. Entering a dividend credit must ONLY affect dividend tax.
  const carried: OpeningPosition[] = [
    { isin: 'US000CARRY01', ticker: 'CARRY', securityName: 'Carried Co', shares: 100, costPerShareLocal: 50 },
  ];
  const txns: Transaction[] = [
    {
      id: 's1', csvUploadId: 'u1', taxYearId: '2025', action: 'sell',
      transactionDate: new Date('2025-06-01'), isin: 'US000CARRY01', ticker: 'CARRY',
      securityName: 'Carried Co', shares: 100, pricePerShare: 80, priceCurrency: 'RON',
      totalAmountOriginal: 8000, exchangeRateToLocal: 1, totalAmountLocal: 8000,
      withholdingTaxOriginal: 0, withholdingTaxCurrency: 'RON', withholdingTaxLocal: 0,
      brokerTransactionId: 's1',
    },
    {
      id: 'd1', csvUploadId: 'u1', taxYearId: '2025', action: 'dividend',
      transactionDate: new Date('2025-07-01'), isin: 'US000DIV0001', ticker: 'DIVCO',
      securityName: 'Div Co', shares: 0, pricePerShare: 0, priceCurrency: 'USD',
      totalAmountOriginal: 100, exchangeRateToLocal: 4.5, totalAmountLocal: 450,
      withholdingTaxOriginal: 0, withholdingTaxCurrency: 'USD', withholdingTaxLocal: 0,
      brokerTransactionId: 'd1',
    },
  ];
  // Baseline computed the way UploadPage does: with the carried positions seeded,
  // the sell's cost basis is 100 x 50 = 5000, so the gain is 8000 - 5000 = 3000
  // and capital gains tax is 300. Without the carry-forward seed the gain would be
  // the full 8000 proceeds and the tax 800.
  const baseline = calculateTaxes(txns, getTaxConfigForYear(romaniaTaxConfig, 2025), 2025, undefined, carried).taxResult;

  it('fixture sanity: carried cost basis yields 300 capital gains tax, not 800', () => {
    expect(baseline.capitalGains.taxOwed).toBe(300);
    expect(baseline.dividends.withholdingTaxPaid).toBe(0);
  });

  it('entering a dividend credit leaves capital gains unchanged (carried cost basis preserved)', async () => {
    const user = userEvent.setup();
    renderResults(true, [], undefined, carried, 2024, { taxResult: baseline, transactions: txns });

    // Initial render shows the carried-basis numbers.
    expect(screen.getByTestId('capital-gains-value')).toHaveTextContent('300.00');
    expect(screen.getByTestId('total-tax-owed-value')).toHaveTextContent('345.00');

    // Enter a foreign withholding credit (in USD). This triggers the recompute.
    await user.type(screen.getByTestId('dividend-wht-input'), '10');

    // The credit zeroes the dividend tax (345 -> 300 total), proving the recompute
    // ran; capital gains MUST stay 300 (would jump to 800 if carried positions were
    // dropped from the recompute).
    await waitFor(() => {
      expect(screen.getByTestId('total-tax-owed-value')).toHaveTextContent('300.00');
    });
    expect(screen.getByTestId('capital-gains-value')).toHaveTextContent('300.00');
    expect(screen.getByTestId('capital-gains-value')).not.toHaveTextContent('800.00');
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
    dividends: { grossTotal: 1000, taxBeforeCredit: 100, withholdingTaxPaid: 0, foreignTaxCredit: 0, taxOwed: 100, taxRate: 0.1 },
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
      dividends: { grossTotal: 0, taxBeforeCredit: 0, withholdingTaxPaid: 0, foreignTaxCredit: 0, taxOwed: 0, taxRate: 0.1 },
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
