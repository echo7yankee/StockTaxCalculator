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

  it('derives the 2023 config with 8% dividends, zero discount, and 3.000-wage CASS brackets (dormant until the prior-year flip)', () => {
    const cfg = buildRomaniaTaxConfig(TAX_YEARS[2023]);
    expect(cfg.capitalGainsTaxRate).toBe(0.10);
    expect(cfg.dividendTaxRate).toBe(0.08);
    expect(cfg.earlyFilingDiscountRate).toBe(0);
    expect(cfg.healthContributionBrackets).toEqual([
      { minIncome: 0, maxIncome: 18000, fixedAmount: 0, label: 'none' },
      { minIncome: 18000, maxIncome: 36000, fixedAmount: 1800, label: '6x' },
      { minIncome: 36000, maxIncome: 72000, fixedAmount: 3600, label: '12x' },
      { minIncome: 72000, maxIncome: null, fixedAmount: 7200, label: '24x' },
    ]);
  });

  it('derives the 2024 config with 8% dividends, zero discount, and 3.300-wage CASS brackets (dormant until the prior-year flip)', () => {
    const cfg = buildRomaniaTaxConfig(TAX_YEARS[2024]);
    expect(cfg.capitalGainsTaxRate).toBe(0.10);
    expect(cfg.dividendTaxRate).toBe(0.08);
    expect(cfg.earlyFilingDiscountRate).toBe(0);
    expect(cfg.healthContributionBrackets).toEqual([
      { minIncome: 0, maxIncome: 19800, fixedAmount: 0, label: 'none' },
      { minIncome: 19800, maxIncome: 39600, fixedAmount: 1980, label: '6x' },
      { minIncome: 39600, maxIncome: 79200, fixedAmount: 3960, label: '12x' },
      { minIncome: 79200, maxIncome: null, fixedAmount: 7920, label: '24x' },
    ]);
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

  it('falls back to the latest supported year for the configured-but-dormant prior years (2023/2024 gated)', () => {
    // A 2023 or 2024 statement must NOT silently compute at 8% dividends before the
    // prior-year flip (prior-year-regularization-spec.md Section 6 Step 3). Until then
    // it uses 2025 rates, exactly as it did before these entries existed.
    for (const year of [2023, 2024]) {
      const cfg = getTaxConfigForYear(romaniaTaxConfig, year);
      expect(cfg).toEqual(romaniaTaxConfig);
      expect(cfg.capitalGainsTaxRate).toBe(0.10);
      expect(cfg.dividendTaxRate).toBe(0.10);
    }
  });

  it('falls back to the latest supported year for an unconfigured year', () => {
    expect(getTaxConfigForYear(romaniaTaxConfig, 2099)).toEqual(romaniaTaxConfig);
    expect(getTaxConfigForYear(romaniaTaxConfig, 2022)).toEqual(romaniaTaxConfig);
  });

  it('passes non-RO country configs through unchanged (no multi-year config exists yet)', () => {
    const fakeBg: CountryTaxConfig = { ...romaniaTaxConfig, code: 'BG', name: 'Bulgaria' };
    expect(getTaxConfigForYear(fakeBg, 2026)).toBe(fakeBg);
  });
});
