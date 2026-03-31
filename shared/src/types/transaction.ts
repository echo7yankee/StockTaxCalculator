export type TransactionAction = 'buy' | 'sell' | 'dividend' | 'interest' | 'deposit' | 'withdrawal';

export type Currency = 'USD' | 'EUR' | 'GBP' | 'RON';

export type BrokerType = 'trading212' | 'revolut' | 'ibkr' | 'xtb';

export interface Transaction {
  id: string;
  csvUploadId: string;
  taxYearId: string;
  action: TransactionAction;
  transactionDate: Date;
  isin: string;
  ticker: string;
  securityName: string;
  shares: number;
  pricePerShare: number;
  priceCurrency: Currency;
  totalAmountOriginal: number;
  exchangeRateToLocal: number;
  totalAmountLocal: number;
  withholdingTaxOriginal: number;
  withholdingTaxCurrency: Currency;
  withholdingTaxLocal: number;
  brokerTransactionId: string;
}

export interface RawCsvRow {
  [key: string]: string;
}
