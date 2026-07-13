import type { CountryTaxConfig } from '../types/country.js';

export interface QuickTaxInput {
  capitalGains: number;
  dividends: number;
  withholdingTaxPaid: number;
  otherNonSalaryIncome: number;
}

export interface QuickTaxResult {
  capitalGainsTax: number;
  dividendTax: number;
  healthContribution: number;
  bracketLabel: string;
  totalOwed: number;
  earlyFilingDiscount: number;
}

export function calculateQuickTax(input: QuickTaxInput, config: CountryTaxConfig): QuickTaxResult {
  const capitalGainsTax = Math.max(0, input.capitalGains * config.capitalGainsTaxRate);
  const grossDividendTax = input.dividends * config.dividendTaxRate;
  const dividendTax = Math.max(0, grossDividendTax - input.withholdingTaxPaid);

  // CASS base: clamp the capital-gains contribution to >= 0. A transfer-category
  // capital loss does NOT offset dividend (or other) income for the CASS bracket,
  // matching ANAF and the authoritative engine (taxCalculator.ts uses netGains,
  // which is already Math.max(0, ...)). The clamp is on the CASS base ONLY; the
  // capital-gains TAX above still floors a loss to 0 (not negative) separately.
  const totalNonSalary =
    Math.max(0, input.capitalGains) + input.dividends + input.otherNonSalaryIncome;
  let healthContribution = 0;
  let bracketLabel = 'none';
  for (const bracket of config.healthContributionBrackets) {
    if (totalNonSalary >= bracket.minIncome && (bracket.maxIncome === null || totalNonSalary < bracket.maxIncome)) {
      healthContribution = bracket.fixedAmount;
      bracketLabel = bracket.label;
      break;
    }
  }

  const totalOwed = capitalGainsTax + dividendTax + healthContribution;
  const earlyFilingDiscount = (capitalGainsTax + dividendTax) * config.earlyFilingDiscountRate;

  return { capitalGainsTax, dividendTax, healthContribution, bracketLabel, totalOwed, earlyFilingDiscount };
}
