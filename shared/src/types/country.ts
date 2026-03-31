export interface HealthContributionBracket {
  minIncome: number;
  maxIncome: number | null;
  fixedAmount: number;
  label: string;
}

export interface CountryTaxConfig {
  code: string;
  name: string;
  currency: string;
  currencySymbol: string;
  capitalGainsTaxRate: number;
  dividendTaxRate: number;
  healthContributionBrackets: HealthContributionBracket[];
  earlyFilingDiscountRate: number;
  earlyFilingDeadline: string;
  finalFilingDeadline: string;
  exchangeRateApi: {
    currentUrl: string;
    historicalUrlTemplate: string;
  };
  supportedBrokers: string[];
  costBasisMethod: 'weighted-average' | 'fifo' | 'lifo';
}
