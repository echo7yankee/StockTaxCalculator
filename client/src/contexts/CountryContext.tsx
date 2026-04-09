import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { CountryTaxConfig } from '@shared/types/country';
import { getCountryConfig, getSupportedCountries } from '@shared/taxRules/index';

interface CountryContextType {
  countryCode: string;
  countryConfig: CountryTaxConfig | undefined;
  setCountryCode: (code: string) => void;
  supportedCountries: { code: string; name: string }[];
}

const CountryContext = createContext<CountryContextType | undefined>(undefined);

function detectCountryFromLocale(): string {
  try {
    const locale = navigator.language || navigator.languages?.[0];
    if (locale) {
      // Extract country from locale like "ro-RO", "en-GB", etc.
      const parts = locale.split('-');
      if (parts.length >= 2) {
        const country = parts[1].toUpperCase();
        if (getCountryConfig(country)) return country;
      }
    }
  } catch {
    // ignore
  }
  return 'RO'; // fallback to Romania for MVP
}

export function CountryProvider({ children }: { children: ReactNode }) {
  const [countryCode, setCountryCode] = useState<string>(() => {
    const stored = localStorage.getItem('country');
    if (stored && getCountryConfig(stored)) return stored;
    return detectCountryFromLocale();
  });

  const countryConfig = getCountryConfig(countryCode);
  const supportedCountries = getSupportedCountries();

  useEffect(() => {
    localStorage.setItem('country', countryCode);
  }, [countryCode]);

  return (
    <CountryContext.Provider value={{ countryCode, countryConfig, setCountryCode, supportedCountries }}>
      {children}
    </CountryContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useCountry() {
  const context = useContext(CountryContext);
  if (!context) throw new Error('useCountry must be used within CountryProvider');
  return context;
}
