export interface TaxYearConfig {
  taxYear: number;
  filingYear: number;
  filingDeadlineRo: string;
  filingDeadlineEn: string;
  // null = no early-filing bonificatie existed for that filing cycle, so there is no
  // early deadline to name (true for 2023 + 2024 incomes; the PF bonificatie returned
  // only with OUG 8/2026, for 2025 incomes). Pair null with earlyFilingDiscountRate 0.
  earlyFilingDeadlineRo: string | null;
  earlyFilingDeadlineEn: string | null;
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
  // 2023 + 2024 entries: LIVE (engineSupported true since the prior-year flip,
  // prior-year-regularization-spec.md Section 6 Step 3). They serve the ANAF
  // notificare-de-conformare / declaratie rectificativa segment: a paid upload of a
  // 2023/2024 broker statement now computes at that year's rates. Verification +
  // per-claim sources in that spec Section 3 (ANAF Brasov DU deck 14.05.2025, ANAF
  // Cluj notes 03.2024 + 01.2025). The ONE engine math delta vs 2025 is dividends at
  // 8% (OG 16/2022; 10% applies only to dividends distributed from 2025-01-01, OUG
  // 156/2024). earlyFilingDeadline* null + earlyFilingDiscountRate 0 = NO bonificatie
  // existed for either cycle. Step 3 engineering gates cleared at flip: BNR 2023/2024
  // rate availability (nbrfxrates{year}.xml served by bnrRates.ts), and the 28,053
  // regression byte-identical (the 2025 config is untouched). D212 XML generation
  // stays 2025-only (D212_SUPPORTED_TAX_YEAR) until the per-year XSD + d212Fields QA
  // lands, so past-year filers get correct numbers + the filing guide, never a wrong
  // declaration. Tax year 2022 and earlier remain OUT OF SCOPE (pre-CMP cost-method
  // territory, Legea 142/2022).
  2023: {
    taxYear: 2023,
    filingYear: 2024,
    filingDeadlineRo: '27 mai 2024', // 25.05.2024 fell on a Saturday; OPANAF 6/2024 cycle, ANAF Cluj note 15.03.2024 verbatim
    filingDeadlineEn: 'May 27, 2024',
    earlyFilingDeadlineRo: null, // no bonificatie for the 2023-income cycle
    earlyFilingDeadlineEn: null,
    minimumWageMonthly: 3000, // HG 1447/2022
    cassThresholds: {
      six: 18000,
      twelve: 36000,
      twentyFour: 72000,
    },
    nonResidentBrokerCapGainsRate: 0.10,
    residentBrokerLongHoldRate: 0.01, // art. 96^1 regime (Legea 142/2022), RO intermediaries only
    residentBrokerShortHoldRate: 0.03,
    romanianDividendWithholdingRate: 0.08, // OG 16/2022: 8% from 2023-01-01 (NOT 10%)
    earlyFilingDiscountRate: 0,
    engineSupported: true, // LIVE: prior-year flip (spec Section 6 Step 3); 8% dividend math verified, BNR 2023 available
  },
  2024: {
    taxYear: 2024,
    filingYear: 2025,
    filingDeadlineRo: '26 mai 2025', // 25.05.2025 fell on a Sunday; OPANAF 7015/2024 cycle, ANAF Brasov deck footnote
    filingDeadlineEn: 'May 26, 2025',
    earlyFilingDeadlineRo: null, // no PF bonificatie for the 2024-income cycle (the OUG 107/2024 3% was firms-only)
    earlyFilingDeadlineEn: null,
    minimumWageMonthly: 3300, // HG 900/2023; the Jul-2024 raise to 3.700 (HG 598/2024) does NOT anchor the plafon
    cassThresholds: {
      six: 19800,
      twelve: 39600,
      twentyFour: 79200,
    },
    nonResidentBrokerCapGainsRate: 0.10,
    residentBrokerLongHoldRate: 0.01,
    residentBrokerShortHoldRate: 0.03,
    romanianDividendWithholdingRate: 0.08, // 8% for 2024 incomes too; 10% only from dividends distributed after 2025-01-01
    earlyFilingDiscountRate: 0,
    engineSupported: true, // LIVE: prior-year flip (spec Section 6 Step 3); 8% dividend math verified, BNR 2024 available
  },
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

/**
 * Whether the engine can calculate this exact tax year end-to-end (its rates are
 * verified and signed off via the engineSupported flag). The single source of
 * truth for the UI "can we compute this year?" guards: the paid upload flow and
 * the free pre-paywall checker both gate on it so an unsupported year never
 * silently falls back to another year's rates. getTaxConfigForYear's fallback is
 * correct for engine safety but invisible to the user, so the UI checks support
 * up front and blocks with an explanation instead. Distinct from getTaxYearConfig,
 * which returns dormant entries (e.g. 2026) too.
 */
export function isEngineSupportedTaxYear(year: number): boolean {
  return TAX_YEARS[year]?.engineSupported === true;
}

/**
 * The most recent tax year the engine can calculate end-to-end. Used as the
 * fallback whenever a requested year is not yet engine-supported, so neither
 * user-facing copy nor the engine ever commits to a year whose rates have not
 * been verified and signed off (backlog #13 / #22).
 */
export function getLatestEngineSupportedConfig(): TaxYearConfig {
  const supportedYears = Object.values(TAX_YEARS)
    .filter(cfg => cfg.engineSupported)
    .map(cfg => cfg.taxYear)
    .sort((a, b) => b - a);
  if (supportedYears.length === 0) {
    throw new Error('No engine-supported tax years configured in TAX_YEARS');
  }
  return TAX_YEARS[supportedYears[0]];
}

export function getCurrentTaxYearConfig(now: Date = new Date()): TaxYearConfig {
  const calendarYear = getCurrentTaxYear(now);
  const exact = TAX_YEARS[calendarYear];
  if (exact?.engineSupported) return exact;
  // Fall back to the latest engine-supported year so user-facing copy never claims a year the engine cannot yet calculate.
  return getLatestEngineSupportedConfig();
}
