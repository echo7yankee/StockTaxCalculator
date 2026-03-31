import type { Transaction, TransactionAction, Currency, RawCsvRow } from '../types/transaction.js';

const ACTION_MAP: Record<string, TransactionAction> = {
  'Market buy': 'buy',
  'Limit buy': 'buy',
  'Stop buy': 'buy',
  'Market sell': 'sell',
  'Limit sell': 'sell',
  'Stop sell': 'sell',
  'Dividend (Ordinary)': 'dividend',
  'Dividend (Dividend)': 'dividend',
  'Dividend (Tax rebate)': 'dividend',
  'Interest on cash': 'interest',
  'Deposit': 'deposit',
  'Withdrawal': 'withdrawal',
};

const CURRENCY_MAP: Record<string, Currency> = {
  USD: 'USD',
  EUR: 'EUR',
  GBP: 'GBP',
  RON: 'RON',
};

function parseCurrency(value: string): Currency {
  const upper = value.trim().toUpperCase();
  return CURRENCY_MAP[upper] ?? 'USD';
}

function parseNumber(value: string | undefined): number {
  if (!value || value.trim() === '') return 0;
  return parseFloat(value.replace(/,/g, '')) || 0;
}

function parseAction(raw: string): TransactionAction | null {
  const trimmed = raw.trim();
  if (ACTION_MAP[trimmed]) return ACTION_MAP[trimmed];
  const lower = trimmed.toLowerCase();
  if (lower.includes('buy')) return 'buy';
  if (lower.includes('sell')) return 'sell';
  if (lower.includes('dividend')) return 'dividend';
  if (lower.includes('interest')) return 'interest';
  if (lower.includes('deposit')) return 'deposit';
  if (lower.includes('withdrawal')) return 'withdrawal';
  return null;
}

export interface ParseResult {
  transactions: Transaction[];
  skipped: SkippedRow[];
  warnings: string[];
}

export interface SkippedRow {
  rowIndex: number;
  reason: string;
  rawAction: string;
}

export function parseTrading212Csv(rows: RawCsvRow[]): ParseResult {
  const transactions: Transaction[] = [];
  const skipped: SkippedRow[] = [];
  const warnings: string[] = [];

  if (rows.length === 0) {
    warnings.push('CSV file is empty or has no data rows.');
    return { transactions, skipped, warnings };
  }

  const firstRow = rows[0];
  if (!('Action' in firstRow)) {
    warnings.push('Missing "Action" column. This may not be a Trading212 CSV export.');
  }

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rawAction = (row['Action'] ?? '').trim();

    const action = parseAction(rawAction);
    if (!action) {
      skipped.push({ rowIndex: i + 2, reason: `Unknown action: "${rawAction}"`, rawAction });
      continue;
    }

    if (action === 'deposit' || action === 'withdrawal') {
      skipped.push({ rowIndex: i + 2, reason: 'Deposits/withdrawals are not taxable', rawAction });
      continue;
    }

    const timeStr = row['Time'] ?? '';
    const transactionDate = new Date(timeStr);
    if (isNaN(transactionDate.getTime())) {
      skipped.push({ rowIndex: i + 2, reason: `Invalid date: "${timeStr}"`, rawAction });
      continue;
    }

    const isin = (row['ISIN'] ?? '').trim();
    const ticker = (row['Ticker'] ?? '').trim();
    const securityName = (row['Name'] ?? '').trim();
    const shares = parseNumber(row['No. of shares']);
    const pricePerShare = parseNumber(row['Price / share']);
    const priceCurrency = parseCurrency(row['Currency (Price / share)'] ?? 'USD');
    const exchangeRate = parseNumber(row['Exchange rate']) || 1;
    const total = parseNumber(row['Total']) || parseNumber(row['Total (EUR)']);
    const withholdingTax = parseNumber(row['Withholding tax']);
    const withholdingTaxCurrency = parseCurrency(row['Currency (Withholding tax)'] ?? row['Currency (Price / share)'] ?? 'USD');
    const brokerTransactionId = (row['ID'] ?? row['Id'] ?? '').trim();

    const transaction: Transaction = {
      id: brokerTransactionId || `t212-${i}`,
      csvUploadId: '',
      taxYearId: '',
      action,
      transactionDate,
      isin,
      ticker,
      securityName,
      shares: Math.abs(shares),
      pricePerShare,
      priceCurrency,
      totalAmountOriginal: Math.abs(total),
      exchangeRateToLocal: exchangeRate,
      totalAmountLocal: 0, // calculated later with BNR rates
      withholdingTaxOriginal: Math.abs(withholdingTax),
      withholdingTaxCurrency,
      withholdingTaxLocal: 0,
      brokerTransactionId,
    };

    transactions.push(transaction);
  }

  if (transactions.length === 0 && skipped.length === 0) {
    warnings.push('No transactions could be parsed from this file.');
  }

  return { transactions, skipped, warnings };
}
