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
    // The full ANAF dividend line-up for D212 (Sectiunea 2, categoria 2018), in
    // form-row order. rd.8 = gross Romanian tax (grossTotal * taxRate), rd.9 =
    // foreign tax paid (withholdingTaxPaid), rd.10 = credit granted, rd.11 =
    // remaining difference to pay (taxOwed). By construction rd.8 - rd.10 = rd.11.
    taxBeforeCredit: number; // rd.8: Impozit pe venit datorat in Romania (gross)
    withholdingTaxPaid: number; // rd.9: Impozit pe venit platit in strainatate
    foreignTaxCredit: number; // rd.10: Credit fiscal (= taxBeforeCredit - taxOwed)
    taxOwed: number; // rd.11: Diferenta de impozit de plata (net, after credit)
    taxRate: number; // the dividend tax rate applied (10% in 2025, 8% in 2023/24)
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
