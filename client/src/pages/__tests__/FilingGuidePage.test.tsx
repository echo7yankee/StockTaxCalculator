import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { useEffect, useRef } from 'react';
import { UploadProvider, useUpload } from '../../contexts/UploadContext';
import { CountryProvider } from '../../contexts/CountryContext';
import FilingGuidePage from '../FilingGuidePage';
import type { TaxCalculationResult, ParserWarning } from '@shared/index';

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

interface SetupOpts {
  taxResult?: TaxCalculationResult;
  correctedTaxResult?: TaxCalculationResult | null;
  warnings?: string[];
  structuredWarnings?: ParserWarning[];
}

function Setup({ children, opts }: { children: React.ReactNode; opts: SetupOpts }) {
  const { setUploadData } = useUpload();
  const didSet = useRef(false);
  useEffect(() => {
    if (!didSet.current) {
      didSet.current = true;
      setUploadData({
        taxResult: opts.taxResult ?? withDiscount,
        correctedTaxResult: opts.correctedTaxResult ?? null,
        securities: [],
        fileName: 'statement-2025.pdf',
        taxYear: 2025,
        transactions: [],
        parseWarnings: opts.warnings ?? [],
        parseStructuredWarnings: opts.structuredWarnings ?? [],
      });
    }
  }, [setUploadData, opts.taxResult, opts.correctedTaxResult, opts.warnings, opts.structuredWarnings]);
  return <>{children}</>;
}

function renderPage(opts: SetupOpts = {}) {
  return render(
    <HelmetProvider>
      <MemoryRouter>
        <CountryProvider>
          <UploadProvider>
            <Setup opts={opts}>
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

describe('FilingGuidePage parse-warning hard-stop (#24A, S11-aligned)', () => {
  // Blocking = the shared hasBlockingParseWarning predicate: fatal structured
  // severity, a legacy fatal-prose marker, or an engine #24C refusal.
  const engineSignMismatch =
    'Sign mismatch between per-row sell trades (-226.80 USD) and overview closed result (3273.75 USD). The PDF may have a multi-account layout the parser misread.';
  const fatalStructured: ParserWarning = {
    code: 't212_missing_total_column',
    severity: 'fatal',
    message: 'Could not find a total column on 2 row(s). Trading212 names it "Total" or "Total (<currency>)" after your account\'s base currency. Without it the amounts on those rows read as zero, which would under-report your declaration.',
  };
  const infoStructured: ParserWarning = {
    code: 't212_interest_income_out_of_scope',
    severity: 'info',
    message: 'Detected 2 interest-income row(s) (e.g. "Interest on cash"). InvesTax does not calculate interest income; it is taxable (venituri din dobanzi) and must be declared separately.',
  };

  it('shows the D212 copy-paste values + PDF export when the parse is clean', () => {
    renderPage({ warnings: [] });
    // No hard-stop banner, no info notice, and the copy/export affordances are present.
    expect(screen.queryByTestId('filing-parse-warning-banner')).not.toBeInTheDocument();
    expect(screen.queryByTestId('filing-parse-info-notice')).not.toBeInTheDocument();
    expect(screen.getByText('Download PDF')).toBeInTheDocument();
    expect(screen.getByText('Copy All')).toBeInTheDocument();
    // A D212 field value renders in whole lei (net annual gain = 1000, not 1,000.00).
    expect(screen.getByText('1000')).toBeInTheDocument();
  });

  it('hard-stops (red banner) and hides the D212 values + PDF export on an engine refusal', () => {
    renderPage({ warnings: [engineSignMismatch] });
    // The same red parse-warning banner as ResultsPage, with the contact CTA.
    const banner = screen.getByTestId('filing-parse-warning-banner');
    expect(banner).toBeInTheDocument();
    expect(banner).toHaveAttribute('role', 'alert');
    expect(screen.getByTestId('filing-parse-warning-contact-cta')).toBeInTheDocument();
    expect(screen.getByText(/Sign mismatch between per-row/)).toBeInTheDocument();
    // The copy-paste D212 values + PDF export must NOT be reachable on a blocked parse.
    expect(screen.queryByText('Download PDF')).not.toBeInTheDocument();
    expect(screen.queryByText('Copy All')).not.toBeInTheDocument();
    expect(screen.queryByText('1000')).not.toBeInTheDocument();
  });

  it('hard-stops on a fatal structured warning', () => {
    renderPage({ warnings: [fatalStructured.message], structuredWarnings: [fatalStructured] });
    expect(screen.getByTestId('filing-parse-warning-banner')).toBeInTheDocument();
    expect(screen.queryByText('Download PDF')).not.toBeInTheDocument();
    expect(screen.queryByText('1000')).not.toBeInTheDocument();
  });

  it('keeps the D212 values + PDF export on an info-only warning, with the notice visible (S11)', () => {
    renderPage({ warnings: [infoStructured.message], structuredWarnings: [infoStructured] });
    // No red hard-stop; the paid output stays reachable.
    expect(screen.queryByTestId('filing-parse-warning-banner')).not.toBeInTheDocument();
    expect(screen.getByText('Download PDF')).toBeInTheDocument();
    expect(screen.getByText('Copy All')).toBeInTheDocument();
    expect(screen.getByText('1000')).toBeInTheDocument();
    // The warning stays visible as a non-blocking note (never silent).
    // S19-N2: the testIdPrefix must also prefix the labelling heading's id,
    // so the two page instances can never collide on a duplicate DOM id.
    expect(screen.getByTestId('filing-parse-info-notice')).toHaveAttribute(
      'aria-labelledby',
      'filing-parse-info-title'
    );
    expect(screen.getByText(infoStructured.message)).toBeInTheDocument();
  });
});

describe('FilingGuidePage withholding-corrected result (money-path agreement)', () => {
  it('reflects the credit-corrected dividend tax + total, not the un-credited taxResult', () => {
    // Un-credited: dividend difference-to-pay 66, total 888.88 (rounds to a unique 889).
    const uncorrected: TaxCalculationResult = {
      ...withDiscount,
      dividends: { grossTotal: 660, taxBeforeCredit: 66, withholdingTaxPaid: 0, foreignTaxCredit: 0, taxOwed: 66, taxRate: 0.1 },
      totals: { totalTaxOwed: 888.88, earlyFilingDiscount: 0, totalAfterDiscount: 888.88 },
    };
    // After the user applied a foreign credit on Results (persisted to context):
    // dividend difference-to-pay drops to 42.42 (-> 42) and the total to 1234.56 (-> 1235).
    const corrected: TaxCalculationResult = {
      ...uncorrected,
      dividends: { grossTotal: 660, taxBeforeCredit: 66, withholdingTaxPaid: 23.58, foreignTaxCredit: 23.58, taxOwed: 42.42, taxRate: 0.1 },
      totals: { totalTaxOwed: 1234.56, earlyFilingDiscount: 0, totalAfterDiscount: 1234.56 },
    };
    renderPage({ taxResult: uncorrected, correctedTaxResult: corrected });

    // The corrected dividend difference-to-pay + total are shown, whole-lei rounded.
    // The field value is its own text node ("42"); the total row combines with the
    // currency symbol into one node ("1235 RON"), so match it with a regex.
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText(/1235/)).toBeInTheDocument();
    // The over-stated un-credited total (888.88 -> 889) must NOT leak into the D212 guide.
    expect(screen.queryByText(/889/)).not.toBeInTheDocument();
  });
});
