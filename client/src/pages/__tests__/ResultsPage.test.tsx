import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
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
function SetupUpload({ children }: { children: React.ReactNode }) {
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
      });
    }
  }, [setUploadData]);

  return <>{children}</>;
}

function renderResults(withData = true) {
  if (withData) {
    return render(
      <MemoryRouter>
        <CountryProvider>
          <UploadProvider>
            <SetupUpload>
              <ResultsPage />
            </SetupUpload>
          </UploadProvider>
        </CountryProvider>
      </MemoryRouter>
    );
  }
  return render(
    <MemoryRouter>
      <CountryProvider>
        <UploadProvider>
          <ResultsPage />
        </UploadProvider>
      </CountryProvider>
    </MemoryRouter>
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
    expect(screen.getByText(/Tax Results — 2025/)).toBeInTheDocument();
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
    expect(screen.getByText(/24x/)).toBeInTheDocument();
  });

  it('shows early filing discount banner', () => {
    renderResults();
    expect(screen.getByText(/File early to save/)).toBeInTheDocument();
    expect(screen.getByText(/869.22/)).toBeInTheDocument();
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
