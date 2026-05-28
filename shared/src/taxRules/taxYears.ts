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
  // 2026 entry: DORMANT. engineSupported is false, so getCurrentTaxYearConfig() never returns it
  // and no user-facing copy or engine path consumes it yet. Verification + per-claim sources live in
  // investax-docs/tax-facts-verification-2026.md. Do NOT flip engineSupported to true until the four
  // FLAGGED items there (F1 CASS plafon anchor 4.050-vs-4.325, F2 CASS base-by-intermediary restructure,
  // F3 16% on foreign dividends, F4 2027 deadline/bonificatie) are resolved AND the engine handles 2026
  // rates end-to-end (backlog #13 PR B). Legea 239/2025 (in force 2025-12-18, applies to 2026+ income).
  2026: {
    taxYear: 2026,
    filingYear: 2027,
    filingDeadlineRo: '25 mai 2027', // F4: carried from 2025 cycle, unverified for 2027
    filingDeadlineEn: 'May 25, 2027', // F4
    earlyFilingDeadlineRo: '15 aprilie 2027', // F4
    earlyFilingDeadlineEn: 'April 15, 2027', // F4
    minimumWageMonthly: 4050, // V4: H1 2026 value (rises to 4.325 from Jul 1, HG 146/2025). F1: 4.050 anchors the annual investment plafon (best reading, flagged).
    cassThresholds: {
      // F1: 6/12/24 x 4.050, identical to 2025. Contested vs 4.325-based 25.950/51.900/103.800.
      six: 24300,
      twelve: 48600,
      twentyFour: 97200,
    },
    nonResidentBrokerCapGainsRate: 0.16, // V1: Legea 239/2025, was 0.10 in 2025
    residentBrokerLongHoldRate: 0.03, // V2: was 0.01 in 2025
    residentBrokerShortHoldRate: 0.06, // V2: was 0.03 in 2025
    romanianDividendWithholdingRate: 0.16, // V3 (foreign-dividend application flagged F3): was 0.10 in 2025
    earlyFilingDiscountRate: 0.03, // F4: carried forward, unverified for 2026
    engineSupported: false, // GATE: keep false until F1-F4 resolved + engine wired (backlog #13 PR B)
  },
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
