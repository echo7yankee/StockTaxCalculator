import type { CountryTaxConfig, HealthContributionBracket } from '../types/country.js';
import { TAX_YEARS, getLatestEngineSupportedConfig, type TaxYearConfig } from './taxYears.js';

export const romaniaTaxConfig: CountryTaxConfig = {
  code: 'RO',
  name: 'Romania',
  currency: 'RON',
  currencySymbol: 'lei',
  capitalGainsTaxRate: 0.10,
  dividendTaxRate: 0.10,
  healthContributionBrackets: [
    { minIncome: 0, maxIncome: 24300, fixedAmount: 0, label: 'none' },
    { minIncome: 24300, maxIncome: 48600, fixedAmount: 2430, label: '6x' },
    { minIncome: 48600, maxIncome: 97200, fixedAmount: 4860, label: '12x' },
    { minIncome: 97200, maxIncome: null, fixedAmount: 9720, label: '24x' },
  ],
  earlyFilingDiscountRate: 0.03,
  earlyFilingDeadline: 'April 15',
  finalFilingDeadline: 'May 25',
  taxRulesUpdated: '2026-01',
  exchangeRateApi: {
    currentUrl: 'https://www.bnr.ro/nbrfxrates.xml',
    historicalUrlTemplate: 'https://www.bnr.ro/files/xml/years/nbrfxrates{YYYY}.xml',
  },
  // Brokers we actually have a parser for. Trading212 is trusted; IBKR and Revolut
  // ship beta (built to each broker's published export format, verify-before-filing
  // caveat on results). XTB is roadmap, not advertised until a parser exists.
  supportedBrokers: ['trading212', 'ibkr', 'revolut'],
  costBasisMethod: 'weighted-average',
};

// CASS contribution rate (cota CASS), art. 156 Cod Fiscal: 10% of the bracket
// base. Unchanged by Legea 239/2025, which raised income-tax rates (capital
// gains + dividends to 16% for 2026) but not the health-contribution rate.
const CASS_CONTRIBUTION_RATE = 0.1;

function buildHealthContributionBrackets(
  cass: TaxYearConfig['cassThresholds'],
): HealthContributionBracket[] {
  const round2 = (n: number) => Math.round(n * 100) / 100;
  return [
    { minIncome: 0, maxIncome: cass.six, fixedAmount: 0, label: 'none' },
    { minIncome: cass.six, maxIncome: cass.twelve, fixedAmount: round2(cass.six * CASS_CONTRIBUTION_RATE), label: '6x' },
    { minIncome: cass.twelve, maxIncome: cass.twentyFour, fixedAmount: round2(cass.twelve * CASS_CONTRIBUTION_RATE), label: '12x' },
    { minIncome: cass.twentyFour, maxIncome: null, fixedAmount: round2(cass.twentyFour * CASS_CONTRIBUTION_RATE), label: '24x' },
  ];
}

/**
 * Builds the engine-facing CountryTaxConfig for a Romanian tax year by overlaying
 * that year's rates + CASS thresholds (from TAX_YEARS) onto the country-level
 * constants. The engine reads every rate from the returned config, so this is the
 * single point where a tax year selects its rates. For 2025 the result is
 * byte-equal to romaniaTaxConfig (pinned by a test), so the 28,053 lei regression
 * is unaffected.
 */
export function buildRomaniaTaxConfig(ty: TaxYearConfig): CountryTaxConfig {
  return {
    ...romaniaTaxConfig,
    capitalGainsTaxRate: ty.nonResidentBrokerCapGainsRate,
    dividendTaxRate: ty.romanianDividendWithholdingRate,
    healthContributionBrackets: buildHealthContributionBrackets(ty.cassThresholds),
    earlyFilingDiscountRate: ty.earlyFilingDiscountRate,
  };
}

/**
 * Selects the tax config for a given income year. For Romania, dispatches by tax
 * year via TAX_YEARS; if the requested year is not engine-supported yet (e.g. 2026
 * pending the backlog #13 CASS sign-off), falls back to the latest engine-supported
 * year so the engine never computes a year whose rates have not been verified.
 * Non-RO countries pass through unchanged (no multi-year config exists for them yet).
 */
export function getTaxConfigForYear(base: CountryTaxConfig, taxYear: number): CountryTaxConfig {
  if (base.code !== 'RO') return base;
  const requested = TAX_YEARS[taxYear];
  const effective = requested?.engineSupported ? requested : getLatestEngineSupportedConfig();
  return buildRomaniaTaxConfig(effective);
}
