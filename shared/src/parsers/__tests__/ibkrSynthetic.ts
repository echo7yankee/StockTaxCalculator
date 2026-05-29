/**
 * Synthetic IBKR Activity Statement CSV generator.
 *
 * We have no real IBKR export to test against (Dragos only holds Trading212 and
 * will not open other broker accounts), so this generator IS the executable
 * spec for the format `parseIbkrCsv` is built to. It emits the multi-section
 * `string[][]` shape that `Papa.parse(file, { header: false })` would produce,
 * including the SubTotal/Total noise rows a real statement carries, so tests
 * can assert the parser ignores them. Reused by the future CI sweep (#24H).
 *
 * Sign conventions match IBKR: Proceeds = -(quantity * price) (negative on a
 * buy, positive on a sell); Comm/Fee is emitted negative; Quantity is signed
 * (positive buy, negative sell); withholding Amount is negative.
 */

export interface IbkrTradeSpec {
  symbol: string;
  /** Signed: positive = buy, negative = sell. */
  quantity: number;
  price: number;
  /** 'YYYY-MM-DD' or 'YYYY-MM-DD, HH:MM:SS'. */
  dateTime: string;
  currency?: string;
  /** Magnitude of the commission; emitted as a negative Comm/Fee. Default 0. */
  commission?: number;
  /** Default 'Stocks'. Set to 'Equity and Index Options', 'Forex', etc. to test skipping. */
  assetCategory?: string;
}

export interface IbkrDividendSpec {
  symbol: string;
  isin: string;
  date: string;
  /** Gross dividend amount (positive). */
  amount: number;
  currency?: string;
  /** Magnitude of tax withheld; emitted in a Withholding Tax row as negative. */
  withholding?: number;
}

export interface IbkrInstrumentSpec {
  symbol: string;
  isin: string;
  name: string;
}

export interface IbkrStatementSpec {
  trades?: IbkrTradeSpec[];
  dividends?: IbkrDividendSpec[];
  /** Financial Instrument Information rows (Symbol -> ISIN + name). */
  instruments?: IbkrInstrumentSpec[];
  /** Emit SubTotal/Total noise rows the parser must ignore. Default true. */
  includeSubtotals?: boolean;
}

const TRADES_HEADER = [
  'Trades', 'Header', 'DataDiscriminator', 'Asset Category', 'Currency', 'Symbol',
  'Date/Time', 'Quantity', 'T. Price', 'C. Price', 'Proceeds', 'Comm/Fee',
  'Basis', 'Realized P/L', 'MTM P/L', 'Code',
];

const round2 = (n: number): number => Math.round(n * 100) / 100;

function tradeRow(t: IbkrTradeSpec): string[] {
  const currency = t.currency ?? 'USD';
  const category = t.assetCategory ?? 'Stocks';
  const commission = t.commission ?? 0;
  const proceeds = round2(-(t.quantity * t.price));
  const basis = round2(Math.abs(t.quantity * t.price) + commission);
  return [
    'Trades', 'Data', 'Order', category, currency, t.symbol,
    t.dateTime, String(t.quantity), String(t.price), String(t.price),
    String(proceeds), String(-commission), String(basis), '0', '0', t.quantity > 0 ? 'O' : 'C',
  ];
}

/** Build a full synthetic IBKR Activity Statement as raw rows (string[][]). */
export function generateIbkrStatement(spec: IbkrStatementSpec): string[][] {
  const includeSubtotals = spec.includeSubtotals !== false;
  const rows: string[][] = [];

  // A couple of leading metadata sections a real statement always carries, to
  // prove the parser ignores everything outside the sections it routes.
  rows.push(['Statement', 'Header', 'Field Name', 'Field Value']);
  rows.push(['Statement', 'Data', 'BrokerName', 'Interactive Brokers']);
  rows.push(['Account Information', 'Header', 'Field Name', 'Field Value']);
  rows.push(['Account Information', 'Data', 'Account', 'U1234567']);

  const trades = spec.trades ?? [];
  if (trades.length > 0) {
    rows.push(TRADES_HEADER);
    for (const t of trades) rows.push(tradeRow(t));
    if (includeSubtotals) {
      // Real IBKR puts the SubTotal/Total marker in column 1 (not as a Data-row
      // discriminator), so the parser skips them at the row-type gate.
      rows.push(['Trades', 'SubTotal', '', 'Stocks', 'USD', '', '', '', '', '', '', '', '', '', '', '']);
      rows.push(['Trades', 'Total', '', '', '', '', '', '', '', '', '', '', '', '', '', '']);
    }
  }

  const instruments = spec.instruments ?? [];
  if (instruments.length > 0) {
    rows.push(['Financial Instrument Information', 'Header', 'Asset Category', 'Symbol', 'Description', 'Conid', 'Security ID', 'Listing Exch', 'Multiplier', 'Code']);
    for (const inst of instruments) {
      rows.push(['Financial Instrument Information', 'Data', 'Stocks', inst.symbol, inst.name, '0', inst.isin, 'NASDAQ', '1', '']);
    }
  }

  const dividends = spec.dividends ?? [];
  const withDividends = dividends.filter((d) => d.amount !== 0);
  if (withDividends.length > 0) {
    rows.push(['Dividends', 'Header', 'Currency', 'Date', 'Description', 'Amount']);
    for (const d of withDividends) {
      const currency = d.currency ?? 'USD';
      rows.push(['Dividends', 'Data', currency, d.date, `${d.symbol} (${d.isin}) Cash Dividend ${currency} per Share (Ordinary Dividend)`, String(d.amount)]);
    }
    if (includeSubtotals) {
      rows.push(['Dividends', 'Data', 'Total', '', '', String(round2(withDividends.reduce((s, d) => s + d.amount, 0)))]);
    }
  }

  const withholdings = dividends.filter((d) => (d.withholding ?? 0) > 0);
  if (withholdings.length > 0) {
    rows.push(['Withholding Tax', 'Header', 'Currency', 'Date', 'Description', 'Amount', 'Code']);
    for (const d of withholdings) {
      const currency = d.currency ?? 'USD';
      rows.push(['Withholding Tax', 'Data', currency, d.date, `${d.symbol} (${d.isin}) Cash Dividend ${currency} per Share - ${currency} Tax`, String(-(d.withholding ?? 0)), '']);
    }
    if (includeSubtotals) {
      rows.push(['Withholding Tax', 'Data', 'Total', '', '', String(round2(-withholdings.reduce((s, d) => s + (d.withholding ?? 0), 0))), '']);
    }
  }

  return rows;
}
