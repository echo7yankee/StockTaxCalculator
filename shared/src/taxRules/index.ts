import type { CountryTaxConfig } from '../types/country.js';
import { romaniaTaxConfig } from './romania.js';

const countryConfigs: Record<string, CountryTaxConfig> = {
  RO: romaniaTaxConfig,
};

export function getCountryConfig(code: string): CountryTaxConfig | undefined {
  return countryConfigs[code];
}

export function getSupportedCountries(): { code: string; name: string }[] {
  return Object.values(countryConfigs).map(c => ({ code: c.code, name: c.name }));
}

export { romaniaTaxConfig };
