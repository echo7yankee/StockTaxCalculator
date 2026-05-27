import { describe, it, expect } from 'vitest';
import {
  TAX_YEARS,
  getCurrentTaxYear,
  getTaxYearConfig,
  getCurrentTaxYearConfig,
} from '../taxYears.js';

describe('TAX_YEARS config', () => {
  it('has 2025 entry with Legea 239/2025 pre-change rates and engineSupported true', () => {
    const cfg = TAX_YEARS[2025];
    expect(cfg).toBeDefined();
    expect(cfg.taxYear).toBe(2025);
    expect(cfg.filingYear).toBe(2026);
    expect(cfg.filingDeadlineRo).toBe('25 mai 2026');
    expect(cfg.filingDeadlineEn).toBe('May 25, 2026');
    expect(cfg.earlyFilingDeadlineRo).toBe('15 aprilie 2026');
    expect(cfg.earlyFilingDeadlineEn).toBe('April 15, 2026');
    expect(cfg.minimumWageMonthly).toBe(4050);
    expect(cfg.cassThresholds).toEqual({ six: 24300, twelve: 48600, twentyFour: 97200 });
    expect(cfg.nonResidentBrokerCapGainsRate).toBe(0.10);
    expect(cfg.residentBrokerLongHoldRate).toBe(0.01);
    expect(cfg.residentBrokerShortHoldRate).toBe(0.03);
    expect(cfg.romanianDividendWithholdingRate).toBe(0.10);
    expect(cfg.earlyFilingDiscountRate).toBe(0.03);
    expect(cfg.engineSupported).toBe(true);
  });

  it('does not yet ship a 2026 entry (deferred to backlog #13 after CASS-base verification)', () => {
    expect(TAX_YEARS[2026]).toBeUndefined();
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
  it('returns config for the shipped 2025 entry', () => {
    expect(getTaxYearConfig(2025)).toBe(TAX_YEARS[2025]);
  });

  it('returns undefined for years not yet in TAX_YEARS', () => {
    expect(getTaxYearConfig(2026)).toBeUndefined();
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
});
