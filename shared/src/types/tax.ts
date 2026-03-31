export interface TaxYear {
  id: string;
  userId: string;
  year: number;
  country: string;
  status: 'draft' | 'calculated' | 'filed';
  createdAt: Date;
}

export interface TaxCalculationResult {
  taxYearId: string;
  capitalGains: {
    totalProceeds: number;
    totalCostBasis: number;
    netGains: number;
    losses: number;
    taxRate: number;
    taxOwed: number;
  };
  dividends: {
    grossTotal: number;
    withholdingTaxPaid: number;
    taxOwed: number;
  };
  healthContribution: {
    totalNonSalaryIncome: number;
    thresholdHit: string;
    amountOwed: number;
  };
  totals: {
    totalTaxOwed: number;
    earlyFilingDiscount: number;
    totalAfterDiscount: number;
  };
  calculatedAt: Date;
}

export interface SecurityBreakdown {
  isin: string;
  ticker: string;
  securityName: string;
  totalBoughtShares: number;
  totalSoldShares: number;
  remainingShares: number;
  weightedAvgCostLocal: number;
  totalProceeds: number;
  totalCostBasis: number;
  realizedGainLoss: number;
  totalDividends: number;
  totalWithholdingTax: number;
}

export interface ManualCalculatorInput {
  capitalGains: number;
  dividends: number;
  withholdingTaxPaid: number;
  otherNonSalaryIncome: number;
  country: string;
}

export interface ManualCalculatorResult {
  incomeTax: number;
  dividendTax: number;
  healthContribution: number;
  totalOwed: number;
  earlyFilingDiscount: number;
  totalAfterDiscount: number;
  breakdown: {
    label: string;
    amount: number;
    rate: string;
  }[];
}
