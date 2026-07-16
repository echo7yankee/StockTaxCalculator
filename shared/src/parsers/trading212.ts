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

// T212 suffixes the row-total column with the ACCOUNT base currency, which
// varies per user: "Total (EUR)" on a EUR account, "Total (USD)" on a USD one,
// while some exports emit a bare "Total". Matching only the first two (as we did
// until this fix) meant any other base currency read 0 -> zeroed proceeds ->
// under-declared tax with no warning. The pattern is anchored, so sibling
// columns like "Charge amount (EUR)" cannot match.
const TOTAL_COLUMN_PATTERN = /^total(\s*\(.+\))?$/i;

function isBareTotal(key: string): boolean {
  return key.trim().toLowerCase() === 'total';
}

// Returns the row total plus whether a total column existed at all. The two are
// distinct: an absent column is a parse failure we must warn about, while a
// present column holding 0 is a legitimate zero.
function resolveTotal(row: RawCsvRow): { value: number; columnFound: boolean } {
  const totalKeys = Object.keys(row).filter((key) => TOTAL_COLUMN_PATTERN.test(key.trim()));
  if (totalKeys.length === 0) return { value: 0, columnFound: false };

  // Bare "Total" keeps precedence over a suffixed variant, and the first
  // non-zero value wins, so the previous `row['Total'] || row['Total (EUR)']`
  // behaviour is preserved exactly for the shapes it already handled.
  const orderedKeys = [...totalKeys.filter(isBareTotal), ...totalKeys.filter((key) => !isBareTotal(key))];
  for (const key of orderedKeys) {
    const parsed = parseNumber(row[key]);
    if (parsed) return { value: parsed, columnFound: true };
  }
  return { value: 0, columnFound: true };
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
  // Interest rows ("Interest on cash") are real, taxable income (venituri din
  // dobanzi) that InvesTax does not compute. Left as a plain transaction they
  // would contribute nothing to income/CASS/securities AND produce no warning,
  // silently under-reporting the declaration. Route them to `skipped` (so the
  // user sees them listed) and count them for ONE clear warning below, mirroring
  // the IBKR parser's interest-out-of-scope warning so the #24A hard-stop fires.
  let interestRowCount = 0;
  // Counted like interest rows so an unreadable total fails loud through the
  // #24A hard-stop instead of silently zeroing a row's proceeds.
  let missingTotalRowCount = 0;

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

    if (action === 'interest') {
      interestRowCount++;
      skipped.push({
        rowIndex: i + 2,
        reason: 'Interest income is not calculated by InvesTax and must be declared separately',
        rawAction,
      });
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
    const { value: total, columnFound: totalColumnFound } = resolveTotal(row);
    if (!totalColumnFound) missingTotalRowCount++;
    // T212's "Total" column is in the ACCOUNT base currency, while pricePerShare
    // and priceCurrency describe the INSTRUMENT. Since Total = shares * price *
    // exchangeRate, the exchange rate is account-per-instrument, so dividing by it
    // recovers the amount in the instrument currency. We store totalAmountOriginal
    // in priceCurrency (every parser does) so applyBnrRates converts it at the
    // matching per-date instrument BNR rate. Without this, an EUR-account statement
    // of USD stocks converted the EUR "Total" at the USD rate -> wrong RON (and
    // under-declared whenever account/instrument < 1). A same-currency account has
    // exchangeRate 1 (parseNumber(...) || 1 also guards blank/zero), so those
    // statements stay byte-identical to the previous behaviour.
    const totalInPriceCurrency = Math.abs(total) / exchangeRate;
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
      totalAmountOriginal: totalInPriceCurrency,
      exchangeRateToLocal: exchangeRate,
      totalAmountLocal: 0, // calculated later with BNR rates
      withholdingTaxOriginal: Math.abs(withholdingTax),
      withholdingTaxCurrency,
      withholdingTaxLocal: 0,
      brokerTransactionId,
    };

    transactions.push(transaction);
  }

  if (interestRowCount > 0) {
    warnings.push(
      `Detected ${interestRowCount} interest-income row(s) (e.g. "Interest on cash"). InvesTax does not calculate interest income; it is taxable (venituri din dobanzi) and must be declared separately.`
    );
  }

  if (missingTotalRowCount > 0) {
    warnings.push(
      `Could not find a total column on ${missingTotalRowCount} row(s). Trading212 names it "Total" or "Total (<currency>)" after your account's base currency. Without it the amounts on those rows read as zero, which would under-report your declaration.`
    );
  }

  if (transactions.length === 0 && skipped.length === 0) {
    warnings.push('No transactions could be parsed from this file.');
  }

  return { transactions, skipped, warnings };
}
