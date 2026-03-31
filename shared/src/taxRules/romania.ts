import type { CountryTaxConfig } from '../types/country.js';

export const romaniaTaxConfig: CountryTaxConfig = {
  code: 'RO',
  name: 'Romania',
  currency: 'RON',
  currencySymbol: 'lei',
  capitalGainsTaxRate: 0.10,
  dividendTaxRate: 0.10,
  healthContributionBrackets: [
    { minIncome: 0, maxIncome: 24300, fixedAmount: 0, label: 'none' },
    { minIncome: 24300, maxIncome: 48600, fixedAmount: 2430, label: '6x' },
    { minIncome: 48600, maxIncome: 97200, fixedAmount: 4860, label: '12x' },
    { minIncome: 97200, maxIncome: null, fixedAmount: 9720, label: '24x' },
  ],
  earlyFilingDiscountRate: 0.03,
  earlyFilingDeadline: 'April 15',
  finalFilingDeadline: 'May 25',
  exchangeRateApi: {
    currentUrl: 'https://www.bnr.ro/nbrfxrates.xml',
    historicalUrlTemplate: 'https://www.bnr.ro/files/xml/years/nbrfxrates{YYYY}.xml',
  },
  supportedBrokers: ['trading212', 'revolut', 'ibkr', 'xtb'],
  costBasisMethod: 'weighted-average',
};
