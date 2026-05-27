export interface TaxYearConfig {
  taxYear: number;
  filingYear: number;
  filingDeadlineRo: string;
  filingDeadlineEn: string;
  earlyFilingDeadlineRo: string;
  earlyFilingDeadlineEn: string;
  minimumWageMonthly: number;
  cassThresholds: {
    six: number;
    twelve: number;
    twentyFour: number;
  };
  nonResidentBrokerCapGainsRate: number;
  residentBrokerLongHoldRate: number;
  residentBrokerShortHoldRate: number;
  romanianDividendWithholdingRate: number;
  earlyFilingDiscountRate: number;
  // Flip to true only after the engine handles this year's rates end-to-end.
  // Prevents user-facing copy from claiming readiness ahead of the engine refactor (backlog #13).
  engineSupported: boolean;
}

export const TAX_YEARS: Record<number, TaxYearConfig> = {
  2025: {
    taxYear: 2025,
    filingYear: 2026,
    filingDeadlineRo: '25 mai 2026',
    filingDeadlineEn: 'May 25, 2026',
    earlyFilingDeadlineRo: '15 aprilie 2026',
    earlyFilingDeadlineEn: 'April 15, 2026',
    minimumWageMonthly: 4050,
    cassThresholds: {
      six: 24300,
      twelve: 48600,
      twentyFour: 97200,
    },
    nonResidentBrokerCapGainsRate: 0.10,
    residentBrokerLongHoldRate: 0.01,
    residentBrokerShortHoldRate: 0.03,
    romanianDividendWithholdingRate: 0.10,
    earlyFilingDiscountRate: 0.03,
    engineSupported: true,
  },
  // 2026 entry intentionally deferred. The H1/H2 minimum-wage split (4.050 RON Jan-Jun
  // per HG 146/2025, 4.325 RON Jul-Dec) and the resulting CASS-threshold reference value
  // need primary-source verification before shipping per backlog item #22. Adding 2026
  // here is the natural first step of backlog item #13 (engine year-awareness for the
  // Legea 239/2025 16% rate), which will land that verification in the same PR.
};

export function getCurrentTaxYear(now: Date = new Date()): number {
  // ANAF filing window for income year N runs Jan 1 to May 25 of year N+1.
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const day = now.getUTCDate();
  if (month < 4) return year - 1;
  if (month === 4 && day <= 25) return year - 1;
  return year;
}

export function getTaxYearConfig(year: number): TaxYearConfig | undefined {
  return TAX_YEARS[year];
}

export function getCurrentTaxYearConfig(now: Date = new Date()): TaxYearConfig {
  const calendarYear = getCurrentTaxYear(now);
  const exact = TAX_YEARS[calendarYear];
  if (exact?.engineSupported) return exact;
  // Fall back to the latest engine-supported year so user-facing copy never claims a year the engine cannot yet calculate.
  const supportedYears = Object.values(TAX_YEARS)
    .filter(cfg => cfg.engineSupported)
    .map(cfg => cfg.taxYear)
    .sort((a, b) => b - a);
  if (supportedYears.length === 0) {
    throw new Error('No engine-supported tax years configured in TAX_YEARS');
  }
  return TAX_YEARS[supportedYears[0]];
}
