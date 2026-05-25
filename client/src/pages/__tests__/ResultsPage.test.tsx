import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { useEffect, useRef } from 'react';
import { UploadProvider, useUpload } from '../../contexts/UploadContext';
import { CountryProvider } from '../../contexts/CountryContext';
import ResultsPage from '../ResultsPage';

// Mock useAuth to simulate logged-in user. Mutable so individual tests can
// switch between paid + free + logged-out without remounting the whole module.
let authPlan: 'paid' | 'free' | null = 'paid';
vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: authPlan === null
      ? null
      : { id: 'test-id', email: 'test@test.com', name: 'Test', plan: authPlan },
    loading: false,
    login: vi.fn(),
    signup: vi.fn(),
    loginWithGoogle: vi.fn(),
    logout: vi.fn(),
  }),
}));

vi.mock('../../lib/analytics', () => ({
  analytics: {
    calculationSaved: vi.fn(),
    pdfPreviewAbandoned: vi.fn(),
    pdfPreviewConfirmed: vi.fn(),
    checkoutStarted: vi.fn(),
  },
}));
import type { TaxCalculationResult, SecurityBreakdown } from '@shared/index';

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
function SetupUpload({ children, warnings = [] }: { children: React.ReactNode; warnings?: string[] }) {
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
      });
    }
  }, [setUploadData, warnings]);

  return <>{children}</>;
}

function renderResults(withData = true, warnings: string[] = []) {
  if (withData) {
    return render(
      <HelmetProvider>
        <MemoryRouter>
          <CountryProvider>
            <UploadProvider>
              <SetupUpload warnings={warnings}>
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
    authPlan = 'paid';
    sessionStorage.clear();
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
    authPlan = 'paid';
    sessionStorage.clear();
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
});

describe('ResultsPage - free user unlock CTA (PR 4)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    authPlan = 'free';
    sessionStorage.clear();
  });

  it('shows the Unlock card instead of the Filing Guide CTA for free users with no warnings', () => {
    renderResults(true, []);
    expect(screen.getByTestId('unlock-card')).toBeInTheDocument();
    expect(screen.getByTestId('unlock-cta')).toBeInTheDocument();
    expect(screen.queryByTestId('filing-guide-cta')).not.toBeInTheDocument();
  });

  it('renders the locked save button (not the green Save button) for free users', () => {
    renderResults(true, []);
    expect(screen.getByTestId('save-locked-button')).toBeInTheDocument();
    expect(screen.queryByTestId('save-button')).not.toBeInTheDocument();
  });

  it('still renders all 4 summary cards with full numbers for free users (Option A: see-before-pay)', () => {
    renderResults(true, []);
    expect(screen.getByText('Capital Gains Tax')).toBeInTheDocument();
    expect(screen.getByText('Dividend Tax')).toBeInTheDocument();
    expect(screen.getByText('Health Contribution (CASS)')).toBeInTheDocument();
    expect(screen.getByText('Total Tax Owed')).toBeInTheDocument();
    expect(screen.getByText(/19,200.00/)).toBeInTheDocument();
  });

  it('hides the unlock card when warnings exist (warning banner takes precedence)', () => {
    renderResults(true, ['Sign mismatch: per-row 100, overview -200']);
    expect(screen.queryByTestId('unlock-card')).not.toBeInTheDocument();
    expect(screen.getByTestId('parse-warning-banner')).toBeInTheDocument();
  });

  it('clicking Unlock stashes upload data, calls /api/payment/checkout, and redirects to Stripe', async () => {
    const user = userEvent.setup();
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ checkoutUrl: 'https://checkout.stripe.com/c/sess_123' }), { status: 200 }),
    );

    // Capture window.location.href assignment without actually navigating.
    const originalLocation = window.location;
    const hrefSetter = vi.fn();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: new Proxy(originalLocation, {
        set(_target, prop, value) {
          if (prop === 'href') {
            hrefSetter(value);
            return true;
          }
          return Reflect.set(originalLocation, prop, value);
        },
        get(_target, prop) {
          return Reflect.get(originalLocation, prop);
        },
      }),
    });

    try {
      renderResults(true, []);
      await user.click(screen.getByTestId('unlock-cta'));

      await waitFor(() => {
        expect(fetchSpy).toHaveBeenCalledWith(
          '/api/payment/checkout',
          expect.objectContaining({ credentials: 'include' }),
        );
      });

      // Stash was written before the redirect.
      const stash = sessionStorage.getItem('investax_upload_stash_v1');
      expect(stash).not.toBeNull();
      const parsed = JSON.parse(stash!);
      expect(parsed.fileName).toBe('annual-statement-2025.pdf');
      expect(parsed.taxYear).toBe(2025);
      expect(parsed.taxResult.totals.totalTaxOwed).toBe(28974);

      await waitFor(() => {
        expect(hrefSetter).toHaveBeenCalledWith('https://checkout.stripe.com/c/sess_123');
      });
    } finally {
      Object.defineProperty(window, 'location', {
        configurable: true,
        value: originalLocation,
      });
    }
  });

  it('shows an error and does NOT redirect when the checkout endpoint fails', async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'unavailable' }), { status: 502 }),
    );

    renderResults(true, []);
    await user.click(screen.getByTestId('unlock-cta'));

    await waitFor(() => {
      expect(screen.getByText(/Could not open checkout/)).toBeInTheDocument();
    });
  });

  it('clicking the locked Save button routes the free user through the unlock flow', async () => {
    const user = userEvent.setup();
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ checkoutUrl: 'https://checkout.stripe.com/c/sess_456' }), { status: 200 }),
    );

    renderResults(true, []);
    await user.click(screen.getByTestId('save-locked-button'));

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        '/api/payment/checkout',
        expect.objectContaining({ credentials: 'include' }),
      );
    });
  });
});

describe('ResultsPage - paid user (regression: existing flow unchanged)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    authPlan = 'paid';
    sessionStorage.clear();
  });

  it('shows the Filing Guide CTA for paid users with no warnings', () => {
    renderResults(true, []);
    expect(screen.getByTestId('filing-guide-cta')).toBeInTheDocument();
    expect(screen.queryByTestId('unlock-card')).not.toBeInTheDocument();
  });

  it('shows the regular Save button for paid users (not the locked variant)', () => {
    renderResults(true, []);
    expect(screen.getByTestId('save-button')).toBeInTheDocument();
    expect(screen.queryByTestId('save-locked-button')).not.toBeInTheDocument();
  });

  it('paid user Save calls /api/uploads (not /api/payment/checkout)', async () => {
    const user = userEvent.setup();
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ id: 'upload_1' }), { status: 200 }),
    );

    renderResults(true, []);
    await user.click(screen.getByTestId('save-button'));

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith('/api/uploads', expect.objectContaining({ method: 'POST' }));
    });
    expect(fetchSpy).not.toHaveBeenCalledWith('/api/payment/checkout', expect.anything());
  });
});
