import type { Transaction, TransactionAction, Currency, RawCsvRow } from '../types/transaction.js';
import { createWarningSink, type ParserWarning } from './parserWarnings.js';

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

// Trading212 emits plain decimal values ("1505.00"): no thousands separator, no
// currency symbol. The two maintained OSS parsers that compute real tax returns
// off this format (KapJI/capital-gains-calculator, tacgomes/investir) both hand
// the raw cell straight to Python's Decimal(), which RAISES on a separator or a
// symbol, and both special-case "" / "Not available" as the absent sentinel.
// Two independent implementations agreeing is the evidence this grammar is
// calibrated to the real export rather than, as the pre-fix version was, to a
// guess carried since the initial commit.
//
// Grouping ("1,505.00") is REJECTED (SUGGESTIONS S7). The #264 fix kept it
// purely to preserve the pre-fix reading, but the evidence pass over 5 real
// T212 exports (143 distinct numeric cells, 2020-2024, GBP/USD/EUR bases)
// found NO thousands separator at any magnitude ("32453.25" is a five-digit
// cell with no comma), and both OSS parsers above raise on any comma. Given
// that, a comma is more plausibly a European decimal marker than grouping,
// and reading "1,505" as 1505 when it meant 1.505 would be a silent 1000x
// over-statement -- the exact failure mode this grammar exists to prevent.
// So ANY comma now classifies as unreadable and fails loud below ("1,505.00",
// "1,505", "1505,00", "1.505,00" alike), feeding the aggregated warning and
// the #24A hard-stop instead of a silent read under an assumed convention.
const NUMERIC_PATTERN = /^[+-]?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/;

// Trading212 leaves the exchange rate empty, or writes the literal "Not
// available", when a row needed no conversion (the instrument trades in the
// account's base currency). Both are a legitimate ABSENT, not a broken value:
// callers already default them (the exchange rate to 1), and treating them as
// unreadable would fire the warning below on every same-currency row and
// hard-stop a perfectly correct file. Both OSS parsers above carry the same
// sentinel set.
const ABSENT_NUMERIC_VALUES = new Set(['', 'not available']);

type NumericCell =
  | { kind: 'value'; value: number }
  | { kind: 'absent' }
  | { kind: 'unreadable' };

// Bounds each cell value echoed into the unreadable-value warning (SUGGESTIONS
// S5). The parse-alert endpoint validates warnings with a Zod `.max(500)` that
// REJECTS rather than truncates, so one pathological cell (a pasted paragraph,
// binary junk) would push the aggregated warning past 500 chars and silently
// drop the entire parse-alert report -- and a weird export is exactly the
// report worth keeping. 32 chars is plenty to locate the cell in the file, and
// three capped examples keep the whole warning comfortably under the limit.
// Secondary benefit: bounds the verbatim-user-content surface that lands in
// ParseAlertLog.
const MAX_EXAMPLE_VALUE_LENGTH = 32;

function truncateExampleValue(value: string): string {
  if (value.length <= MAX_EXAMPLE_VALUE_LENGTH) return value;
  return `${value.slice(0, MAX_EXAMPLE_VALUE_LENGTH)}...`;
}

// Splits what the pre-fix parseNumber collapsed into a bare 0: a legitimately
// absent value, and a value we genuinely cannot read. The caller defaults the
// former and warns about the latter.
function classifyNumber(value: string | undefined): NumericCell {
  if (value === undefined) return { kind: 'absent' };
  const trimmed = value.trim();
  if (ABSENT_NUMERIC_VALUES.has(trimmed.toLowerCase())) return { kind: 'absent' };
  if (!NUMERIC_PATTERN.test(trimmed)) return { kind: 'unreadable' };
  const parsed = parseFloat(trimmed);
  // The grammar admits an exponent, so an overflowing "9e999" would reach
  // parseFloat as Infinity and poison the engine as a number. Treat it as
  // unreadable rather than let a non-finite value through.
  if (!Number.isFinite(parsed)) return { kind: 'unreadable' };
  return { kind: 'value', value: parsed };
}

// T212 suffixes the row-total column with the ACCOUNT base currency, which
// varies per user: "Total (EUR)" on a EUR account, "Total (USD)" on a USD one,
// while some exports emit a bare "Total". Matching only the first two (as we did
// until this fix) meant any other base currency read 0 -> zeroed proceeds ->
// under-declared tax with no warning. The suffix is constrained to an ISO 4217
// code (all are three letters) and the whole pattern is anchored, so sibling
// columns ("Charge amount (EUR)", "Currency (Total)") and any non-currency
// variant fail to match and fall through to the loud warning below rather than
// being read as a total we did not actually recognise.
const TOTAL_COLUMN_PATTERN = /^total(\s*\([A-Z]{3}\))?$/i;

function isBareTotal(key: string): boolean {
  return key.trim().toLowerCase() === 'total';
}

// Returns the row total plus whether a total column existed at all. The two are
// distinct: an absent column is a parse failure we must warn about, while a
// present column holding 0 is a legitimate zero.
function resolveTotal(row: RawCsvRow, readNumber: (column: string) => number): { value: number; columnFound: boolean } {
  const totalKeys = Object.keys(row).filter((key) => TOTAL_COLUMN_PATTERN.test(key.trim()));
  if (totalKeys.length === 0) return { value: 0, columnFound: false };

  // Bare "Total" keeps precedence over a suffixed variant, and the first
  // non-zero value wins, so the previous `row['Total'] || row['Total (EUR)']`
  // behaviour is preserved exactly for the shapes it already handled.
  const orderedKeys = [...totalKeys.filter(isBareTotal), ...totalKeys.filter((key) => !isBareTotal(key))];
  for (const key of orderedKeys) {
    const parsed = readNumber(key);
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
  /**
   * The same warnings as `warnings`, in the same order, each carrying a stable
   * code and a severity (SUGGESTIONS S6). Consumers that need to REASON about a
   * warning -- above all the pre-pay gate, which must know whether a file would
   * under-state the declaration -- read this instead of matching on prose.
   * `warnings` stays the display channel.
   */
  structuredWarnings: ParserWarning[];
}

export interface SkippedRow {
  rowIndex: number;
  reason: string;
  rawAction: string;
}

export function parseTrading212Csv(rows: RawCsvRow[]): ParseResult {
  const transactions: Transaction[] = [];
  const skipped: SkippedRow[] = [];
  const sink = createWarningSink();
  const { warnings, structuredWarnings } = sink;
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
  // A present column holding a value we cannot read is the same failure one
  // layer down: the pre-fix parseNumber turned "$1505.00" into 0 and the
  // EU-decimal "1.505,00" into 1.505, both silently. Counted across the file for
  // ONE warning, with a few unique examples so the user can find the cell.
  let unreadableValueCount = 0;
  const unreadableExamples = new Set<string>();

  if (rows.length === 0) {
    sink.push('t212_csv_empty', 'CSV file is empty or has no data rows.');
    return { transactions, skipped, warnings, structuredWarnings };
  }

  const firstRow = rows[0];
  if (!('Action' in firstRow)) {
    sink.push(
      't212_missing_action_column',
      'Missing "Action" column. This may not be a Trading212 CSV export.'
    );
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

    // Reads one numeric cell, recording anything unreadable for the warning
    // below. An unreadable value still yields 0 (the pre-fix number), so this
    // adds the missing SIGNAL without changing any amount we already computed.
    const readNumber = (column: string): number => {
      const cell = classifyNumber(row[column]);
      if (cell.kind === 'unreadable') {
        unreadableValueCount++;
        if (unreadableExamples.size < 3) {
          unreadableExamples.add(`${column}: "${truncateExampleValue((row[column] ?? '').trim())}"`);
        }
        return 0;
      }
      return cell.kind === 'value' ? cell.value : 0;
    };

    const isin = (row['ISIN'] ?? '').trim();
    const ticker = (row['Ticker'] ?? '').trim();
    const securityName = (row['Name'] ?? '').trim();
    const shares = readNumber('No. of shares');
    const pricePerShare = readNumber('Price / share');
    const priceCurrency = parseCurrency(row['Currency (Price / share)'] ?? 'USD');
    const exchangeRate = readNumber('Exchange rate') || 1;
    const { value: total, columnFound: totalColumnFound } = resolveTotal(row, readNumber);
    if (!totalColumnFound) missingTotalRowCount++;
    // T212's "Total" column is in the ACCOUNT base currency, while pricePerShare
    // and priceCurrency describe the INSTRUMENT. Since Total = shares * price *
    // exchangeRate, the exchange rate is account-per-instrument, so dividing by it
    // recovers the amount in the instrument currency. We store totalAmountOriginal
    // in priceCurrency (every parser does) so applyBnrRates converts it at the
    // matching per-date instrument BNR rate. Without this, an EUR-account statement
    // of USD stocks converted the EUR "Total" at the USD rate -> wrong RON (and
    // under-declared whenever account/instrument < 1). A same-currency account has
    // exchangeRate 1 (readNumber(...) || 1 also guards blank/absent), so those
    // statements stay byte-identical to the previous behaviour.
    const totalInPriceCurrency = Math.abs(total) / exchangeRate;
    const withholdingTax = readNumber('Withholding tax');
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
    sink.push(
      't212_interest_income_out_of_scope',
      `Detected ${interestRowCount} interest-income row(s) (e.g. "Interest on cash"). InvesTax does not calculate interest income; it is taxable (venituri din dobanzi) and must be declared separately.`,
      { count: interestRowCount }
    );
  }

  if (missingTotalRowCount > 0) {
    sink.push(
      't212_missing_total_column',
      `Could not find a total column on ${missingTotalRowCount} row(s). Trading212 names it "Total" or "Total (<currency>)" after your account's base currency. Without it the amounts on those rows read as zero, which would under-report your declaration.`,
      { count: missingTotalRowCount }
    );
  }

  if (unreadableValueCount > 0) {
    const examples = [...unreadableExamples].join(', ');
    sink.push(
      't212_unreadable_numeric_value',
      `Could not read ${unreadableValueCount} numeric value(s) in this file (e.g. ${examples}). Trading212 exports plain numbers such as "1505.00". A value we cannot read falls back to a default (zero, or a 1:1 exchange rate), which would misstate your declaration.`,
      { count: unreadableValueCount, examples }
    );
  }

  if (transactions.length === 0 && skipped.length === 0) {
    sink.push('t212_no_transactions_parsed', 'No transactions could be parsed from this file.');
  }

  return { transactions, skipped, warnings, structuredWarnings };
}
