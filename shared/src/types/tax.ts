import type { TransactionAction } from './transaction.js';

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

/**
 * One row in the PDF flow's per-trade audit trail. The Trading212 Annual
 * Statement PDF reports closed positions (each with a pre-computed result) and
 * dividend payments rather than raw buy/sell transactions, so
 * `calculateTaxesFromPdf` emits one of these per sell trade and per
 * dividend/distribution, each carrying the exact BNR rate the engine applied and
 * the resulting RON amount. The audit serializer renders these with the SAME
 * columns as the CSV flow's per-trade rows, so the recommended (PDF) path gets
 * the same "which trade, which rate, which RON amount" breakdown the CSV path
 * already has, instead of only a per-security summary.
 *
 * Shaped to mirror the per-trade columns: for a sell, `amountOriginal` is the
 * sale proceeds in `currency` and `amountLocal` is those proceeds in RON; for a
 * dividend, `amountOriginal`/`amountLocal` are the gross dividend and the
 * `withholdingTax*` fields carry the foreign tax withheld at source.
 */
export interface PdfAuditRow {
  /** Execution date (sell) or pay date (dividend), ISO `YYYY-MM-DD` when parseable, else the raw statement value. */
  date: string;
  /** Only 'sell' or 'dividend' are emitted from the PDF flow. */
  action: TransactionAction;
  ticker: string;
  isin: string;
  securityName: string;
  /** Shares sold (sell); 0 for dividends. */
  shares: number;
  /** Execution price per share in the instrument currency (sell); 0 for dividends. */
  pricePerShare: number;
  /** The currency `amountOriginal` is denominated in. */
  currency: string;
  /** Sale proceeds (sell) or gross dividend (dividend), in `currency`. */
  amountOriginal: number;
  /** The BNR rate the engine applied to convert `amountOriginal` to RON. */
  exchangeRateToLocal: number;
  /** `amountOriginal` converted to RON at `exchangeRateToLocal`. */
  amountLocal: number;
  /** Foreign tax withheld at source, in `currency` (dividends; 0 for sells). */
  withholdingTaxOriginal: number;
  /** Withholding tax converted to RON. */
  withholdingTaxLocal: number;
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
