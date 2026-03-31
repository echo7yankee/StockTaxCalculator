import { describe, it, expect } from 'vitest';
import { romaniaTaxConfig } from '../romania.js';
import { getCountryConfig, getSupportedCountries } from '../index.js';

describe('romaniaTaxConfig', () => {
  it('has 10% capital gains rate', () => {
    expect(romaniaTaxConfig.capitalGainsTaxRate).toBe(0.10);
  });

  it('has 10% dividend rate', () => {
    expect(romaniaTaxConfig.dividendTaxRate).toBe(0.10);
  });

  it('has 3% early filing discount', () => {
    expect(romaniaTaxConfig.earlyFilingDiscountRate).toBe(0.03);
  });

  it('uses weighted-average cost basis method', () => {
    expect(romaniaTaxConfig.costBasisMethod).toBe('weighted-average');
  });

  it('has currency RON', () => {
    expect(romaniaTaxConfig.currency).toBe('RON');
    expect(romaniaTaxConfig.currencySymbol).toBe('lei');
  });

  it('has 4 CASS health brackets', () => {
    expect(romaniaTaxConfig.healthContributionBrackets).toHaveLength(4);
    const [b0, b1, b2, b3] = romaniaTaxConfig.healthContributionBrackets;
    expect(b0.fixedAmount).toBe(0);
    expect(b1.fixedAmount).toBe(2430);
    expect(b2.fixedAmount).toBe(4860);
    expect(b3.fixedAmount).toBe(9720);
    expect(b3.maxIncome).toBeNull(); // top bracket has no cap
  });

  it('has BNR exchange rate API URLs', () => {
    expect(romaniaTaxConfig.exchangeRateApi.currentUrl).toContain('bnr.ro');
    expect(romaniaTaxConfig.exchangeRateApi.historicalUrlTemplate).toContain('{YYYY}');
  });

  it('includes trading212 in supported brokers', () => {
    expect(romaniaTaxConfig.supportedBrokers).toContain('trading212');
  });
});

describe('getCountryConfig', () => {
  it('returns Romania config for "RO"', () => {
    const config = getCountryConfig('RO');
    expect(config).toBeDefined();
    expect(config!.code).toBe('RO');
    expect(config!.name).toBe('Romania');
  });

  it('returns undefined for unknown country code', () => {
    expect(getCountryConfig('XX')).toBeUndefined();
  });
});

describe('getSupportedCountries', () => {
  it('returns at least Romania', () => {
    const countries = getSupportedCountries();
    expect(countries.length).toBeGreaterThanOrEqual(1);
    expect(countries.some(c => c.code === 'RO')).toBe(true);
  });
});
