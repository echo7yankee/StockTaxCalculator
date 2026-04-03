import type { TaxCalculationResult } from '../types/tax';

export interface D212Field {
  id: string;
  section: string;
  sectionTitle: string;
  roLabel: string;
  enLabel: string;
  getValue: (result: TaxCalculationResult) => number;
}

export interface D212Section {
  id: string;
  title: string;
  roTitle: string;
  description: string;
  fields: D212Field[];
}

const capGainsFields: D212Field[] = [
  {
    id: 'cg-proceeds',
    section: 'I.1',
    sectionTitle: 'Capitolul I — Secțiunea 1',
    roLabel: 'Venit',
    enLabel: 'Total Proceeds',
    getValue: (r) => r.capitalGains.totalProceeds,
  },
  {
    id: 'cg-cost',
    section: 'I.1',
    sectionTitle: 'Capitolul I — Secțiunea 1',
    roLabel: 'Cheltuieli',
    enLabel: 'Total Cost Basis',
    getValue: (r) => r.capitalGains.totalCostBasis,
  },
  {
    id: 'cg-net',
    section: 'I.1',
    sectionTitle: 'Capitolul I — Secțiunea 1',
    roLabel: 'Venit net',
    enLabel: 'Net Capital Gain',
    getValue: (r) => r.capitalGains.netGains,
  },
  {
    id: 'cg-tax',
    section: 'I.1',
    sectionTitle: 'Capitolul I — Secțiunea 1',
    roLabel: 'Impozit',
    enLabel: 'Tax (10%)',
    getValue: (r) => r.capitalGains.taxOwed,
  },
];

const dividendFields: D212Field[] = [
  {
    id: 'div-gross',
    section: 'I.3',
    sectionTitle: 'Capitolul I — Secțiunea 3',
    roLabel: 'Venit brut',
    enLabel: 'Gross Dividends',
    getValue: (r) => r.dividends.grossTotal,
  },
  {
    id: 'div-foreign-tax',
    section: 'I.3',
    sectionTitle: 'Capitolul I — Secțiunea 3',
    roLabel: 'Impozit plătit în străinătate',
    enLabel: 'Foreign Withholding Tax Paid',
    getValue: (r) => r.dividends.withholdingTaxPaid,
  },
  {
    id: 'div-tax',
    section: 'I.3',
    sectionTitle: 'Capitolul I — Secțiunea 3',
    roLabel: 'Impozit datorat în România',
    enLabel: 'Tax Owed in Romania',
    getValue: (r) => r.dividends.taxOwed,
  },
];

const cassFields: D212Field[] = [
  {
    id: 'cass-income',
    section: 'II',
    sectionTitle: 'Capitolul II',
    roLabel: 'Total venituri non-salariale',
    enLabel: 'Total Non-Salary Income',
    getValue: (r) => r.healthContribution.totalNonSalaryIncome,
  },
  {
    id: 'cass-owed',
    section: 'II',
    sectionTitle: 'Capitolul II',
    roLabel: 'CASS datorat',
    enLabel: 'Health Contribution Owed',
    getValue: (r) => r.healthContribution.amountOwed,
  },
];

export const d212Sections: D212Section[] = [
  {
    id: 'capital-gains',
    title: 'Capital Gains from Securities',
    roTitle: 'Câștiguri din transferul titlurilor de valoare',
    description: 'Income from selling stocks, ETFs, and other securities.',
    fields: capGainsFields,
  },
  {
    id: 'dividends',
    title: 'Foreign Dividends',
    roTitle: 'Dividende din străinătate',
    description: 'Dividend income received from foreign brokers.',
    fields: dividendFields,
  },
  {
    id: 'cass',
    title: 'Health Contribution (CASS)',
    roTitle: 'Contribuția de asigurări sociale de sănătate',
    description: 'Mandatory health insurance contribution based on total non-salary income.',
    fields: cassFields,
  },
];

export function getAllD212Fields(): D212Field[] {
  return d212Sections.flatMap((s) => s.fields);
}

export function formatD212Summary(result: TaxCalculationResult): string {
  const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const lines: string[] = ['D212 — Declarația Unică — Field Values', ''];

  for (const section of d212Sections) {
    lines.push(`${section.roTitle}`);
    lines.push(`(${section.title})`);
    lines.push('');
    for (const field of section.fields) {
      const value = field.getValue(result);
      lines.push(`  ${field.roLabel}: ${fmt(value)} RON`);
      lines.push(`  (${field.enLabel})`);
    }
    lines.push('');
  }

  lines.push(`Total tax owed: ${fmt(result.totals.totalTaxOwed)} RON`);
  if (result.totals.earlyFilingDiscount > 0) {
    lines.push(`Early filing discount: -${fmt(result.totals.earlyFilingDiscount)} RON`);
    lines.push(`Total after discount: ${fmt(result.totals.totalAfterDiscount)} RON`);
  }

  return lines.join('\n');
}
