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

// Section/sectionTitle map to where each value goes in ANAF's revamped 2026
// Declarația Unică (formular 212) web form (anaf.ro/declaratii/duf), NOT a static
// "Capitolul I, Secțiunea N" numbering. Foreign-broker income is added as a
// "venit din străinătate" entry picked by ANAF category code (2012 = transfer
// titluri / capital gains, 2018 = dividende). CASS on realized investment income
// is computed automatically by the form (in the realized-income chapter, Capitolul I)
// once the income is declared; the user verifies it, they do not type it in
// Capitolul II (which in the 2026 form is the OPTIONAL/voluntary CASS opt-in).
// Verified against ANAF/OPANAF 2736/2025 + the founder's 2026-04-10 filing.

const capGainsFields: D212Field[] = [
  {
    id: 'cg-proceeds',
    section: 'Străinătate cod 2012',
    sectionTitle: 'Venituri din străinătate, categoria 2012 (câștiguri din transferul titlurilor de valoare)',
    roLabel: 'Venit brut',
    enLabel: 'Gross Sale Proceeds',
    getValue: (r) => r.capitalGains.totalProceeds,
  },
  {
    id: 'cg-cost',
    section: 'Străinătate cod 2012',
    sectionTitle: 'Venituri din străinătate, categoria 2012 (câștiguri din transferul titlurilor de valoare)',
    roLabel: 'Cheltuieli deductibile',
    enLabel: 'Cost Basis',
    getValue: (r) => r.capitalGains.totalCostBasis,
  },
  {
    id: 'cg-net',
    section: 'Străinătate cod 2012',
    sectionTitle: 'Venituri din străinătate, categoria 2012 (câștiguri din transferul titlurilor de valoare)',
    roLabel: 'Câștig net anual',
    enLabel: 'Net Annual Gain',
    getValue: (r) => r.capitalGains.netGains,
  },
  {
    id: 'cg-tax',
    section: 'Străinătate cod 2012',
    sectionTitle: 'Venituri din străinătate, categoria 2012 (câștiguri din transferul titlurilor de valoare)',
    roLabel: 'Impozit pe venit datorat în România',
    enLabel: 'Income Tax Owed in Romania',
    getValue: (r) => r.capitalGains.taxOwed,
  },
];

// Dividend lines in ANAF form-row order (Secțiunea 2, categoria 2018): venit brut,
// rd.8 gross RO tax, rd.9 foreign tax paid, rd.10 credit fiscal, rd.11 difference to
// pay. rd.8 - rd.10 = rd.11. The engine surfaces taxBeforeCredit (rd.8) and
// foreignTaxCredit (rd.10) so the rate is applied where it is in scope (dividends are
// 8% in 2023/24, 10% in 2025), not re-derived here.
const dividendFields: D212Field[] = [
  {
    id: 'div-gross',
    section: 'Străinătate cod 2018',
    sectionTitle: 'Venituri din străinătate, categoria 2018 (dividende)',
    roLabel: 'Venit brut',
    enLabel: 'Gross Dividends',
    getValue: (r) => r.dividends.grossTotal,
  },
  {
    id: 'div-tax-gross',
    section: 'Străinătate cod 2018',
    sectionTitle: 'Venituri din străinătate, categoria 2018 (dividende)',
    roLabel: 'Impozit pe venit datorat în România',
    enLabel: 'Income Tax Owed in Romania',
    getValue: (r) => r.dividends.taxBeforeCredit,
  },
  {
    id: 'div-foreign-tax',
    section: 'Străinătate cod 2018',
    sectionTitle: 'Venituri din străinătate, categoria 2018 (dividende)',
    roLabel: 'Impozit pe venit plătit în străinătate',
    enLabel: 'Income Tax Paid Abroad',
    getValue: (r) => r.dividends.withholdingTaxPaid,
  },
  {
    id: 'div-credit',
    section: 'Străinătate cod 2018',
    sectionTitle: 'Venituri din străinătate, categoria 2018 (dividende)',
    roLabel: 'Credit fiscal',
    enLabel: 'Foreign Tax Credit',
    getValue: (r) => r.dividends.foreignTaxCredit,
  },
  {
    id: 'div-tax',
    section: 'Străinătate cod 2018',
    sectionTitle: 'Venituri din străinătate, categoria 2018 (dividende)',
    // dividends.taxOwed is the NET tax after the foreign-tax credit, i.e. ANAF's
    // "Diferența de impozit de plată" (rd.11) = rd.8 (gross) - rd.10 (credit).
    roLabel: 'Diferența de impozit de plată',
    enLabel: 'Difference to Pay',
    getValue: (r) => r.dividends.taxOwed,
  },
];

const cassFields: D212Field[] = [
  {
    id: 'cass-income',
    section: 'Calculat automat',
    sectionTitle: 'Capitolul I, contribuția de sănătate (calculată automat de formular)',
    roLabel: 'Total venituri non-salariale',
    enLabel: 'Total Non-Salary Income',
    getValue: (r) => r.healthContribution.totalNonSalaryIncome,
  },
  {
    id: 'cass-owed',
    section: 'Calculat automat',
    sectionTitle: 'Capitolul I, contribuția de sănătate (calculată automat de formular)',
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

// ANAF's Declarația Unică (D212) amount fields are entered in WHOLE LEI, with no
// decimals and no thousands separator ("fără zecimale, doar suma întreagă"). This is
// the value the user pastes into an SPV form field, so it must be an unambiguous plain
// integer. A grouping separator is dangerous (Romanian reads "," as the decimal point,
// so "28,053.00" is ambiguous), whereas a bare integer parses identically in any locale.
// Rounded arithmetically, the ANAF convention. This is display/copy only, not the engine number.
export function formatD212Value(n: number): string {
  // Math.round(-0.5) === -0, which stringifies to "0" (never "-0").
  return String(Math.round(n));
}

export function formatD212Summary(result: TaxCalculationResult): string {
  const fmt = formatD212Value;
  const lines: string[] = ['D212 Declarația Unică: Field Values', ''];

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
