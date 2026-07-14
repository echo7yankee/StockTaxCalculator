// romanian-investment-tax
//
// Deterministic, zero-dependency estimate of Romanian personal investment tax
// (capital gains, dividends, CASS) for the Declaratia Unica (D212).
//
// Powered by InvesTax (https://investax.app). The full product parses real
// broker statements (Trading 212, IBKR, Revolut) with per-transaction BNR
// conversion and generates the filing-ready D212; this library is the free,
// manual quick estimate only.

export {
  calculateRomanianInvestmentTax,
  type RomanianInvestmentTaxInput,
  type RomanianInvestmentTaxResult,
} from './calculator.js';

export {
  ROMANIA_TAX_2025,
  DEFAULT_ROMANIA_TAX_CONFIG,
  type RomaniaTaxConfig,
  type CassBracket,
  type CassBracketLabel,
} from './config.js';
