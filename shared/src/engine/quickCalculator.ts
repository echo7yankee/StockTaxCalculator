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

  const totalNonSalary = input.capitalGains + input.dividends + input.otherNonSalaryIncome;
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
