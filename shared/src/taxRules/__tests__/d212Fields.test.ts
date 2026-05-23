import { describe, it, expect } from 'vitest';
import {
  d212Sections,
  getAllD212Fields,
  formatD212Summary,
  type D212Field,
} from '../d212Fields.js';
import type { TaxCalculationResult } from '../../types/tax.js';

function makeResult(overrides: Partial<TaxCalculationResult> = {}): TaxCalculationResult {
  return {
    taxYearId: 'test-year',
    capitalGains: {
      totalProceeds: 100_000,
      totalCostBasis: 80_000,
      netGains: 20_000,
      losses: 0,
      taxRate: 0.10,
      taxOwed: 2000,
    },
    dividends: {
      grossTotal: 1500,
      withholdingTaxPaid: 225,
      taxOwed: -75,
    },
    healthContribution: {
      totalNonSalaryIncome: 21_500,
      thresholdHit: 'none',
      amountOwed: 0,
    },
    totals: {
      totalTaxOwed: 2000,
      earlyFilingDiscount: 60,
      totalAfterDiscount: 1940,
    },
    calculatedAt: new Date('2026-04-10T08:00:00Z'),
    ...overrides,
  };
}

describe('d212Sections - shape', () => {
  it('exposes 3 sections: capital gains, dividends, CASS', () => {
    expect(d212Sections).toHaveLength(3);
    const ids = d212Sections.map((s) => s.id);
    expect(ids).toEqual(['capital-gains', 'dividends', 'cass']);
  });

  it('each section has a romanian title, english title, description, and field list', () => {
    for (const section of d212Sections) {
      expect(section.id).toBeTruthy();
      expect(section.title).toBeTruthy();
      expect(section.roTitle).toBeTruthy();
      expect(section.description).toBeTruthy();
      expect(Array.isArray(section.fields)).toBe(true);
      expect(section.fields.length).toBeGreaterThan(0);
    }
  });

  it('the capital-gains section has 4 fields tagged section I.1', () => {
    const cg = d212Sections.find((s) => s.id === 'capital-gains')!;
    expect(cg.fields).toHaveLength(4);
    expect(cg.fields.every((f) => f.section === 'I.1')).toBe(true);
  });

  it('the dividends section has 3 fields tagged section I.3', () => {
    const div = d212Sections.find((s) => s.id === 'dividends')!;
    expect(div.fields).toHaveLength(3);
    expect(div.fields.every((f) => f.section === 'I.3')).toBe(true);
  });

  it('the CASS section has 2 fields tagged section II', () => {
    const cass = d212Sections.find((s) => s.id === 'cass')!;
    expect(cass.fields).toHaveLength(2);
    expect(cass.fields.every((f) => f.section === 'II')).toBe(true);
  });

  it('every field has a unique id', () => {
    const ids = d212Sections.flatMap((s) => s.fields.map((f) => f.id));
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('getAllD212Fields', () => {
  it('flattens fields across all sections', () => {
    const all = getAllD212Fields();
    expect(all).toHaveLength(4 + 3 + 2);
  });

  it('preserves the section order (capital gains, dividends, CASS)', () => {
    const all = getAllD212Fields();
    expect(all[0].id).toBe('cg-proceeds');
    expect(all[4].id).toBe('div-gross');
    expect(all[7].id).toBe('cass-income');
  });
});

describe('D212Field.getValue - extracts the correct number from a TaxCalculationResult', () => {
  const result = makeResult();
  const byId = new Map(getAllD212Fields().map((f) => [f.id, f as D212Field]));

  it('cg-proceeds reads capitalGains.totalProceeds', () => {
    expect(byId.get('cg-proceeds')!.getValue(result)).toBe(100_000);
  });

  it('cg-cost reads capitalGains.totalCostBasis', () => {
    expect(byId.get('cg-cost')!.getValue(result)).toBe(80_000);
  });

  it('cg-net reads capitalGains.netGains', () => {
    expect(byId.get('cg-net')!.getValue(result)).toBe(20_000);
  });

  it('cg-tax reads capitalGains.taxOwed', () => {
    expect(byId.get('cg-tax')!.getValue(result)).toBe(2000);
  });

  it('div-gross reads dividends.grossTotal', () => {
    expect(byId.get('div-gross')!.getValue(result)).toBe(1500);
  });

  it('div-foreign-tax reads dividends.withholdingTaxPaid', () => {
    expect(byId.get('div-foreign-tax')!.getValue(result)).toBe(225);
  });

  it('div-tax reads dividends.taxOwed (may be negative when WHT credit overflows)', () => {
    expect(byId.get('div-tax')!.getValue(result)).toBe(-75);
  });

  it('cass-income reads healthContribution.totalNonSalaryIncome', () => {
    expect(byId.get('cass-income')!.getValue(result)).toBe(21_500);
  });

  it('cass-owed reads healthContribution.amountOwed', () => {
    expect(byId.get('cass-owed')!.getValue(result)).toBe(0);
  });
});

describe('formatD212Summary', () => {
  it('returns a multi-line summary that includes the three section titles', () => {
    const out = formatD212Summary(makeResult());
    expect(out).toContain('D212 Declarația Unică');
    expect(out).toContain('Câștiguri din transferul titlurilor de valoare');
    expect(out).toContain('Dividende din străinătate');
    expect(out).toContain('Contribuția de asigurări sociale de sănătate');
  });

  it('formats each field as "roLabel: value RON" with 2 decimals', () => {
    const out = formatD212Summary(makeResult());
    expect(out).toContain('Venit: 100,000.00 RON');
    expect(out).toContain('Cheltuieli: 80,000.00 RON');
    expect(out).toContain('Venit net: 20,000.00 RON');
    expect(out).toContain('Impozit: 2,000.00 RON');
    expect(out).toContain('Venit brut: 1,500.00 RON');
    expect(out).toContain('Impozit plătit în străinătate: 225.00 RON');
  });

  it('includes the english label in parentheses under each field', () => {
    const out = formatD212Summary(makeResult());
    expect(out).toContain('(Total Proceeds)');
    expect(out).toContain('(Gross Dividends)');
    expect(out).toContain('(Health Contribution Owed)');
  });

  it('appends the total tax owed at the bottom', () => {
    const out = formatD212Summary(makeResult());
    expect(out).toContain('Total tax owed: 2,000.00 RON');
  });

  it('appends the early-filing discount + total after discount only when discount > 0', () => {
    const withDiscount = formatD212Summary(makeResult());
    expect(withDiscount).toContain('Early filing discount: -60.00 RON');
    expect(withDiscount).toContain('Total after discount: 1,940.00 RON');

    const noDiscount = formatD212Summary(
      makeResult({
        totals: { totalTaxOwed: 2000, earlyFilingDiscount: 0, totalAfterDiscount: 2000 },
      }),
    );
    expect(noDiscount).not.toContain('Early filing discount');
    expect(noDiscount).not.toContain('Total after discount');
  });
});
