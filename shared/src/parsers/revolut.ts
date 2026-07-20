import type { Transaction, TransactionAction, Currency } from '../types/transaction.js';
import type { ParseResult, SkippedRow } from './trading212.js';
import { createWarningSink } from './parserWarnings.js';

/**
 * Revolut Invest "Account Statement" parser.
 *
 * STATUS: BETA. Built to the CURRENT Revolut Account Statement schema, pinned
 * from the maintained `dickwolff/Export-To-Ghostfolio` converter + its committed
 * real anonymized sample, cross-checked against several other importers (see
 * `docs/revolut-csv-format.md`). It has NOT been validated against our own real
 * anonymized user exports, so per the Regression Firewall (`09-backlog` 8.6 #5)
 * it ships behind the parser-warning hard-stop (#24A) + a persistent
 * verify-before-filing caveat, and is not promoted to TRUSTED until >=3 real
 * exports parse end-to-end.
 *
 * The Account Statement is a single FLAT table (unlike IBKR's multi-section
 * statement). The native download is Excel (`.xlsx`); the wire-in step reads the
 * sheet into rows. We take raw rows (`string[][]`, header row + data rows) so the
 * same parser serves an xlsx-derived sheet or a `Papa.parse(file, {header:false})`
 * CSV, and we build a normalised column map from the header row (tolerant of
 * case / whitespace / column reordering). Output is the shared ParseResult
 * contract, so it flows through `applyBnrRates` + `calculateTaxes` unchanged.
 *
 * Current schema (8 columns, verbatim):
 *   Date, Ticker, Type, Quantity, Price per share, Total Amount, Currency, FX Rate
 * Example rows:
 *   2023-09-22T13:30:10.514Z, O,    BUY - MARKET,  1.63453043, $52.07,  $85.11, USD, 1.0665
 *   2023-07-14T13:30:00.797Z, MA,   SELL - MARKET, 0.1998348,  $402.13, $80.34, USD, 1.1241
 *   2019-12-13T08:40:00.835Z, MSFT, DIVIDEND,      ,           ,        $0.08,  USD, 1.1179
 *   2025-09-08T07:29:03.333Z, MSFT, BUY - MARKET,  "0,76672417", €26.09, €20,   EUR, 1
 *
 * Row mapping:
 *   BUY - MARKET   -> buy            (cost basis)
 *   SELL - MARKET  -> sell           (proceeds)
 *   DIVIDEND       -> dividend       (see withholding note below)
 *   STOCK SPLIT    -> zero-cost buy  (adds shares at $0, so the weighted-average
 *                                     cost basis per share drops proportionally,
 *                                     which is exactly a forward split)
 *   CASH TOP-UP / CASH WITHDRAWAL / CUSTODY FEE (exact) and the internal
 *     TRANSFER FROM REVOLUT..TO REVOLUT.. migration rows -> ignored
 *   anything else  -> a parse warning (trips the #24A hard-stop) so an unseen row
 *                     type can never be silently miscomputed.
 *
 * The `Currency` ISO column is the source of truth; we ignore Revolut's `FX Rate`
 * column entirely and convert each transaction to RON ourselves via BNR (per its
 * own `priceCurrency`), exactly like the Trading212 and IBKR flows. A mixed
 * USD/EUR statement therefore rides the multi-currency BNR support (backlog #5).
 *
 * KNOWN BETA LIMITATIONS (documented for the ghid page + covered by the
 * verify-before-filing caveat):
 *  - Dividends carry NO withholding-tax breakdown in the current format (the old
 *    `DIVNRA` rows are gone), so `withholdingTaxOriginal` is 0 and the engine
 *    computes the full 10% Romanian dividend tax with no foreign-tax credit. That
 *    OVER-states the dividend tax (the safe direction: never under-declares), and
 *    the user is told to verify dividend tax manually.
 *  - Entity-migration `TRANSFER FROM REVOLUT TRADING LTD TO REVOLUT SECURITIES
 *    EUROPE UAB` rows are $0 custodian bookkeeping; we ignore them. The buys that
 *    set the cost basis are still present earlier in the same All-time export.
 *  - Reverse stock splits (a split row with a negative quantity) are not modelled
 *    and emit a warning rather than guess.
 */

const SUPPORTED_CURRENCIES: Record<string, Currency> = {
  USD: 'USD',
  EUR: 'EUR',
  GBP: 'GBP',
  RON: 'RON',
};

const SYMBOL_TO_CURRENCY: Record<string, Currency> = {
  $: 'USD',
  '€': 'EUR',
  '£': 'GBP',
};

type RowClass = 'buy' | 'sell' | 'dividend' | 'split' | 'ignore' | 'unknown';

function normalizeHeader(value: string | undefined): string {
  return (value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Parse a Revolut numeric cell, locale-tolerant. Strips inline currency symbols
 * (`$52.07`, `€88.94`) and resolves the decimal separator: if both `.` and `,`
 * appear, the later one is the decimal (so `1,234.56` US and `1.234,56` EU both
 * read as 1234.56); a lone `,` is treated as the decimal (`"0,76672417"`).
 */
function parseRevolutNumber(value: string | undefined): number {
  if (!value) return 0;
  let s = value.replace(/[^0-9.,-]/g, '').trim();
  if (s === '' || s === '-') return 0;
  const lastDot = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');
  if (lastDot !== -1 && lastComma !== -1) {
    if (lastComma > lastDot) {
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      s = s.replace(/,/g, '');
    }
  } else if (lastComma !== -1) {
    s = s.replace(',', '.');
  }
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Non-taxable row types, anchored EXACTLY (post-normalizeHeader: lowercased,
 * whitespace collapsed). Every entry is evidenced by the real anonymized Account
 * Statement sample this parser is pinned to (`dickwolff/Export-To-Ghostfolio`
 * `samples/revolut-invest-export.csv`) or in another real export surveyed in the
 * PR #270 review: CUSTODY FEE REVERSAL (a fee refund; real 2025 fixture in
 * `ulyssetsd/revoprofit`, mapped as a fee by revoprofit + hackmajoris/brokers-sync)
 * and the underscore variant CUSTODY_FEE (real statement in `segoy89/stockary`),
 * which classifyType folds into the spaced form. See docs/revolut-csv-format.md.
 * Bare substrings ('cash', 'fee', 'transfer', ...) previously classified a
 * never-seen income-bearing type such as "MERGER - CASH" as ignore, dropping the
 * row SILENTLY; anything outside this set now falls through to 'unknown', whose
 * warning is fatal (closes the pre-pay gate), so the failure direction is safe.
 */
const IGNORED_TYPES = new Set(['cash top-up', 'cash withdrawal', 'custody fee', 'custody fee reversal']);

/**
 * Internal Revolut entity-migration bookkeeping rows, e.g. "TRANSFER FROM
 * REVOLUT TRADING LTD TO REVOLUT SECURITIES EUROPE UAB" ($0 custodian moves; the
 * cost-basis buys remain in the same All-time export). Anchored Revolut-to-Revolut
 * deliberately: an in-kind transfer from an EXTERNAL broker would carry cost-basis
 * information we cannot model, so it must warn, not vanish.
 */
const REVOLUT_INTERNAL_TRANSFER = /^transfer from revolut .+ to revolut .+$/;

function classifyType(typeRaw: string): RowClass {
  // Underscore variants ("CUSTODY_FEE", seen in a real older-format statement)
  // classify exactly like their spaced form.
  const t = normalizeHeader(typeRaw.replace(/_/g, ' '));
  if (t === '') return 'unknown';
  if (t.includes('stock split') || t === 'split') return 'split';
  if (t.includes('sell')) return 'sell';
  if (t.includes('buy')) return 'buy';
  if (t.includes('dividend')) return 'dividend';
  if (IGNORED_TYPES.has(t) || REVOLUT_INTERNAL_TRANSFER.test(t)) return 'ignore';
  return 'unknown';
}

/** Detect a currency from an inline symbol on an amount cell, when the ISO column is blank. */
function detectCurrencyFromSymbol(value: string | undefined): Currency | undefined {
  if (!value) return undefined;
  for (const [symbol, currency] of Object.entries(SYMBOL_TO_CURRENCY)) {
    if (value.includes(symbol)) return currency;
  }
  return undefined;
}

export function parseRevolutStatement(rows: string[][]): ParseResult {
  const transactions: Transaction[] = [];
  const skipped: SkippedRow[] = [];
  const sink = createWarningSink();
  const { warnings, structuredWarnings } = sink;

  if (!rows || rows.length === 0) {
    sink.push('revolut_file_empty', 'File is empty or has no data rows.');
    return { transactions, skipped, warnings, structuredWarnings };
  }

  // Find the header row (tolerant of leading blank/title rows an xlsx export may
  // carry). A Revolut Account Statement header has at least Date, Type and Total
  // Amount. The old PDF-era format ("Activity Type" / "Amount") fails this gate
  // and is rejected below with a clear warning rather than mis-parsed.
  let headerIdx = -1;
  let cols: Record<string, number> = {};
  for (let i = 0; i < rows.length; i++) {
    const map: Record<string, number> = {};
    (rows[i] ?? []).forEach((cell, idx) => {
      const norm = normalizeHeader(cell);
      if (norm && !(norm in map)) map[norm] = idx;
    });
    if ('date' in map && 'type' in map && 'total amount' in map) {
      headerIdx = i;
      cols = map;
      break;
    }
  }

  if (headerIdx === -1) {
    sink.push(
      'revolut_not_an_account_statement',
      'This does not look like a Revolut Account Statement (no Date / Type / Total Amount columns found). Export it via Invest > More > Documents > Stocks > Account Statement > Excel.'
    );
    return { transactions, skipped, warnings, structuredWarnings };
  }

  const colIndex = (...names: string[]): number => {
    for (const n of names) {
      if (n in cols) return cols[n];
    }
    return -1;
  };

  const dateIdx = colIndex('date');
  const typeIdx = colIndex('type');
  const tickerIdx = colIndex('ticker', 'symbol');
  const quantityIdx = colIndex('quantity');
  const priceIdx = colIndex('price per share', 'price');
  const amountIdx = colIndex('total amount');
  const currencyIdx = colIndex('currency');

  const unsupportedCurrencies = new Set<string>();
  const unknownTypes = new Set<string>();

  const cell = (row: string[], idx: number): string => (idx >= 0 ? (row[idx] ?? '').trim() : '');

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;
    // A row whose cells are all empty is spreadsheet padding; skip silently.
    if (row.every((c) => (c ?? '').trim() === '')) continue;

    const rowNumber = i + 1; // 1-based for user-facing messages
    const typeRaw = cell(row, typeIdx);
    const kind = classifyType(typeRaw);

    if (kind === 'ignore') {
      skipped.push({ rowIndex: rowNumber, reason: `Non-taxable row ignored: "${typeRaw}"`, rawAction: typeRaw });
      continue;
    }
    if (kind === 'unknown') {
      unknownTypes.add(typeRaw || '(empty)');
      skipped.push({ rowIndex: rowNumber, reason: `Unrecognised transaction type: "${typeRaw}"`, rawAction: typeRaw });
      continue;
    }

    const date = new Date(cell(row, dateIdx));
    if (isNaN(date.getTime())) {
      skipped.push({ rowIndex: rowNumber, reason: `Invalid date: "${cell(row, dateIdx)}"`, rawAction: typeRaw });
      continue;
    }

    // Resolve currency: the ISO column is the source of truth; only fall back to
    // the inline amount symbol when the ISO column is blank. A non-empty but
    // unsupported value (e.g. GBX pence) is skipped, never symbol-guessed, to
    // avoid a 100x pence/pounds error.
    const currencyRaw = cell(row, currencyIdx);
    let currency: Currency | undefined;
    if (currencyRaw) {
      currency = SUPPORTED_CURRENCIES[currencyRaw.toUpperCase()];
      if (!currency) {
        unsupportedCurrencies.add(currencyRaw);
        skipped.push({ rowIndex: rowNumber, reason: `Unsupported currency: "${currencyRaw}"`, rawAction: typeRaw });
        continue;
      }
    } else {
      currency = detectCurrencyFromSymbol(cell(row, amountIdx)) ?? detectCurrencyFromSymbol(cell(row, priceIdx));
      if (!currency) {
        skipped.push({ rowIndex: rowNumber, reason: 'Could not determine the currency for this row', rawAction: typeRaw });
        continue;
      }
    }

    const quantity = parseRevolutNumber(cell(row, quantityIdx));

    if (kind === 'split') {
      // Forward split: add the new shares at zero cost (weighted-average cost per
      // share drops proportionally). A negative quantity would be a reverse split,
      // which we do not model, so warn instead of guessing.
      if (quantity <= 0) {
        const splitTicker = cell(row, tickerIdx) || 'an unknown security';
        sink.push(
          'revolut_reverse_split_unapplied',
          `Stock split for "${splitTicker}" on row ${rowNumber} could not be applied automatically. Check this position before filing.`,
          { ticker: splitTicker, row: rowNumber }
        );
        continue;
      }
      transactions.push(
        makeTransaction({
          i,
          action: 'buy',
          date,
          ticker: cell(row, tickerIdx),
          shares: quantity,
          pricePerShare: 0,
          totalAmountOriginal: 0,
          currency,
        })
      );
      continue;
    }

    if (kind === 'dividend') {
      const amount = Math.abs(parseRevolutNumber(cell(row, amountIdx)));
      if (amount === 0) {
        skipped.push({ rowIndex: rowNumber, reason: 'Zero-amount dividend', rawAction: typeRaw });
        continue;
      }
      transactions.push(
        makeTransaction({
          i,
          action: 'dividend',
          date,
          ticker: cell(row, tickerIdx),
          shares: 0,
          pricePerShare: 0,
          totalAmountOriginal: amount,
          currency,
        })
      );
      continue;
    }

    // buy / sell
    const shares = Math.abs(quantity);
    if (shares === 0) {
      skipped.push({ rowIndex: rowNumber, reason: 'Zero quantity on a trade', rawAction: typeRaw });
      continue;
    }
    transactions.push(
      makeTransaction({
        i,
        action: kind, // 'buy' | 'sell'
        date,
        ticker: cell(row, tickerIdx),
        shares,
        pricePerShare: Math.abs(parseRevolutNumber(cell(row, priceIdx))),
        totalAmountOriginal: Math.abs(parseRevolutNumber(cell(row, amountIdx))),
        currency,
      })
    );
  }

  if (unsupportedCurrencies.size > 0) {
    const currencies = [...unsupportedCurrencies].join(', ');
    sink.push(
      'revolut_unsupported_currencies_skipped',
      `Unsupported currencies found (${currencies}). InvesTax supports USD, EUR, GBP and RON; those rows were skipped.`,
      { currencies }
    );
  }
  if (unknownTypes.size > 0) {
    const types = [...unknownTypes].join(', ');
    sink.push(
      'revolut_unrecognised_types_skipped',
      `Unrecognised transaction types found (${types}). Those rows were skipped; check them before filing.`,
      { types }
    );
  }
  if (transactions.length === 0 && skipped.length === 0) {
    sink.push('revolut_no_transactions_parsed', 'No transactions could be parsed from this file.');
  }

  return { transactions, skipped, warnings, structuredWarnings };
}

function makeTransaction(args: {
  i: number;
  action: TransactionAction;
  date: Date;
  ticker: string;
  shares: number;
  pricePerShare: number;
  totalAmountOriginal: number;
  currency: Currency;
}): Transaction {
  return {
    id: `revolut-${args.i}`,
    csvUploadId: '',
    taxYearId: '',
    action: args.action,
    transactionDate: args.date,
    isin: '', // Revolut Account Statements carry no ISIN; the engine groups on ticker
    ticker: args.ticker,
    securityName: '',
    shares: args.shares,
    pricePerShare: args.pricePerShare,
    priceCurrency: args.currency,
    totalAmountOriginal: args.totalAmountOriginal,
    exchangeRateToLocal: 1, // real RON rate applied later by applyBnrRates
    totalAmountLocal: 0,
    withholdingTaxOriginal: 0, // not itemised in the current Revolut format
    withholdingTaxCurrency: args.currency,
    withholdingTaxLocal: 0,
    brokerTransactionId: '',
  };
}
