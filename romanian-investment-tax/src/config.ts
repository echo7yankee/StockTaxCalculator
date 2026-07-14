// Public Romanian investment-tax configuration.
//
// Every value here is public tax law (ANAF / Cod fiscal) and already ships in
// the InvesTax client bundle, embed widget, and openapi.json. This library
// embeds it as plain data so the estimate runs fully offline, with no network
// call and no dependency on the InvesTax API.

/** CASS (health-contribution) bracket label, keyed to the annual minimum wage. */
export type CassBracketLabel = 'none' | '6x' | '12x' | '24x';

/**
 * A CASS bracket. `fixedAmount` is a FLAT contribution owed when total
 * non-salary income falls in `[minIncome, maxIncome)`, NOT a percentage of it.
 * `maxIncome === null` means the top, open-ended bracket.
 */
export interface CassBracket {
  readonly minIncome: number;
  readonly maxIncome: number | null;
  readonly fixedAmount: number;
  readonly label: CassBracketLabel;
}

/** The full rate + bracket set for one Romanian tax year. */
export interface RomaniaTaxConfig {
  readonly taxYear: number;
  readonly currency: 'RON';
  /** Flat rate on net capital gains from securities transfers (art. 96). */
  readonly capitalGainsTaxRate: number;
  /** Flat rate on gross dividends (art. 97), before the foreign-WHT credit. */
  readonly dividendTaxRate: number;
  /** Bonificatie for filing before the early deadline (fraction of income tax). */
  readonly earlyFilingDiscountRate: number;
  /** CASS brackets, ascending by `minIncome`, first match wins. */
  readonly cassBrackets: readonly CassBracket[];
}

/**
 * Tax year 2025 (income earned in 2025, Declaratia Unica filed by 25 May 2026).
 *
 * - Capital gains: 10% flat on net gains.
 * - Dividends: 10% on the gross, reduced by foreign withholding tax already
 *   paid (credit capped at the Romanian tax due on that dividend).
 * - CASS: a fixed amount at 6x / 12x / 24x the annual minimum wage
 *   (24.300 / 48.600 / 97.200 RON of total non-salary income), each = 10% of
 *   its threshold; below 24.300 RON, no CASS is owed.
 * - Early-filing bonificatie: 3% of the income tax if filed before 15 May 2026.
 *
 * NOTE: Legea 239/2025 raises capital-gains and dividend rates to 16% for
 * income year 2026 (filed 2027). This library ships the 2025 rates only; a 2026
 * config will be added when those norms and the minimum wage settle (late 2026).
 * The values below mirror InvesTax `shared/src/taxRules/romania.ts` (tax year
 * 2025) exactly and are pinned by a test.
 */
export const ROMANIA_TAX_2025: RomaniaTaxConfig = {
  taxYear: 2025,
  currency: 'RON',
  capitalGainsTaxRate: 0.1,
  dividendTaxRate: 0.1,
  earlyFilingDiscountRate: 0.03,
  cassBrackets: [
    { minIncome: 0, maxIncome: 24300, fixedAmount: 0, label: 'none' },
    { minIncome: 24300, maxIncome: 48600, fixedAmount: 2430, label: '6x' },
    { minIncome: 48600, maxIncome: 97200, fixedAmount: 4860, label: '12x' },
    { minIncome: 97200, maxIncome: null, fixedAmount: 9720, label: '24x' },
  ],
};

/** The config used when the caller does not pass one. */
export const DEFAULT_ROMANIA_TAX_CONFIG = ROMANIA_TAX_2025;
