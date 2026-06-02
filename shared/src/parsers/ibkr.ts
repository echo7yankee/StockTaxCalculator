import type { Transaction, TransactionAction, Currency } from '../types/transaction.js';
import type { ParseResult, SkippedRow } from './trading212.js';

/**
 * Interactive Brokers (IBKR) Activity Statement CSV parser.
 *
 * STATUS: BETA. Built to IBKR's documented Activity Statement CSV format (see
 * `docs/ibkr-csv-format.md`), cross-checked against real sample statements and
 * several real-file-tested open-source IBKR parsers. It has NOT yet been
 * validated against real anonymized user exports of our own, so per the
 * Regression Firewall (`09-backlog 8.6` #5) it must ship behind the
 * parser-warning hard-stop (#24A) + sign/magnitude refusal (#24C) + a
 * verify-before-filing caveat, and may not be promoted to TRUSTED until >=3 real
 * exports parse correctly end-to-end.
 *
 * Unlike a Trading212 CSV (one flat table), an IBKR Activity Statement is
 * MULTI-SECTION: every row begins with a section name (col 0) and a row type
 * (col 1: "Header" | "Data" | "SubTotal" | "Total" | ...). Columns differ per
 * section but are consistent within a section. The header row names the columns;
 * data rows align to it. We route the sections we need for a Romanian tax calc:
 *
 *   Trades                          -> buy / sell capital-gains transactions
 *   Financial Instrument Information -> Symbol -> ISIN / name lookup (best effort)
 *   Dividends                        -> gross dividend income
 *   Withholding Tax                  -> foreign tax withheld (D212 credit)
 *
 * Input is raw rows (string[][]) from `Papa.parse(file, { header: false })`,
 * NOT header-keyed RawCsvRow[] (Trading212's model): a single header row cannot
 * describe IBKR's many sections. Output is the same ParseResult contract, so it
 * flows through `applyBnrRates` + `calculateTaxes` unchanged.
 *
 * Beta scope: stocks/ETFs only (other asset categories are skipped with a
 * reason); USD/EUR/GBP/RON only (other currencies skipped, pending multi-currency
 * BNR work, backlog #5); commissions are folded into cost basis (buy) and net
 * proceeds (sell), which ANAF allows as deductible transfer costs.
 */

const SUPPORTED_CURRENCIES: Record<string, Currency> = {
  USD: 'USD',
  EUR: 'EUR',
  GBP: 'GBP',
  RON: 'RON',
};

/** IBKR ISIN format: 2-letter country code + 9 alphanumeric + 1 check digit. */
const ISIN_RE = /^[A-Z]{2}[A-Z0-9]{9}\d$/;

/**
 * Dividend/withholding descriptions begin with `SYMBOL (ISIN) ...`, e.g.
 * `AAPL (US0378331005) Cash Dividend`. IBKR writes share-class tickers with an
 * internal space (`BRK B (US...)`), so the symbol group allows spaces and is
 * non-greedy to stop at the `(ISIN)`.
 */
const DESC_SECURITY_RE = /^\s*([A-Za-z0-9. ]{1,15}?)\s*\(([A-Z0-9]{12})\)/;

function isStockCategory(category: string): boolean {
  const c = category.trim().toLowerCase();
  return c === 'stocks' || c === 'stock' || c === 'equity' || c === 'stk';
}

function parseNumber(value: string | undefined): number {
  if (!value || value.trim() === '') return 0;
  const n = parseFloat(value.replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
}

/**
 * Build a UTC-midnight Date from numeric parts, or null if out of range. Uses
 * the same `new Date('YYYY-MM-DD')` construction the ISO path always used, so
 * trade dates stay byte-identical; the round-trip check rejects rolled-over
 * impossible dates (e.g. 2026-02-31).
 */
function makeIsoDate(year: number, month: number, day: number): Date | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const iso = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const d = new Date(iso);
  if (isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== iso) return null;
  return d;
}

/**
 * Parse an IBKR date. The Trades section uses ISO `"YYYY-MM-DD, HH:MM:SS"`, but
 * the cash sections (Dividends, Withholding Tax, ...) use the ACCOUNT-CONFIGURED
 * format, which on non-US entities (e.g. IBKR Ireland) is day-first `DD-MM-YY`.
 * A naive `new Date("15-04-26")` mis-reads that as MM-DD-YY and either rolls to a
 * garbage date or, for day > 12, returns Invalid Date and SILENTLY DROPS real
 * income (a dividend, a withholding credit). We parse explicitly: ISO and compact
 * `YYYYMMDD` first, then a 2-or-4-digit-year `D-M-Y` / `M-D-Y` form whose
 * day/month order is resolved per date when one component is > 12, else from
 * `twoDigitYearOrder` (inferred from the whole file). The year is always taken
 * verbatim, so the order can never change which tax year a row lands in (the only
 * thing the engine keys dividends + withholding on).
 */
function parseIbkrDate(raw: string, twoDigitYearOrder: 'DMY' | 'MDY' = 'DMY'): Date | null {
  if (!raw) return null;
  const datePart = raw.split(',')[0].trim().split(' ')[0].trim();

  // ISO YYYY-MM-DD (Trades, and any cash section that emits ISO).
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(datePart);
  if (m) return makeIsoDate(+m[1], +m[2], +m[3]);

  // Compact YYYYMMDD.
  if (/^\d{8}$/.test(datePart)) {
    return makeIsoDate(+datePart.slice(0, 4), +datePart.slice(4, 6), +datePart.slice(6, 8));
  }

  // D-M-Y or M-D-Y, `-` or `/` separators, 2- or 4-digit year.
  m = /^(\d{1,2})[-/](\d{1,2})[-/](\d{2}|\d{4})$/.exec(datePart);
  if (m) {
    const a = +m[1];
    const b = +m[2];
    const year = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    let day: number;
    let month: number;
    if (a > 12 && b <= 12) {
      day = a; // first component can only be the day
      month = b;
    } else if (b > 12 && a <= 12) {
      month = a; // second component can only be the day
      day = b;
    } else if (twoDigitYearOrder === 'MDY') {
      month = a;
      day = b;
    } else {
      day = a;
      month = b;
    }
    return makeIsoDate(year, month, day);
  }

  return null;
}

/**
 * IBKR applies ONE account-configured date format to every cash section of a
 * statement (the Trades section is always ISO and is ignored here). Infer
 * day-first vs month-first from the first cash date whose components disambiguate
 * it (one value > 12). Defaults to day-first (the IBKR Ireland / European
 * default); since the year is always explicit, the choice never changes a row's
 * tax year, only the displayed day/month of an all-ambiguous statement.
 */
function inferCashDateOrder(rows: string[][]): 'DMY' | 'MDY' {
  for (const row of rows) {
    if (!row || row.length < 2 || (row[1] ?? '').trim() !== 'Data') continue;
    for (const cell of row) {
      const m = /^(\d{1,2})[-/](\d{1,2})[-/]\d{2,4}$/.exec((cell ?? '').trim());
      if (!m) continue;
      const a = +m[1];
      const b = +m[2];
      if (a > 12 && b <= 12) return 'DMY';
      if (b > 12 && a <= 12) return 'MDY';
    }
  }
  return 'DMY';
}

function parseSecurityFromDescription(description: string): { symbol: string; isin: string } {
  const m = DESC_SECURITY_RE.exec(description);
  if (m) {
    const isin = ISIN_RE.test(m[2]) ? m[2] : '';
    return { symbol: m[1].trim(), isin };
  }
  return { symbol: '', isin: '' };
}

function buildColumnMap(headerRow: string[]): Record<string, number> {
  const map: Record<string, number> = {};
  headerRow.forEach((cell, idx) => {
    map[(cell ?? '').trim()] = idx;
  });
  return map;
}

export function parseIbkrCsv(rows: string[][]): ParseResult {
  const transactions: Transaction[] = [];
  const skipped: SkippedRow[] = [];
  const warnings: string[] = [];

  if (!rows || rows.length === 0) {
    warnings.push('CSV file is empty or has no data rows.');
    return { transactions, skipped, warnings };
  }

  // Per-section header column maps, populated as we encounter each "Header" row.
  const headers: Record<string, Record<string, number>> = {};
  const symbolToIsin: Record<string, string> = {};
  const symbolToName: Record<string, string> = {};
  // Order-level rollups vs constituent executions, resolved after the pass.
  const orderTrades: Transaction[] = [];
  const tradeTrades: Transaction[] = [];
  const dividends: Transaction[] = [];
  // Withholding tax aggregated by `${securityKey}|${year}`. The engine only
  // needs correct gross-dividend and withholding sums per security per year.
  const withholdingByKeyYear: Record<string, number> = {};
  const skippedCategories = new Set<string>();
  const unsupportedCurrencies = new Set<string>();
  let recognisedSection = false;

  // Cash sections (Dividends, Withholding Tax) use the account-configured date
  // format; resolve day-first vs month-first once from the whole file.
  const cashDateOrder = inferCashDateOrder(rows);

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length < 2) continue;
    const section = (row[0] ?? '').trim();
    const rowType = (row[1] ?? '').trim();

    if (rowType === 'Header') {
      headers[section] = buildColumnMap(row);
      if (section === 'Trades' || section === 'Dividends' || section === 'Withholding Tax') {
        recognisedSection = true;
      }
      continue;
    }
    // Skip SubTotal / Total / Notes rows (their marker sits in col 1, not "Data").
    if (rowType !== 'Data') continue;

    const cols = headers[section];
    if (!cols) continue; // data row before its header, skip defensively
    const get = (name: string): string => {
      const idx = cols[name];
      return idx === undefined ? '' : (row[idx] ?? '').trim();
    };

    if (section === 'Trades') {
      // IBKR emits BOTH an order-level rollup ("Order") and its constituent
      // execution rows ("Trade") when an order fills in several parts; summing
      // both would double-count. Collect Order and Trade rows separately and,
      // after the pass, keep Order rows when present (the complete, non-
      // duplicated set), falling back to Trade rows only when a statement has no
      // Order rollup. ClosedLot / SubTotal / Total are detail or aggregation.
      let bucket = orderTrades;
      if (cols['DataDiscriminator'] !== undefined) {
        const disc = get('DataDiscriminator');
        if (disc === 'Order') bucket = orderTrades;
        else if (disc === 'Trade') bucket = tradeTrades;
        else continue;
      }

      const assetCategory = get('Asset Category');
      if (!isStockCategory(assetCategory)) {
        skippedCategories.add(assetCategory || 'Unknown');
        skipped.push({ rowIndex: i + 1, reason: `Unsupported asset category: "${assetCategory}"`, rawAction: assetCategory });
        continue;
      }

      const currencyRaw = get('Currency');
      const currency = SUPPORTED_CURRENCIES[currencyRaw.toUpperCase()];
      if (!currency) {
        unsupportedCurrencies.add(currencyRaw);
        skipped.push({ rowIndex: i + 1, reason: `Unsupported currency: "${currencyRaw}"`, rawAction: 'Trade' });
        continue;
      }

      const date = parseIbkrDate(get('Date/Time'));
      if (!date) {
        skipped.push({ rowIndex: i + 1, reason: `Invalid date: "${get('Date/Time')}"`, rawAction: 'Trade' });
        continue;
      }

      const quantity = parseNumber(get('Quantity'));
      if (quantity === 0) {
        skipped.push({ rowIndex: i + 1, reason: 'Zero quantity', rawAction: 'Trade' });
        continue;
      }

      const symbol = get('Symbol');
      const pricePerShare = Math.abs(parseNumber(get('T. Price')));
      // Proceeds is signed (negative on buys, positive on sells) and EXCLUDES
      // commission; Comm/Fee is the (negative) fee. Fold the fee into the cost
      // basis on buys and out of the net proceeds on sells.
      const grossProceeds = Math.abs(parseNumber(get('Proceeds')));
      const commission = Math.abs(parseNumber(get('Comm/Fee')));
      const action: TransactionAction = quantity > 0 ? 'buy' : 'sell';
      const totalAmountOriginal =
        action === 'buy' ? grossProceeds + commission : Math.max(0, grossProceeds - commission);

      bucket.push({
        id: `ibkr-${i}`,
        csvUploadId: '',
        taxYearId: '',
        action,
        transactionDate: date,
        isin: '', // filled post-pass from Financial Instrument Information
        ticker: symbol,
        securityName: '',
        shares: Math.abs(quantity),
        pricePerShare,
        priceCurrency: currency,
        totalAmountOriginal,
        exchangeRateToLocal: 1, // real RON rate applied later by applyBnrRates
        totalAmountLocal: 0,
        withholdingTaxOriginal: 0,
        withholdingTaxCurrency: currency,
        withholdingTaxLocal: 0,
        brokerTransactionId: '',
      });
    } else if (section === 'Financial Instrument Information') {
      const symbol = get('Symbol');
      if (!symbol) continue;
      const isin = get('ISIN') || get('Security ID');
      if (ISIN_RE.test(isin)) symbolToIsin[symbol] = isin;
      const name = get('Description');
      if (name) symbolToName[symbol] = name;
    } else if (section === 'Dividends' || section === 'Withholding Tax') {
      const currencyRaw = get('Currency');
      const currency = SUPPORTED_CURRENCIES[currencyRaw.toUpperCase()];
      if (!currency) {
        // "Total" / "SubTotal" rows carry a non-currency value here, so skip
        // them silently. A real unsupported currency (CHF, CAD, ...) is flagged.
        if (currencyRaw && !/^(sub)?total$/i.test(currencyRaw)) unsupportedCurrencies.add(currencyRaw);
        continue;
      }
      const date = parseIbkrDate(get('Date'), cashDateOrder);
      if (!date) {
        // A valid-currency row with an unparseable date is real income we must
        // not drop silently: warn so the #24A hard-stop catches it.
        warnings.push(
          `Could not read the date "${get('Date')}" in the ${section} section; that row was skipped. Please report this so we can support your statement's date format.`
        );
        continue;
      }
      const amount = parseNumber(get('Amount'));
      if (amount === 0) continue;
      const { symbol, isin } = parseSecurityFromDescription(get('Description'));
      const key = isin || symbol;

      if (section === 'Dividends') {
        dividends.push({
          id: `ibkr-div-${i}`,
          csvUploadId: '',
          taxYearId: '',
          action: 'dividend',
          transactionDate: date,
          isin,
          ticker: symbol,
          securityName: '',
          shares: 0,
          pricePerShare: 0,
          priceCurrency: currency,
          totalAmountOriginal: amount, // signed: a reversal nets out correctly
          exchangeRateToLocal: 1,
          totalAmountLocal: 0,
          withholdingTaxOriginal: 0,
          withholdingTaxCurrency: currency,
          withholdingTaxLocal: 0,
          brokerTransactionId: '',
        });
      } else {
        if (!key) {
          warnings.push(`Could not identify the security for a withholding-tax row dated ${get('Date')}; tax credit not applied.`);
          continue;
        }
        const mapKey = `${key}|${date.getFullYear()}`;
        withholdingByKeyYear[mapKey] = (withholdingByKeyYear[mapKey] || 0) + Math.abs(amount);
      }
    }
  }

  // Resolve the Order-vs-Trade duplication: prefer the Order rollup; fall back
  // to Trade rows only when the statement has no Order rows at all.
  const tradeRows = orderTrades.length > 0 ? orderTrades : tradeTrades;

  // Enrich trades with ISIN + name from the instrument-information section
  // (it usually appears after Trades, so this has to be a second pass).
  for (const t of tradeRows) {
    if (!t.isin && symbolToIsin[t.ticker]) t.isin = symbolToIsin[t.ticker];
    if (!t.securityName && symbolToName[t.ticker]) t.securityName = symbolToName[t.ticker];
  }
  for (const d of dividends) {
    if (!d.securityName && symbolToName[d.ticker]) d.securityName = symbolToName[d.ticker];
  }

  // Attach withholding to the matching dividend (same security key + year).
  for (const [mapKey, total] of Object.entries(withholdingByKeyYear)) {
    const sep = mapKey.lastIndexOf('|');
    const key = mapKey.slice(0, sep);
    const year = parseInt(mapKey.slice(sep + 1), 10);
    const match = dividends.find(
      (d) => (d.isin || d.ticker) === key && d.transactionDate.getFullYear() === year
    );
    if (match) {
      match.withholdingTaxOriginal += total;
    } else {
      warnings.push(`Withholding tax of ${total} for "${key}" (${year}) has no matching dividend and was not applied.`);
    }
  }
  transactions.push(...tradeRows, ...dividends);

  if (skippedCategories.size > 0) {
    warnings.push(
      `Skipped non-stock positions (${[...skippedCategories].join(', ')}). InvesTax currently supports stocks and ETFs only.`
    );
  }
  if (unsupportedCurrencies.size > 0) {
    warnings.push(
      `Unsupported currencies found (${[...unsupportedCurrencies].join(', ')}). InvesTax supports USD, EUR, GBP and RON; those rows were skipped.`
    );
  }
  if (!recognisedSection) {
    warnings.push('This does not look like an IBKR Activity Statement (no Trades, Dividends or Withholding Tax section found).');
  } else if (transactions.length === 0 && skipped.length === 0) {
    warnings.push('No transactions could be parsed from this file.');
  }

  return { transactions, skipped, warnings };
}
