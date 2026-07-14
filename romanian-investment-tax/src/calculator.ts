import {
  DEFAULT_ROMANIA_TAX_CONFIG,
  type CassBracketLabel,
  type RomaniaTaxConfig,
} from './config.js';

/** Figures the caller supplies, all amounts already converted to RON. */
export interface RomanianInvestmentTaxInput {
  /** Net capital gains from securities transfers, in RON (a loss may be negative). */
  capitalGains: number;
  /** Gross dividends received, in RON. */
  dividends: number;
  /**
   * Foreign withholding tax already paid on those dividends, in RON. Credited
   * against the Romanian dividend tax (capped at it). Defaults to 0.
   */
  withholdingTaxPaid?: number;
  /**
   * Other non-salary income counted toward the CASS base (e.g. rent, PFA), in
   * RON. Does not add income tax here; only shifts the CASS bracket. Defaults to 0.
   */
  otherNonSalaryIncome?: number;
}

/** The deterministic estimate. All monetary fields are RON, unrounded. */
export interface RomanianInvestmentTaxResult {
  /** Tax on capital gains (0 if the net is a loss). */
  capitalGainsTax: number;
  /** Tax on dividends, net of the foreign-withholding credit (never negative). */
  dividendTax: number;
  /** CASS health contribution: a flat bracket amount, not a percentage. */
  healthContribution: number;
  /** Which CASS bracket applied. */
  cassBracket: CassBracketLabel;
  /** capitalGainsTax + dividendTax + healthContribution. */
  totalOwed: number;
  /** Bonificatie for early filing (fraction of the income tax, excludes CASS). */
  earlyFilingDiscount: number;
  /** totalOwed - earlyFilingDiscount. */
  totalAfterDiscount: number;
  /** The tax year the estimate was computed for. */
  taxYear: number;
  /** Always 'RON'. */
  currency: 'RON';
}

function assertFinite(name: string, value: number): void {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`romanian-investment-tax: "${name}" must be a finite number, got ${value}`);
  }
}

/**
 * Estimate the Romanian personal investment tax owed on the Declaratia Unica
 * (D212) for a set of already-RON-converted figures.
 *
 * This is the same deterministic estimate as the free InvesTax calculator: a
 * manual, per-figure estimate. It is NOT a substitute for parsing a real broker
 * statement (per-transaction BNR conversion, weighted-average cost basis, split
 * handling and the filing-ready D212 are the paid InvesTax product). See the
 * README. Not tax advice.
 *
 * @param input  Figures in RON.
 * @param config Tax-year config; defaults to {@link ROMANIA_TAX_2025}.
 */
export function calculateRomanianInvestmentTax(
  input: RomanianInvestmentTaxInput,
  config: RomaniaTaxConfig = DEFAULT_ROMANIA_TAX_CONFIG,
): RomanianInvestmentTaxResult {
  const capitalGains = input.capitalGains;
  const dividends = input.dividends;
  const withholdingTaxPaid = input.withholdingTaxPaid ?? 0;
  const otherNonSalaryIncome = input.otherNonSalaryIncome ?? 0;

  assertFinite('capitalGains', capitalGains);
  assertFinite('dividends', dividends);
  assertFinite('withholdingTaxPaid', withholdingTaxPaid);
  assertFinite('otherNonSalaryIncome', otherNonSalaryIncome);

  // A capital loss owes no tax (it does not become a negative liability).
  const capitalGainsTax = Math.max(0, capitalGains * config.capitalGainsTaxRate);

  // Dividend tax net of the foreign-withholding credit, floored at 0 (the credit
  // never produces a refund of Romanian tax).
  const grossDividendTax = dividends * config.dividendTaxRate;
  const dividendTax = Math.max(0, grossDividendTax - withholdingTaxPaid);

  // CASS base: a transfer-category capital LOSS does not offset other income for
  // the bracket, so clamp the capital-gains contribution to >= 0. This mirrors
  // ANAF and the InvesTax engine (which feeds the bracket its already-floored
  // net gains).
  const cassBase = Math.max(0, capitalGains) + dividends + otherNonSalaryIncome;
  let healthContribution = 0;
  let cassBracket: CassBracketLabel = 'none';
  for (const bracket of config.cassBrackets) {
    if (cassBase >= bracket.minIncome && (bracket.maxIncome === null || cassBase < bracket.maxIncome)) {
      healthContribution = bracket.fixedAmount;
      cassBracket = bracket.label;
      break;
    }
  }

  const totalOwed = capitalGainsTax + dividendTax + healthContribution;
  // The bonificatie applies to the income tax only, never to CASS.
  const earlyFilingDiscount = (capitalGainsTax + dividendTax) * config.earlyFilingDiscountRate;
  const totalAfterDiscount = totalOwed - earlyFilingDiscount;

  return {
    capitalGainsTax,
    dividendTax,
    healthContribution,
    cassBracket,
    totalOwed,
    earlyFilingDiscount,
    totalAfterDiscount,
    taxYear: config.taxYear,
    currency: config.currency,
  };
}
