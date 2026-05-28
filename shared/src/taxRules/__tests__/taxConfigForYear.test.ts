import { describe, it, expect } from 'vitest';
import type { CountryTaxConfig } from '../../types/country.js';
import { romaniaTaxConfig, buildRomaniaTaxConfig, getTaxConfigForYear } from '../romania.js';
import { TAX_YEARS, getLatestEngineSupportedConfig } from '../taxYears.js';

describe('buildRomaniaTaxConfig', () => {
  it('derives the 2025 config byte-equal to the romaniaTaxConfig literal (28,053 regression pin)', () => {
    // The PDF integration test (28,053 lei) imports romaniaTaxConfig directly. If
    // the derived 2025 config ever drifts from the literal, this fails before the
    // regression does, pointing straight at the cause.
    expect(buildRomaniaTaxConfig(TAX_YEARS[2025])).toEqual(romaniaTaxConfig);
  });

  it('derives the 2026 config with Legea 239/2025 rates (cap gains + dividends both 16%)', () => {
    const cfg = buildRomaniaTaxConfig(TAX_YEARS[2026]);
    expect(cfg.capitalGainsTaxRate).toBe(0.16);
    expect(cfg.dividendTaxRate).toBe(0.16);
    expect(cfg.earlyFilingDiscountRate).toBe(0.03);
  });

  it('derives CASS brackets as 10% of the 6/12/24 thresholds, with the none floor', () => {
    const cfg = buildRomaniaTaxConfig(TAX_YEARS[2026]);
    expect(cfg.healthContributionBrackets).toEqual([
      { minIncome: 0, maxIncome: 24300, fixedAmount: 0, label: 'none' },
      { minIncome: 24300, maxIncome: 48600, fixedAmount: 2430, label: '6x' },
      { minIncome: 48600, maxIncome: 97200, fixedAmount: 4860, label: '12x' },
      { minIncome: 97200, maxIncome: null, fixedAmount: 9720, label: '24x' },
    ]);
  });

  it('keeps country-level constants (currency, brokers, cost-basis method) intact across years', () => {
    const cfg = buildRomaniaTaxConfig(TAX_YEARS[2026]);
    expect(cfg.code).toBe('RO');
    expect(cfg.currency).toBe('RON');
    expect(cfg.costBasisMethod).toBe('weighted-average');
    expect(cfg.supportedBrokers).toEqual(romaniaTaxConfig.supportedBrokers);
  });
});

describe('getLatestEngineSupportedConfig', () => {
  it('returns the latest engine-supported year (2025 today, since 2026 is dormant)', () => {
    expect(getLatestEngineSupportedConfig()).toBe(TAX_YEARS[2025]);
    expect(getLatestEngineSupportedConfig().engineSupported).toBe(true);
  });
});

describe('getTaxConfigForYear', () => {
  it('returns the year-correct config for an engine-supported year (2025)', () => {
    expect(getTaxConfigForYear(romaniaTaxConfig, 2025)).toEqual(romaniaTaxConfig);
  });

  it('falls back to the latest supported year for a not-yet-supported year (2026 gated)', () => {
    // engineSupported is false for 2026, so a 2026 statement must NOT silently
    // compute at 16% before the CASS sign-off (backlog #13 PR B / #22). It uses
    // 2025 rates until the gate flips. This is the production-safety invariant.
    const cfg = getTaxConfigForYear(romaniaTaxConfig, 2026);
    expect(cfg).toEqual(romaniaTaxConfig);
    expect(cfg.capitalGainsTaxRate).toBe(0.10);
    expect(cfg.dividendTaxRate).toBe(0.10);
  });

  it('falls back to the latest supported year for an unconfigured year', () => {
    expect(getTaxConfigForYear(romaniaTaxConfig, 2099)).toEqual(romaniaTaxConfig);
    expect(getTaxConfigForYear(romaniaTaxConfig, 2023)).toEqual(romaniaTaxConfig);
  });

  it('passes non-RO country configs through unchanged (no multi-year config exists yet)', () => {
    const fakeBg: CountryTaxConfig = { ...romaniaTaxConfig, code: 'BG', name: 'Bulgaria' };
    expect(getTaxConfigForYear(fakeBg, 2026)).toBe(fakeBg);
  });
});
