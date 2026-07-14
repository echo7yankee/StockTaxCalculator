import { describe, expect, it } from 'vitest';
import { ROMANIA_TAX_2025, DEFAULT_ROMANIA_TAX_CONFIG } from '../config.js';

// SOURCE OF TRUTH: these values mirror InvesTax `shared/src/taxRules/romania.ts`
// (tax year 2025). They are public tax law. If Legea 239/2025 (2026: 16%) is
// applied to the app, a NEW config must be added here too, not an edit to 2025.
describe('ROMANIA_TAX_2025 config', () => {
  it('pins the 2025 rates', () => {
    expect(ROMANIA_TAX_2025.taxYear).toBe(2025);
    expect(ROMANIA_TAX_2025.currency).toBe('RON');
    expect(ROMANIA_TAX_2025.capitalGainsTaxRate).toBe(0.1);
    expect(ROMANIA_TAX_2025.dividendTaxRate).toBe(0.1);
    expect(ROMANIA_TAX_2025.earlyFilingDiscountRate).toBe(0.03);
  });

  it('pins the CASS brackets to the 2025 minimum-wage plafoane', () => {
    expect(ROMANIA_TAX_2025.cassBrackets).toEqual([
      { minIncome: 0, maxIncome: 24300, fixedAmount: 0, label: 'none' },
      { minIncome: 24300, maxIncome: 48600, fixedAmount: 2430, label: '6x' },
      { minIncome: 48600, maxIncome: 97200, fixedAmount: 4860, label: '12x' },
      { minIncome: 97200, maxIncome: null, fixedAmount: 9720, label: '24x' },
    ]);
  });

  it('has ascending, contiguous brackets with an open-ended top', () => {
    const b = ROMANIA_TAX_2025.cassBrackets;
    expect(b[0].minIncome).toBe(0);
    for (let i = 1; i < b.length; i++) {
      // each bracket starts exactly where the previous one ended (no gap/overlap)
      expect(b[i].minIncome).toBe(b[i - 1].maxIncome);
    }
    expect(b[b.length - 1].maxIncome).toBeNull();
  });

  it('each non-zero bracket amount is 10% of its plafon threshold (cota CASS)', () => {
    for (const bracket of ROMANIA_TAX_2025.cassBrackets) {
      if (bracket.fixedAmount > 0) {
        expect(bracket.fixedAmount).toBeCloseTo(bracket.minIncome * 0.1, 2);
      }
    }
  });

  it('defaults to the 2025 config', () => {
    expect(DEFAULT_ROMANIA_TAX_CONFIG).toBe(ROMANIA_TAX_2025);
  });
});
