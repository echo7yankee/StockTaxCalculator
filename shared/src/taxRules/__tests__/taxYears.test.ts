import { describe, it, expect } from 'vitest';
import {
  TAX_YEARS,
  getCurrentTaxYear,
  getTaxYearConfig,
  getCurrentTaxYearConfig,
  isEngineSupportedTaxYear,
  isEarlyFilingDiscountAvailable,
} from '../taxYears.js';

describe('TAX_YEARS config', () => {
  it('has 2023 entry with OG 16/2022 8% dividends, no bonificatie, LIVE (engineSupported true after the prior-year flip)', () => {
    const cfg = TAX_YEARS[2023];
    expect(cfg).toBeDefined();
    expect(cfg.taxYear).toBe(2023);
    expect(cfg.filingYear).toBe(2024);
    expect(cfg.filingDeadlineRo).toBe('27 mai 2024');
    expect(cfg.filingDeadlineEn).toBe('May 27, 2024');
    expect(cfg.earlyFilingDeadlineRo).toBeNull();
    expect(cfg.earlyFilingDeadlineEn).toBeNull();
    expect(cfg.earlyFilingDeadlineIso).toBeNull();
    expect(cfg.minimumWageMonthly).toBe(3000);
    expect(cfg.cassThresholds).toEqual({ six: 18000, twelve: 36000, twentyFour: 72000 });
    expect(cfg.nonResidentBrokerCapGainsRate).toBe(0.10);
    expect(cfg.residentBrokerLongHoldRate).toBe(0.01);
    expect(cfg.residentBrokerShortHoldRate).toBe(0.03);
    expect(cfg.romanianDividendWithholdingRate).toBe(0.08);
    expect(cfg.earlyFilingDiscountRate).toBe(0);
    expect(cfg.engineSupported).toBe(true);
  });

  it('has 2024 entry with 8% dividends, HG 900/2023 wage anchor, no bonificatie, LIVE (engineSupported true after the prior-year flip)', () => {
    const cfg = TAX_YEARS[2024];
    expect(cfg).toBeDefined();
    expect(cfg.taxYear).toBe(2024);
    expect(cfg.filingYear).toBe(2025);
    expect(cfg.filingDeadlineRo).toBe('26 mai 2025');
    expect(cfg.filingDeadlineEn).toBe('May 26, 2025');
    expect(cfg.earlyFilingDeadlineRo).toBeNull();
    expect(cfg.earlyFilingDeadlineEn).toBeNull();
    expect(cfg.earlyFilingDeadlineIso).toBeNull();
    expect(cfg.minimumWageMonthly).toBe(3300);
    expect(cfg.cassThresholds).toEqual({ six: 19800, twelve: 39600, twentyFour: 79200 });
    expect(cfg.nonResidentBrokerCapGainsRate).toBe(0.10);
    expect(cfg.residentBrokerLongHoldRate).toBe(0.01);
    expect(cfg.residentBrokerShortHoldRate).toBe(0.03);
    expect(cfg.romanianDividendWithholdingRate).toBe(0.08);
    expect(cfg.earlyFilingDiscountRate).toBe(0);
    expect(cfg.engineSupported).toBe(true);
  });

  it('has 2025 entry with Legea 239/2025 pre-change rates and engineSupported true', () => {
    const cfg = TAX_YEARS[2025];
    expect(cfg).toBeDefined();
    expect(cfg.taxYear).toBe(2025);
    expect(cfg.filingYear).toBe(2026);
    expect(cfg.filingDeadlineRo).toBe('25 mai 2026');
    expect(cfg.filingDeadlineEn).toBe('May 25, 2026');
    expect(cfg.earlyFilingDeadlineRo).toBe('15 aprilie 2026');
    expect(cfg.earlyFilingDeadlineEn).toBe('April 15, 2026');
    expect(cfg.earlyFilingDeadlineIso).toBe('2026-04-15');
    expect(cfg.minimumWageMonthly).toBe(4050);
    expect(cfg.cassThresholds).toEqual({ six: 24300, twelve: 48600, twentyFour: 97200 });
    expect(cfg.nonResidentBrokerCapGainsRate).toBe(0.10);
    expect(cfg.residentBrokerLongHoldRate).toBe(0.01);
    expect(cfg.residentBrokerShortHoldRate).toBe(0.03);
    expect(cfg.romanianDividendWithholdingRate).toBe(0.10);
    expect(cfg.earlyFilingDiscountRate).toBe(0.03);
    expect(cfg.engineSupported).toBe(true);
  });

  it('has 2026 entry with Legea 239/2025 rates, dormant (engineSupported false) pending backlog #13', () => {
    const cfg = TAX_YEARS[2026];
    expect(cfg).toBeDefined();
    expect(cfg.taxYear).toBe(2026);
    expect(cfg.filingYear).toBe(2027);
    expect(cfg.filingDeadlineRo).toBe('25 mai 2027');
    expect(cfg.filingDeadlineEn).toBe('May 25, 2027');
    expect(cfg.earlyFilingDeadlineRo).toBe('15 aprilie 2027');
    expect(cfg.earlyFilingDeadlineEn).toBe('April 15, 2027');
    expect(cfg.earlyFilingDeadlineIso).toBe('2027-04-15');
    expect(cfg.minimumWageMonthly).toBe(4050);
    expect(cfg.cassThresholds).toEqual({ six: 24300, twelve: 48600, twentyFour: 97200 });
    expect(cfg.nonResidentBrokerCapGainsRate).toBe(0.16);
    expect(cfg.residentBrokerLongHoldRate).toBe(0.03);
    expect(cfg.residentBrokerShortHoldRate).toBe(0.06);
    expect(cfg.romanianDividendWithholdingRate).toBe(0.16);
    expect(cfg.earlyFilingDiscountRate).toBe(0.03);
    expect(cfg.engineSupported).toBe(false);
  });

  it('derives CASS thresholds as 6/12/24 multiples of minimum wage', () => {
    for (const year of Object.keys(TAX_YEARS).map(Number)) {
      const cfg = TAX_YEARS[year];
      expect(cfg.cassThresholds.six).toBe(cfg.minimumWageMonthly * 6);
      expect(cfg.cassThresholds.twelve).toBe(cfg.minimumWageMonthly * 12);
      expect(cfg.cassThresholds.twentyFour).toBe(cfg.minimumWageMonthly * 24);
    }
  });

  it('filingYear is taxYear + 1 for every configured year', () => {
    for (const year of Object.keys(TAX_YEARS).map(Number)) {
      expect(TAX_YEARS[year].filingYear).toBe(year + 1);
    }
  });
});

describe('getCurrentTaxYear', () => {
  it('returns year - 1 for January (filing window for previous year is open)', () => {
    expect(getCurrentTaxYear(new Date(Date.UTC(2026, 0, 1)))).toBe(2025);
    expect(getCurrentTaxYear(new Date(Date.UTC(2026, 0, 31)))).toBe(2025);
  });

  it('returns year - 1 for February through April', () => {
    expect(getCurrentTaxYear(new Date(Date.UTC(2026, 1, 15)))).toBe(2025);
    expect(getCurrentTaxYear(new Date(Date.UTC(2026, 2, 1)))).toBe(2025);
    expect(getCurrentTaxYear(new Date(Date.UTC(2026, 3, 30)))).toBe(2025);
  });

  it('returns year - 1 for May 1 through May 25 (inclusive)', () => {
    expect(getCurrentTaxYear(new Date(Date.UTC(2026, 4, 1)))).toBe(2025);
    expect(getCurrentTaxYear(new Date(Date.UTC(2026, 4, 24)))).toBe(2025);
    expect(getCurrentTaxYear(new Date(Date.UTC(2026, 4, 25)))).toBe(2025);
  });

  it('returns current year for May 26 onwards (next filing season prep phase)', () => {
    expect(getCurrentTaxYear(new Date(Date.UTC(2026, 4, 26)))).toBe(2026);
    expect(getCurrentTaxYear(new Date(Date.UTC(2026, 4, 31)))).toBe(2026);
  });

  it('returns current year for June through December', () => {
    expect(getCurrentTaxYear(new Date(Date.UTC(2026, 5, 1)))).toBe(2026);
    expect(getCurrentTaxYear(new Date(Date.UTC(2026, 8, 15)))).toBe(2026);
    expect(getCurrentTaxYear(new Date(Date.UTC(2026, 11, 31)))).toBe(2026);
  });

  it('uses the current Date when called with no argument', () => {
    const got = getCurrentTaxYear();
    const now = new Date();
    const utcYear = now.getUTCFullYear();
    expect([utcYear - 1, utcYear]).toContain(got);
  });
});

describe('getTaxYearConfig', () => {
  it('returns config for the shipped 2023 through 2026 entries', () => {
    expect(getTaxYearConfig(2023)).toBe(TAX_YEARS[2023]);
    expect(getTaxYearConfig(2024)).toBe(TAX_YEARS[2024]);
    expect(getTaxYearConfig(2025)).toBe(TAX_YEARS[2025]);
    expect(getTaxYearConfig(2026)).toBe(TAX_YEARS[2026]);
  });

  it('returns undefined for years not in TAX_YEARS (2022 and earlier are out of scope: pre-CMP)', () => {
    expect(getTaxYearConfig(2022)).toBeUndefined();
    expect(getTaxYearConfig(2099)).toBeUndefined();
    expect(getTaxYearConfig(1999)).toBeUndefined();
  });
});

describe('getCurrentTaxYearConfig', () => {
  it('returns 2025 config when called during 2025 filing season (Jan-May 25, 2026)', () => {
    expect(getCurrentTaxYearConfig(new Date(Date.UTC(2026, 2, 15)))).toBe(TAX_YEARS[2025]);
    expect(getCurrentTaxYearConfig(new Date(Date.UTC(2026, 4, 25)))).toBe(TAX_YEARS[2025]);
  });

  it('falls back to 2025 (latest engineSupported) once calendar passes May 25, 2026 because the engine has not yet shipped 2026 rates (backlog #13)', () => {
    expect(getCurrentTaxYearConfig(new Date(Date.UTC(2026, 4, 26)))).toBe(TAX_YEARS[2025]);
    expect(getCurrentTaxYearConfig(new Date(Date.UTC(2026, 11, 31)))).toBe(TAX_YEARS[2025]);
    expect(getCurrentTaxYearConfig(new Date(Date.UTC(2027, 0, 1)))).toBe(TAX_YEARS[2025]);
    expect(getCurrentTaxYearConfig(new Date(Date.UTC(2027, 4, 25)))).toBe(TAX_YEARS[2025]);
  });

  it('falls back to latest engineSupported year when calendar outpaces all configured years', () => {
    expect(getCurrentTaxYearConfig(new Date(Date.UTC(2099, 5, 15)))).toBe(TAX_YEARS[2025]);
  });

  it('never returns the dormant 2026 entry while engineSupported is false (production-safety invariant)', () => {
    // The 2026 entry exists but engineSupported is false, so user-facing copy + engine paths stay on
    // 2025 even when the calendar maps to tax year 2026. This is what keeps PR A a zero-production-change
    // ship; flipping engineSupported true is a deliberate later step (backlog #13 PR B).
    expect(TAX_YEARS[2026].engineSupported).toBe(false);
    expect(getCurrentTaxYear(new Date(Date.UTC(2026, 4, 26)))).toBe(2026);
    expect(getCurrentTaxYearConfig(new Date(Date.UTC(2026, 4, 26)))).not.toBe(TAX_YEARS[2026]);
    expect(getCurrentTaxYearConfig(new Date(Date.UTC(2026, 4, 26)))).toBe(TAX_YEARS[2025]);
    expect(getCurrentTaxYearConfig(new Date(Date.UTC(2026, 11, 31)))).toBe(TAX_YEARS[2025]);
  });

  it('returns the 2023/2024 entries in their own filing season now that the prior-year flip made them live', () => {
    // Post-flip, the prior-year configs are engine-supported (Step 3,
    // prior-year-regularization-spec.md). A clock inside the 2023 or 2024 filing
    // season (impossible in production, the calendar is past them) resolves to that
    // year's own config rather than the 2025 fallback. The production-safety
    // invariant that still matters (the dormant 2026 entry is never returned) is
    // covered by the test above.
    expect(TAX_YEARS[2023].engineSupported).toBe(true);
    expect(TAX_YEARS[2024].engineSupported).toBe(true);
    expect(getCurrentTaxYear(new Date(Date.UTC(2024, 2, 15)))).toBe(2023);
    expect(getCurrentTaxYearConfig(new Date(Date.UTC(2024, 2, 15)))).toBe(TAX_YEARS[2023]);
    expect(getCurrentTaxYear(new Date(Date.UTC(2025, 2, 15)))).toBe(2024);
    expect(getCurrentTaxYearConfig(new Date(Date.UTC(2025, 2, 15)))).toBe(TAX_YEARS[2024]);
  });
});

describe('isEarlyFilingDiscountAvailable', () => {
  // The single source of truth for every bonificatie gate: the D212 emit
  // (d212Xml.ts) and all client "after discount" surfaces key on this same
  // predicate, per result tax year. Boundary semantics must match the OUG 8/2026
  // rule the emit was built on: deadline INCLUSIVE, end of day Europe/Bucharest.

  it('is true strictly before and on the 2025 deadline day (Bucharest end of day, inclusive)', () => {
    expect(isEarlyFilingDiscountAvailable(2025, new Date('2026-01-02T00:00:00+02:00'))).toBe(true);
    expect(isEarlyFilingDiscountAvailable(2025, new Date('2026-04-10T12:00:00+03:00'))).toBe(true); // the real on-time filing date
    // Last in-window instant: 15 Apr 2026 23:59:59 Bucharest (EEST, +03:00).
    expect(isEarlyFilingDiscountAvailable(2025, new Date('2026-04-15T23:59:59+03:00'))).toBe(true);
  });

  it('is false from Bucharest midnight after the 2025 deadline (even while still Apr 15 further west)', () => {
    expect(isEarlyFilingDiscountAvailable(2025, new Date('2026-04-16T00:00:00+03:00'))).toBe(false);
    // 22:00 UTC on Apr 15 is already 01:00 Apr 16 in Bucharest: the gate follows
    // the Romanian deadline, not the viewer's local calendar day.
    expect(isEarlyFilingDiscountAvailable(2025, new Date('2026-04-15T22:00:01Z'))).toBe(false);
    expect(isEarlyFilingDiscountAvailable(2025, new Date('2027-03-01T12:00:00Z'))).toBe(false);
  });

  it('keys on the RESULT year, not the wall-clock year: a 2025 result stays forfeited in early 2027', () => {
    // The retired client helper compared against "April 15 of the CURRENT year",
    // so a 2025 result reopened between Jan 1 and Apr 15 2027 wrongly showed the
    // discount while the D212 XML declared 0. The per-year gate closes that.
    expect(isEarlyFilingDiscountAvailable(2025, new Date('2027-02-01T12:00:00+02:00'))).toBe(false);
  });

  it('is false for years with no bonificatie (2023/2024: earlyFilingDeadlineIso null) at any instant', () => {
    expect(isEarlyFilingDiscountAvailable(2023, new Date('2024-01-15T12:00:00+02:00'))).toBe(false);
    expect(isEarlyFilingDiscountAvailable(2024, new Date('2025-01-15T12:00:00+02:00'))).toBe(false);
  });

  it('is false for years not in TAX_YEARS (fails conservative: forfeit, never over-claim)', () => {
    expect(isEarlyFilingDiscountAvailable(2022, new Date('2023-01-15T12:00:00+02:00'))).toBe(false);
    expect(isEarlyFilingDiscountAvailable(2099, new Date('2099-01-15T12:00:00+02:00'))).toBe(false);
  });

  it('follows the dormant 2026 entry (F4-flagged 2027-04-15 deadline) so the gate needs no touch at the #13 flip', () => {
    expect(isEarlyFilingDiscountAvailable(2026, new Date('2027-03-01T12:00:00+02:00'))).toBe(true);
    expect(isEarlyFilingDiscountAvailable(2026, new Date('2027-04-16T00:00:00+03:00'))).toBe(false);
  });
});

describe('isEngineSupportedTaxYear', () => {
  it('is true for the engine-supported years (2023, 2024, 2025 after the prior-year flip)', () => {
    expect(isEngineSupportedTaxYear(2023)).toBe(true);
    expect(isEngineSupportedTaxYear(2024)).toBe(true);
    expect(isEngineSupportedTaxYear(2025)).toBe(true);
  });

  it('is false for dormant 2026 and for years not in TAX_YEARS (2022 and earlier, future)', () => {
    expect(isEngineSupportedTaxYear(2026)).toBe(false); // encoded but dormant (backlog #13)
    expect(isEngineSupportedTaxYear(2022)).toBe(false); // out of scope: pre-CMP
    expect(isEngineSupportedTaxYear(2099)).toBe(false);
  });
});
