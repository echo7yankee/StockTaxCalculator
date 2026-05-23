import { describe, it, expect } from 'vitest';
import { calculateQuickTax, type QuickTaxInput } from '../quickCalculator.js';
import { romaniaTaxConfig } from '../../taxRules/romania.js';
import type { CountryTaxConfig } from '../../types/country.js';

function input(overrides: Partial<QuickTaxInput> = {}): QuickTaxInput {
  return {
    capitalGains: 0,
    dividends: 0,
    withholdingTaxPaid: 0,
    otherNonSalaryIncome: 0,
    ...overrides,
  };
}

describe('calculateQuickTax - capital gains', () => {
  it('applies the configured rate to a positive capital gain', () => {
    const r = calculateQuickTax(input({ capitalGains: 10000 }), romaniaTaxConfig);
    expect(r.capitalGainsTax).toBeCloseTo(1000, 6);
  });

  it('clamps a capital loss to zero tax (no negative liability)', () => {
    const r = calculateQuickTax(input({ capitalGains: -5000 }), romaniaTaxConfig);
    expect(r.capitalGainsTax).toBe(0);
  });

  it('returns zero capital gains tax for a zero gain', () => {
    const r = calculateQuickTax(input({ capitalGains: 0 }), romaniaTaxConfig);
    expect(r.capitalGainsTax).toBe(0);
  });
});

describe('calculateQuickTax - dividends and WHT credit', () => {
  it('applies the configured rate to gross dividends with no WHT', () => {
    const r = calculateQuickTax(input({ dividends: 1000 }), romaniaTaxConfig);
    expect(r.dividendTax).toBeCloseTo(100, 6);
  });

  it('subtracts WHT already paid abroad as a credit', () => {
    // 1000 * 10% = 100 gross. WHT 30 paid abroad -> 70 owed locally.
    const r = calculateQuickTax(
      input({ dividends: 1000, withholdingTaxPaid: 30 }),
      romaniaTaxConfig,
    );
    expect(r.dividendTax).toBeCloseTo(70, 6);
  });

  it('clamps dividend tax to zero when WHT paid abroad exceeds Romanian liability', () => {
    // 1000 * 10% = 100; 150 WHT > 100 -> clamp, no refund.
    const r = calculateQuickTax(
      input({ dividends: 1000, withholdingTaxPaid: 150 }),
      romaniaTaxConfig,
    );
    expect(r.dividendTax).toBe(0);
  });
});

describe('calculateQuickTax - CASS bracket selection', () => {
  it('returns no CASS for total non-salary income below the first threshold (24,300)', () => {
    const r = calculateQuickTax(input({ capitalGains: 20000 }), romaniaTaxConfig);
    expect(r.healthContribution).toBe(0);
    expect(r.bracketLabel).toBe('none');
  });

  it('returns 2430 (6x) at the lower boundary of the second bracket (24,300)', () => {
    const r = calculateQuickTax(input({ capitalGains: 24300 }), romaniaTaxConfig);
    expect(r.healthContribution).toBe(2430);
    expect(r.bracketLabel).toBe('6x');
  });

  it('returns 4860 (12x) at the lower boundary of the third bracket (48,600)', () => {
    const r = calculateQuickTax(input({ capitalGains: 48600 }), romaniaTaxConfig);
    expect(r.healthContribution).toBe(4860);
    expect(r.bracketLabel).toBe('12x');
  });

  it('returns 9720 (24x) at the lower boundary of the top bracket (97,200) and above', () => {
    const lower = calculateQuickTax(input({ capitalGains: 97200 }), romaniaTaxConfig);
    expect(lower.healthContribution).toBe(9720);
    expect(lower.bracketLabel).toBe('24x');

    const above = calculateQuickTax(input({ capitalGains: 1_000_000 }), romaniaTaxConfig);
    expect(above.healthContribution).toBe(9720);
    expect(above.bracketLabel).toBe('24x');
  });

  it('sums capital gains + dividends + other non-salary income for the CASS base', () => {
    // 10000 + 10000 + 5000 = 25000 -> 6x bracket.
    const r = calculateQuickTax(
      input({ capitalGains: 10000, dividends: 10000, otherNonSalaryIncome: 5000 }),
      romaniaTaxConfig,
    );
    expect(r.bracketLabel).toBe('6x');
    expect(r.healthContribution).toBe(2430);
  });

  it('uses gross dividends (NOT WHT-credited) for the CASS base', () => {
    // Even if WHT credit zeroes dividend tax, the gross 25000 dividend still counts toward CASS.
    const r = calculateQuickTax(
      input({ dividends: 25000, withholdingTaxPaid: 5000 }),
      romaniaTaxConfig,
    );
    expect(r.bracketLabel).toBe('6x');
    expect(r.healthContribution).toBe(2430);
  });

  it('excludes WHT paid from the CASS base (WHT is a credit, not income)', () => {
    // Boundary check: gross 24300 dividends, WHT 5000 -> still 6x bracket on gross.
    const r = calculateQuickTax(
      input({ dividends: 24300, withholdingTaxPaid: 5000 }),
      romaniaTaxConfig,
    );
    expect(r.bracketLabel).toBe('6x');
  });

  it('selects no bracket when a custom config defines no matching bracket', () => {
    const customConfig: CountryTaxConfig = {
      ...romaniaTaxConfig,
      healthContributionBrackets: [
        { minIncome: 100_000, maxIncome: 200_000, fixedAmount: 1000, label: 'high' },
      ],
    };
    const r = calculateQuickTax(input({ capitalGains: 1000 }), customConfig);
    expect(r.healthContribution).toBe(0);
    expect(r.bracketLabel).toBe('none');
  });
});

describe('calculateQuickTax - totals and early-filing discount', () => {
  it('totalOwed sums capital gains tax, dividend tax, and CASS', () => {
    // 50000 CG -> 5000 tax; 1000 dividends -> 100; total income 51000 -> 12x bracket -> 4860 CASS.
    const r = calculateQuickTax(
      input({ capitalGains: 50000, dividends: 1000 }),
      romaniaTaxConfig,
    );
    expect(r.capitalGainsTax).toBeCloseTo(5000, 6);
    expect(r.dividendTax).toBeCloseTo(100, 6);
    expect(r.healthContribution).toBe(4860);
    expect(r.totalOwed).toBeCloseTo(5000 + 100 + 4860, 6);
  });

  it('earlyFilingDiscount is the configured rate applied to taxes only (not CASS)', () => {
    // CG tax 5000 + div tax 100 = 5100; discount 3% = 153. CASS excluded.
    const r = calculateQuickTax(
      input({ capitalGains: 50000, dividends: 1000 }),
      romaniaTaxConfig,
    );
    expect(r.earlyFilingDiscount).toBeCloseTo(153, 6);
  });

  it('earlyFilingDiscount is zero when both capital-gains and dividend taxes are zero', () => {
    // Only CASS-only income via otherNonSalaryIncome -> taxes are 0, so discount is 0.
    const r = calculateQuickTax(input({ otherNonSalaryIncome: 50000 }), romaniaTaxConfig);
    expect(r.capitalGainsTax).toBe(0);
    expect(r.dividendTax).toBe(0);
    expect(r.earlyFilingDiscount).toBe(0);
  });
});
