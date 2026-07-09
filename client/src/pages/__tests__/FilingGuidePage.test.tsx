import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { useEffect, useRef } from 'react';
import { UploadProvider, useUpload } from '../../contexts/UploadContext';
import { CountryProvider } from '../../contexts/CountryContext';
import FilingGuidePage from '../FilingGuidePage';
import type { TaxCalculationResult } from '@shared/index';

// A gain-year result carrying an early-filing discount, so the totals block has
// something to gate on.
const withDiscount: TaxCalculationResult = {
  taxYearId: '2025',
  capitalGains: { totalProceeds: 5000, totalCostBasis: 4000, netGains: 1000, losses: 0, taxRate: 0.1, taxOwed: 100 },
  dividends: { grossTotal: 200, taxBeforeCredit: 20, withholdingTaxPaid: 20, foreignTaxCredit: 20, taxOwed: 0, taxRate: 0.1 },
  healthContribution: { totalNonSalaryIncome: 1200, thresholdHit: 'none', amountOwed: 0 },
  totals: { totalTaxOwed: 100, earlyFilingDiscount: 3, totalAfterDiscount: 97 },
  calculatedAt: new Date('2025-03-01'),
};

function Setup({ children }: { children: React.ReactNode }) {
  const { setUploadData } = useUpload();
  const didSet = useRef(false);
  useEffect(() => {
    if (!didSet.current) {
      didSet.current = true;
      setUploadData({
        taxResult: withDiscount,
        securities: [],
        fileName: 'statement-2025.pdf',
        taxYear: 2025,
        transactions: [],
        parseWarnings: [],
      });
    }
  }, [setUploadData]);
  return <>{children}</>;
}

function renderPage() {
  return render(
    <HelmetProvider>
      <MemoryRouter>
        <CountryProvider>
          <UploadProvider>
            <Setup>
              <FilingGuidePage />
            </Setup>
          </UploadProvider>
        </CountryProvider>
      </MemoryRouter>
    </HelmetProvider>
  );
}

describe('FilingGuidePage early-filing discount totals', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows the discount + after-discount rows while the deadline is still ahead', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-01T12:00:00Z'));
    renderPage();
    expect(screen.getByText(/Total After Discount/)).toBeInTheDocument();
    expect(screen.getByText(/Early Filing Discount/)).toBeInTheDocument();
  });

  it('hides the discount rows once the deadline has passed (bonificatie forfeited)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-16T12:00:00Z'));
    renderPage();
    expect(screen.queryByText(/Total After Discount/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Early Filing Discount/)).not.toBeInTheDocument();
    // The full tax total is still shown.
    expect(screen.getByText(/Total Tax Owed/)).toBeInTheDocument();
  });
});
