/**
 * Synthetic Revolut Invest "Account Statement" generator.
 *
 * We have no real Revolut export committed (and never commit a customer's), so
 * this generator IS the executable spec for the format `parseRevolutStatement` is
 * built to. It emits the flat `string[][]` shape an xlsx sheet (or a header:false
 * CSV parse) produces, faithful to the real format: inline currency symbols on
 * amounts (`$52.07`, `-$0.01`, `€50`), ISO-8601 UTC dates, the verbose Type
 * labels (`BUY - MARKET`, `SELL - MARKET`, `DIVIDEND`, `STOCK SPLIT`), and the
 * non-taxable noise rows (`CASH TOP-UP`, `CUSTODY FEE`, `TRANSFER FROM..TO..`)
 * the parser must ignore. `euroDecimals` reproduces a Romanian-locale export
 * (comma decimal separator, e.g. `€26,09`, quantity `0,76672417`).
 *
 * Schema (8 columns, verbatim):
 *   Date, Ticker, Type, Quantity, Price per share, Total Amount, Currency, FX Rate
 */

export interface RevolutTradeSpec {
  ticker: string;
  side: 'buy' | 'sell';
  quantity: number;
  pricePerShare: number;
  totalAmount: number;
  /** ISO-8601, e.g. '2025-02-01T10:00:00.000Z'. */
  date: string;
  currency?: string;
}

export interface RevolutDividendSpec {
  ticker: string;
  amount: number;
  date: string;
  currency?: string;
}

export interface RevolutSplitSpec {
  ticker: string;
  /** Shares added by a forward split (positive). Negative models a reverse split. */
  quantity: number;
  date: string;
  currency?: string;
}

export interface RevolutStatementSpec {
  trades?: RevolutTradeSpec[];
  dividends?: RevolutDividendSpec[];
  splits?: RevolutSplitSpec[];
  /** Emit CASH TOP-UP / CUSTODY FEE / TRANSFER noise rows the parser must ignore. Default true. */
  includeNoise?: boolean;
  /** Format numbers with a comma decimal separator (Romanian-locale export). Default false. */
  euroDecimals?: boolean;
}

export const REVOLUT_HEADER = [
  'Date',
  'Ticker',
  'Type',
  'Quantity',
  'Price per share',
  'Total Amount',
  'Currency',
  'FX Rate',
];

const SYMBOL: Record<string, string> = { USD: '$', EUR: '€', GBP: '£', RON: '' };

function formatNumber(n: number, euroDecimals: boolean): string {
  const s = String(n);
  return euroDecimals ? s.replace('.', ',') : s;
}

function formatAmount(n: number, currency: string, euroDecimals: boolean): string {
  const sym = SYMBOL[currency] ?? '';
  const sign = n < 0 ? '-' : '';
  return `${sign}${sym}${formatNumber(Math.abs(n), euroDecimals)}`;
}

/** Build a full synthetic Revolut Account Statement as raw rows (string[][]). */
export function generateRevolutStatement(spec: RevolutStatementSpec): string[][] {
  const euro = spec.euroDecimals === true;
  const includeNoise = spec.includeNoise !== false;
  const fx = euro ? '1' : '1.0665';
  const rows: string[][] = [REVOLUT_HEADER];

  if (includeNoise) {
    rows.push(['2019-11-15T23:15:55.878985Z', '', 'CASH TOP-UP', '', '', formatAmount(5.22, 'USD', euro), 'USD', '1.1055']);
  }

  for (const t of spec.trades ?? []) {
    const currency = t.currency ?? 'USD';
    rows.push([
      t.date,
      t.ticker,
      t.side === 'buy' ? 'BUY - MARKET' : 'SELL - MARKET',
      formatNumber(t.quantity, euro),
      formatAmount(t.pricePerShare, currency, euro),
      formatAmount(t.totalAmount, currency, euro),
      currency,
      fx,
    ]);
  }

  for (const s of spec.splits ?? []) {
    const currency = s.currency ?? 'USD';
    rows.push([
      s.date,
      s.ticker,
      'STOCK SPLIT',
      formatNumber(s.quantity, euro),
      '',
      formatAmount(0, currency, euro),
      currency,
      fx,
    ]);
  }

  for (const d of spec.dividends ?? []) {
    const currency = d.currency ?? 'USD';
    rows.push([d.date, d.ticker, 'DIVIDEND', '', '', formatAmount(d.amount, currency, euro), currency, fx]);
  }

  if (includeNoise) {
    rows.push(['2021-09-01T07:40:54.539038Z', '', 'CUSTODY FEE', '', '', formatAmount(-0.01, 'USD', euro), 'USD', '1.18']);
    rows.push([
      '2023-08-06T09:06:58.899860Z',
      'WBD',
      'TRANSFER FROM REVOLUT TRADING LTD TO REVOLUT SECURITIES EUROPE UAB',
      formatNumber(0.0004562, euro),
      '',
      formatAmount(0, 'USD', euro),
      'USD',
      '1.1018',
    ]);
  }

  return rows;
}
