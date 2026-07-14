import { describe, expect, it } from 'vitest';
import { calculateRomanianInvestmentTax } from '../calculator.js';
import { ROMANIA_TAX_2025, type RomaniaTaxConfig } from '../config.js';

describe('calculateRomanianInvestmentTax', () => {
  it('returns all-zero for empty input', () => {
    const r = calculateRomanianInvestmentTax({ capitalGains: 0, dividends: 0 });
    expect(r).toEqual({
      capitalGainsTax: 0,
      dividendTax: 0,
      healthContribution: 0,
      cassBracket: 'none',
      totalOwed: 0,
      earlyFilingDiscount: 0,
      totalAfterDiscount: 0,
      taxYear: 2025,
      currency: 'RON',
    });
  });

  it('taxes capital gains at 10% and floors the CASS at the none bracket', () => {
    // 20.000 gains: below the 24.300 CASS plafon, so no CASS.
    const r = calculateRomanianInvestmentTax({ capitalGains: 20000, dividends: 0 });
    expect(r.capitalGainsTax).toBeCloseTo(2000, 6);
    expect(r.healthContribution).toBe(0);
    expect(r.cassBracket).toBe('none');
  });

  it('does not tax a capital loss (liability floored at 0)', () => {
    const r = calculateRomanianInvestmentTax({ capitalGains: -5000, dividends: 0 });
    expect(r.capitalGainsTax).toBe(0);
    expect(r.totalOwed).toBe(0);
  });

  it('a capital loss does NOT lower the CASS base (clamped to >= 0)', () => {
    // Clamped base = max(0,-10000)+30000 = 30.000 -> 6x. Unclamped would be
    // 20.000 -> none. The clamp is the correctness point (mirrors the engine).
    const r = calculateRomanianInvestmentTax({ capitalGains: -10000, dividends: 30000 });
    expect(r.cassBracket).toBe('6x');
    expect(r.healthContribution).toBe(2430);
  });

  it('credits foreign withholding against the dividend tax', () => {
    // gross tax = 10.000 * 10% = 1000; 400 already withheld -> 600 net.
    const r = calculateRomanianInvestmentTax({
      capitalGains: 0,
      dividends: 10000,
      withholdingTaxPaid: 400,
    });
    expect(r.dividendTax).toBeCloseTo(600, 6);
  });

  it('floors the dividend tax at 0 when withholding exceeds the RO tax', () => {
    const r = calculateRomanianInvestmentTax({
      capitalGains: 0,
      dividends: 10000,
      withholdingTaxPaid: 5000,
    });
    expect(r.dividendTax).toBe(0);
  });

  it('selects the CASS bracket by total non-salary income, min-inclusive', () => {
    const bracketFor = (base: number) =>
      calculateRomanianInvestmentTax({ capitalGains: base, dividends: 0 }).cassBracket;
    expect(bracketFor(24299)).toBe('none');
    expect(bracketFor(24300)).toBe('6x'); // exactly at the plafon -> higher bracket
    expect(bracketFor(48600)).toBe('12x');
    expect(bracketFor(97200)).toBe('24x');
    expect(bracketFor(500000)).toBe('24x'); // open-ended top
  });

  it('adds otherNonSalaryIncome to the CASS base only (not to income tax)', () => {
    const r = calculateRomanianInvestmentTax({
      capitalGains: 10000,
      dividends: 0,
      otherNonSalaryIncome: 20000,
    });
    // base = 30.000 -> 6x, but income tax is only on the 10.000 gains.
    expect(r.cassBracket).toBe('6x');
    expect(r.capitalGainsTax).toBeCloseTo(1000, 6);
    expect(r.dividendTax).toBe(0);
  });

  it('applies the 3% early-filing bonificatie to the income tax only, never CASS', () => {
    const r = calculateRomanianInvestmentTax({ capitalGains: 50000, dividends: 0 });
    // income tax = 5000; discount = 150; CASS (12x = 4860) is excluded.
    expect(r.capitalGainsTax).toBeCloseTo(5000, 6);
    expect(r.healthContribution).toBe(4860);
    expect(r.earlyFilingDiscount).toBeCloseTo(150, 6);
    expect(r.totalOwed).toBeCloseTo(9860, 6);
    expect(r.totalAfterDiscount).toBeCloseTo(9710, 6);
  });

  it('computes a realistic combined case', () => {
    const r = calculateRomanianInvestmentTax({
      capitalGains: 50000,
      dividends: 10000,
      withholdingTaxPaid: 1000,
    });
    expect(r.capitalGainsTax).toBeCloseTo(5000, 6);
    expect(r.dividendTax).toBe(0); // 1000 gross fully credited by 1000 withheld
    expect(r.cassBracket).toBe('12x'); // base 60.000
    expect(r.healthContribution).toBe(4860);
    expect(r.totalOwed).toBeCloseTo(9860, 6);
    expect(r.earlyFilingDiscount).toBeCloseTo(150, 6);
    expect(r.totalAfterDiscount).toBeCloseTo(9710, 6);
  });

  it('treats omitted optional fields as 0', () => {
    const explicit = calculateRomanianInvestmentTax({
      capitalGains: 15000,
      dividends: 5000,
      withholdingTaxPaid: 0,
      otherNonSalaryIncome: 0,
    });
    const omitted = calculateRomanianInvestmentTax({ capitalGains: 15000, dividends: 5000 });
    expect(omitted).toEqual(explicit);
  });

  it('honours a caller-supplied config (forward-compat with future years)', () => {
    const hypothetical2026: RomaniaTaxConfig = {
      ...ROMANIA_TAX_2025,
      taxYear: 2026,
      capitalGainsTaxRate: 0.16,
      dividendTaxRate: 0.16,
    };
    const r = calculateRomanianInvestmentTax({ capitalGains: 10000, dividends: 0 }, hypothetical2026);
    expect(r.taxYear).toBe(2026);
    expect(r.capitalGainsTax).toBeCloseTo(1600, 6);
  });

  it('throws on non-finite input rather than returning NaN', () => {
    expect(() => calculateRomanianInvestmentTax({ capitalGains: NaN, dividends: 0 })).toThrow(TypeError);
    expect(() => calculateRomanianInvestmentTax({ capitalGains: 0, dividends: Infinity })).toThrow(TypeError);
    expect(() =>
      calculateRomanianInvestmentTax({ capitalGains: 0, dividends: 0, withholdingTaxPaid: NaN }),
    ).toThrow(TypeError);
  });
});
