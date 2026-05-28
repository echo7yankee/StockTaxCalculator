import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { parseIbkrCsv } from '../ibkr.js';
import { generateIbkrStatement, type IbkrTradeSpec } from './ibkrSynthetic.js';
import { calculateTaxes } from '../../engine/taxCalculator.js';
import { romaniaTaxConfig } from '../../taxRules/romania.js';

describe('parseIbkrCsv', () => {
  it('warns on empty input', () => {
    const r = parseIbkrCsv([]);
    expect(r.transactions).toHaveLength(0);
    expect(r.warnings.length).toBeGreaterThan(0);
  });

  it('warns when the file has no recognised IBKR sections', () => {
    // A Trading212-style flat header is not an IBKR statement.
    const r = parseIbkrCsv([
      ['Action', 'Time', 'ISIN'],
      ['Market buy', '2025-01-01', 'US0378331005'],
    ]);
    expect(r.transactions).toHaveLength(0);
    expect(r.warnings.some((w) => w.includes('does not look like an IBKR'))).toBe(true);
  });

  it('parses a buy and a sell, folding commission into cost basis and net proceeds', () => {
    const rows = generateIbkrStatement({
      trades: [
        { symbol: 'AAPL', quantity: 10, price: 100, dateTime: '2025-02-01, 10:00:00', commission: 1 },
        { symbol: 'AAPL', quantity: -10, price: 150, dateTime: '2025-09-01, 10:00:00', commission: 1 },
      ],
      instruments: [{ symbol: 'AAPL', isin: 'US0378331005', name: 'APPLE INC' }],
    });
    const r = parseIbkrCsv(rows);
    expect(r.transactions).toHaveLength(2);
    const [buy, sell] = r.transactions;
    expect(buy.action).toBe('buy');
    expect(buy.shares).toBe(10);
    expect(buy.totalAmountOriginal).toBe(1001); // 1000 gross + 1 commission
    expect(buy.priceCurrency).toBe('USD');
    expect(buy.isin).toBe('US0378331005'); // enriched from Financial Instrument Information
    expect(buy.securityName).toBe('APPLE INC');
    expect(sell.action).toBe('sell');
    expect(sell.shares).toBe(10);
    expect(sell.totalAmountOriginal).toBe(1499); // 1500 gross - 1 commission
  });

  it('determines buy vs sell from the quantity sign', () => {
    const rows = generateIbkrStatement({
      trades: [
        { symbol: 'KO', quantity: 4, price: 50, dateTime: '2025-03-01' },
        { symbol: 'KO', quantity: -2, price: 60, dateTime: '2025-04-01' },
      ],
      includeSubtotals: false,
    });
    const r = parseIbkrCsv(rows);
    expect(r.transactions.map((t) => t.action)).toEqual(['buy', 'sell']);
  });

  it('ignores SubTotal and Total rows', () => {
    const rows = generateIbkrStatement({
      trades: [{ symbol: 'MSFT', quantity: 5, price: 200, dateTime: '2025-03-01' }],
      includeSubtotals: true,
    });
    const r = parseIbkrCsv(rows);
    expect(r.transactions).toHaveLength(1); // the Order row only
  });

  it('skips non-stock asset categories with a warning', () => {
    const rows = generateIbkrStatement({
      trades: [
        { symbol: 'AAPL', quantity: 5, price: 100, dateTime: '2025-03-01' },
        { symbol: 'SPX', quantity: 1, price: 10, dateTime: '2025-03-02', assetCategory: 'Equity and Index Options' },
      ],
      includeSubtotals: false,
    });
    const r = parseIbkrCsv(rows);
    expect(r.transactions).toHaveLength(1);
    expect(r.transactions[0].ticker).toBe('AAPL');
    expect(r.warnings.some((w) => w.includes('non-stock'))).toBe(true);
    expect(r.skipped.length).toBeGreaterThan(0);
  });

  it('skips unsupported currencies with a warning', () => {
    const rows = generateIbkrStatement({
      trades: [{ symbol: 'NESN', quantity: 5, price: 100, dateTime: '2025-03-01', currency: 'CHF' }],
      includeSubtotals: false,
    });
    const r = parseIbkrCsv(rows);
    expect(r.transactions).toHaveLength(0);
    expect(r.warnings.some((w) => w.includes('Unsupported currencies'))).toBe(true);
  });

  it('parses dividends and attaches matching withholding tax', () => {
    const rows = generateIbkrStatement({
      dividends: [{ symbol: 'AAPL', isin: 'US0378331005', date: '2025-06-12', amount: 2.4, withholding: 0.36 }],
    });
    const r = parseIbkrCsv(rows);
    const div = r.transactions.find((t) => t.action === 'dividend');
    expect(div).toBeDefined();
    expect(div!.totalAmountOriginal).toBeCloseTo(2.4);
    expect(div!.ticker).toBe('AAPL');
    expect(div!.isin).toBe('US0378331005'); // parsed from the SYMBOL(ISIN) description
    expect(div!.withholdingTaxOriginal).toBeCloseTo(0.36);
  });

  it('warns when withholding tax has no matching dividend', () => {
    const rows = [
      ['Withholding Tax', 'Header', 'Currency', 'Date', 'Description', 'Amount', 'Code'],
      ['Withholding Tax', 'Data', 'USD', '2025-06-12', 'TSLA(US88160R1014) Cash Dividend - US Tax', '-0.50', ''],
    ];
    const r = parseIbkrCsv(rows);
    expect(r.warnings.some((w) => w.includes('no matching dividend'))).toBe(true);
  });

  it('reads ISIN from an explicit ISIN column and tolerates a minimal Trades header', () => {
    const rows = [
      ['Trades', 'Header', 'DataDiscriminator', 'Asset Category', 'Currency', 'Symbol', 'Date/Time', 'Quantity', 'T. Price', 'Proceeds', 'Comm/Fee'],
      ['Trades', 'Data', 'Order', 'Stocks', 'USD', 'VWRL', '2025-03-01, 09:00:00', '3', '100', '-300', '0'],
      ['Financial Instrument Information', 'Header', 'Asset Category', 'Symbol', 'Description', 'Conid', 'ISIN', 'Code'],
      ['Financial Instrument Information', 'Data', 'Stocks', 'VWRL', 'VANGUARD FTSE ALL-WORLD', '99', 'IE00B3RBWM25', ''],
    ];
    const r = parseIbkrCsv(rows);
    expect(r.transactions).toHaveLength(1);
    expect(r.transactions[0].isin).toBe('IE00B3RBWM25');
    expect(r.transactions[0].totalAmountOriginal).toBe(300);
  });

  it('parses compact YYYYMMDD dates', () => {
    const rows = [
      ['Trades', 'Header', 'DataDiscriminator', 'Asset Category', 'Currency', 'Symbol', 'Date/Time', 'Quantity', 'T. Price', 'Proceeds', 'Comm/Fee'],
      ['Trades', 'Data', 'Order', 'Stocks', 'USD', 'AAPL', '20250314', '2', '100', '-200', '0'],
    ];
    const r = parseIbkrCsv(rows);
    expect(r.transactions).toHaveLength(1);
    expect(r.transactions[0].transactionDate.getFullYear()).toBe(2025);
    expect(r.transactions[0].transactionDate.getMonth()).toBe(2); // March (0-indexed)
  });

  it('enriches ISIN even though the instrument section appears after Trades', () => {
    const rows = generateIbkrStatement({
      trades: [{ symbol: 'AAPL', quantity: 1, price: 100, dateTime: '2025-03-01' }],
      instruments: [{ symbol: 'AAPL', isin: 'US0378331005', name: 'APPLE INC' }],
      includeSubtotals: false,
    });
    // Sanity: in the generated rows, Trades really does come before the instrument section.
    const tradesIdx = rows.findIndex((row) => row[0] === 'Trades' && row[1] === 'Header');
    const fiiIdx = rows.findIndex((row) => row[0] === 'Financial Instrument Information' && row[1] === 'Header');
    expect(tradesIdx).toBeLessThan(fiiIdx);
    const r = parseIbkrCsv(rows);
    expect(r.transactions[0].isin).toBe('US0378331005');
  });

  it('flows through calculateTaxes to a correct capital gain and dividend credit', () => {
    const rows = generateIbkrStatement({
      trades: [
        { symbol: 'AAPL', quantity: 10, price: 100, dateTime: '2025-02-01, 10:00:00', commission: 1 },
        { symbol: 'AAPL', quantity: -10, price: 150, dateTime: '2025-09-01, 10:00:00', commission: 1 },
      ],
      dividends: [{ symbol: 'AAPL', isin: 'US0378331005', date: '2025-06-12', amount: 5, withholding: 0.5 }],
      instruments: [{ symbol: 'AAPL', isin: 'US0378331005', name: 'APPLE INC' }],
    });
    const { transactions } = parseIbkrCsv(rows);
    // exchangeRateToLocal is 1 here (BNR enrichment is a later pipeline step),
    // so RON-equivalent figures equal the USD figures for this assertion.
    const { taxResult } = calculateTaxes(transactions, romaniaTaxConfig, 2025);
    expect(taxResult.capitalGains.netGains).toBeCloseTo(498); // 1499 proceeds - 1001 cost
    expect(taxResult.capitalGains.taxOwed).toBeCloseTo(498 * romaniaTaxConfig.capitalGainsTaxRate);
    expect(taxResult.dividends.grossTotal).toBeCloseTo(5);
    expect(taxResult.dividends.withholdingTaxPaid).toBeCloseTo(0.5);
    expect(taxResult.dividends.taxOwed).toBeCloseTo(0); // max(0, 5*0.10 - 0.5) = 0
  });
});

describe('parseIbkrCsv (property-based)', () => {
  const tradeArb = fc.record({
    symbol: fc.constantFrom('AAPL', 'MSFT', 'VWRL', 'TSLA', 'KO'),
    quantity: fc.integer({ min: -100, max: 100 }).filter((q) => q !== 0),
    price: fc.integer({ min: 1, max: 1000 }),
    commission: fc.constantFrom(0, 1, 2),
  });

  it('returns exactly one transaction per stock trade row and never silently drops to zero', () => {
    fc.assert(
      fc.property(fc.array(tradeArb, { minLength: 1, maxLength: 30 }), (trades) => {
        const specs: IbkrTradeSpec[] = trades.map((t) => ({ ...t, dateTime: '2025-03-14, 10:00:00', currency: 'USD' }));
        const rows = generateIbkrStatement({ trades: specs });
        const r = parseIbkrCsv(rows);
        const tradeTx = r.transactions.filter((t) => t.action === 'buy' || t.action === 'sell');
        expect(tradeTx).toHaveLength(specs.length);
        for (const t of tradeTx) {
          expect(t.shares).toBeGreaterThan(0);
          expect(['USD', 'EUR', 'GBP', 'RON']).toContain(t.priceCurrency);
        }
      })
    );
  });

  const divArb = fc.record({
    symbol: fc.constantFrom('AAPL', 'MSFT', 'KO'),
    isin: fc.constantFrom('US0378331005', 'US5949181045', 'US1912161007'),
    amount: fc.integer({ min: 1, max: 500 }),
    withholding: fc.integer({ min: 0, max: 50 }),
  });

  it('preserves total gross dividends and total withholding tax', () => {
    fc.assert(
      fc.property(fc.array(divArb, { minLength: 1, maxLength: 20 }), (divs) => {
        const specs = divs.map((d) => ({ ...d, date: '2025-06-12', currency: 'USD' }));
        const rows = generateIbkrStatement({ dividends: specs });
        const r = parseIbkrCsv(rows);
        const parsedDivs = r.transactions.filter((t) => t.action === 'dividend');
        expect(parsedDivs).toHaveLength(specs.length);
        const grossIn = specs.reduce((s, d) => s + d.amount, 0);
        const grossOut = parsedDivs.reduce((s, d) => s + d.totalAmountOriginal, 0);
        expect(grossOut).toBeCloseTo(grossIn);
        const whIn = specs.reduce((s, d) => s + d.withholding, 0);
        const whOut = parsedDivs.reduce((s, d) => s + d.withholdingTaxOriginal, 0);
        expect(whOut).toBeCloseTo(whIn);
      })
    );
  });
});
