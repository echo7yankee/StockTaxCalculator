import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { parseRevolutStatement } from '../revolut.js';
import { generateRevolutStatement, type RevolutTradeSpec } from './revolutSynthetic.js';
import { calculateTaxes } from '../../engine/taxCalculator.js';
import { romaniaTaxConfig } from '../../taxRules/romania.js';

describe('parseRevolutStatement', () => {
  it('warns on empty input', () => {
    const r = parseRevolutStatement([]);
    expect(r.transactions).toHaveLength(0);
    expect(r.warnings.length).toBeGreaterThan(0);
  });

  it('warns when the file is not a Revolut Account Statement', () => {
    // Old PDF-era format ("Activity Type" / "Amount") lacks Type + Total Amount.
    const r = parseRevolutStatement([
      ['Trade Date', 'Settle Date', 'Currency', 'Activity Type', 'Symbol', 'Quantity', 'Price', 'Amount'],
      ['30.03.2020', '01.04.2020', 'USD', 'BUY', 'AAPL', '1', '100', '100'],
    ]);
    expect(r.transactions).toHaveLength(0);
    expect(r.warnings.some((w) => w.includes('does not look like a Revolut'))).toBe(true);
  });

  it('parses a buy and a sell with currency and amounts', () => {
    const rows = generateRevolutStatement({
      trades: [
        { ticker: 'AAPL', side: 'buy', quantity: 10, pricePerShare: 100, totalAmount: 1000, date: '2025-02-01T10:00:00.000Z' },
        { ticker: 'AAPL', side: 'sell', quantity: 10, pricePerShare: 150, totalAmount: 1500, date: '2025-09-01T10:00:00.000Z' },
      ],
      includeNoise: false,
    });
    const r = parseRevolutStatement(rows);
    expect(r.transactions).toHaveLength(2);
    const [buy, sell] = r.transactions;
    expect(buy.action).toBe('buy');
    expect(buy.ticker).toBe('AAPL');
    expect(buy.shares).toBe(10);
    expect(buy.pricePerShare).toBe(100);
    expect(buy.totalAmountOriginal).toBe(1000);
    expect(buy.priceCurrency).toBe('USD');
    expect(buy.isin).toBe(''); // Revolut statements carry no ISIN
    expect(sell.action).toBe('sell');
    expect(sell.shares).toBe(10);
    expect(sell.totalAmountOriginal).toBe(1500);
  });

  it('ignores cash top-up, cash withdrawal, custody fee, and internal transfer rows', () => {
    const rows = generateRevolutStatement({
      trades: [{ ticker: 'MSFT', side: 'buy', quantity: 1, pricePerShare: 200, totalAmount: 200, date: '2025-03-01T10:00:00.000Z' }],
      includeNoise: true,
    });
    const r = parseRevolutStatement(rows);
    expect(r.transactions).toHaveLength(1);
    expect(r.transactions[0].ticker).toBe('MSFT');
    // top-up + withdrawal + custody fee + both migration transfers = 5 skipped,
    // none warned (all five known non-taxable shapes from the real sample)
    expect(r.skipped.length).toBe(5);
    expect(r.warnings).toHaveLength(0);
  });

  it('treats a forward stock split as a zero-cost buy that lowers weighted-average cost', () => {
    const rows = generateRevolutStatement({
      trades: [
        { ticker: 'TSLA', side: 'buy', quantity: 1, pricePerShare: 400, totalAmount: 400, date: '2025-01-10T10:00:00.000Z' },
        { ticker: 'TSLA', side: 'sell', quantity: 4, pricePerShare: 120, totalAmount: 480, date: '2025-11-10T10:00:00.000Z' },
      ],
      splits: [{ ticker: 'TSLA', quantity: 3, date: '2025-06-01T10:00:00.000Z' }],
      includeNoise: false,
    });
    const r = parseRevolutStatement(rows);
    // split is emitted as a zero-cost buy
    const splitTx = r.transactions.find((t) => t.totalAmountOriginal === 0 && t.action === 'buy');
    expect(splitTx).toBeDefined();
    expect(splitTx!.shares).toBe(3);

    const { taxResult } = calculateTaxes(r.transactions, romaniaTaxConfig, 2025);
    // 1 share @ 400, +3 split shares @ 0 => 4 shares avg cost 100; sell 4 @ 120 = 480
    // gain = 480 - 400 = 80
    expect(taxResult.capitalGains.netGains).toBeCloseTo(80);
  });

  it('warns on a reverse split (negative quantity) instead of guessing', () => {
    const rows = generateRevolutStatement({
      splits: [{ ticker: 'XYZ', quantity: -5, date: '2025-06-01T10:00:00.000Z' }],
      includeNoise: false,
    });
    const r = parseRevolutStatement(rows);
    expect(r.transactions).toHaveLength(0);
    expect(r.warnings.some((w) => w.toLowerCase().includes('split'))).toBe(true);
  });

  it('parses dividends with no withholding (current format has no WHT line)', () => {
    const rows = generateRevolutStatement({
      dividends: [{ ticker: 'MSFT', amount: 2.4, date: '2025-06-12T08:00:00.000Z' }],
      includeNoise: false,
    });
    const r = parseRevolutStatement(rows);
    const div = r.transactions.find((t) => t.action === 'dividend');
    expect(div).toBeDefined();
    expect(div!.totalAmountOriginal).toBeCloseTo(2.4);
    expect(div!.ticker).toBe('MSFT');
    expect(div!.withholdingTaxOriginal).toBe(0);
  });

  it('skips unsupported currencies with a warning', () => {
    const rows = generateRevolutStatement({
      trades: [{ ticker: 'NESN', side: 'buy', quantity: 5, pricePerShare: 100, totalAmount: 500, date: '2025-03-01T10:00:00.000Z', currency: 'CHF' }],
      includeNoise: false,
    });
    const r = parseRevolutStatement(rows);
    expect(r.transactions).toHaveLength(0);
    expect(r.warnings.some((w) => w.includes('Unsupported currencies'))).toBe(true);
  });

  it('warns on an unrecognised transaction type', () => {
    const rows = [
      ['Date', 'Ticker', 'Type', 'Quantity', 'Price per share', 'Total Amount', 'Currency', 'FX Rate'],
      ['2025-04-01T10:00:00.000Z', 'AAPL', 'SOME NEW THING', '1', '$10', '$10', 'USD', '1'],
    ];
    const r = parseRevolutStatement(rows);
    expect(r.transactions).toHaveLength(0);
    expect(r.warnings.some((w) => w.includes('Unrecognised transaction types'))).toBe(true);
  });

  // SUGGESTIONS S14: the ignore set is anchored to the exact known non-taxable
  // types. A never-seen income-bearing type that merely CONTAINS an ignore word
  // ("MERGER - CASH", "CASH DISBURSEMENT") must warn fatally, not vanish.
  describe('S14: never-seen types containing ignore words warn instead of vanishing', () => {
    const HEADER = ['Date', 'Ticker', 'Type', 'Quantity', 'Price per share', 'Total Amount', 'Currency', 'FX Rate'];

    it.each(['MERGER - CASH', 'CASH DISBURSEMENT', 'STOCK GIFT FEE'])(
      'classifies "%s" as unrecognised and pushes the fatal warning',
      (type) => {
        const r = parseRevolutStatement([
          HEADER,
          ['2025-04-01T10:00:00.000Z', 'AAPL', type, '', '', '$120', 'USD', '1'],
        ]);
        expect(r.transactions).toHaveLength(0);
        expect(r.warnings.some((w) => w.includes(`Unrecognised transaction types found (${type})`))).toBe(true);
        expect(r.structuredWarnings.some((w) => w.code === 'revolut_unrecognised_types_skipped')).toBe(true);
      }
    );

    it('warns on a transfer that is not an internal Revolut entity migration', () => {
      // An in-kind transfer from an external broker carries cost-basis
      // information we cannot model; it must not be silently dropped.
      const r = parseRevolutStatement([
        HEADER,
        ['2025-04-01T10:00:00.000Z', 'AAPL', 'TRANSFER FROM DEGIRO TO REVOLUT SECURITIES EUROPE UAB', '3', '', '$0', 'USD', '1'],
      ]);
      expect(r.transactions).toHaveLength(0);
      expect(r.warnings.some((w) => w.includes('Unrecognised transaction types'))).toBe(true);
    });

    it('still silently skips all five known non-taxable shapes from the real sample', () => {
      const r = parseRevolutStatement([
        HEADER,
        ['2025-02-01T10:00:00.000Z', 'AAPL', 'BUY - MARKET', '1', '$10', '$10', 'USD', '1'],
        ['2019-11-15T23:15:55.878985Z', '', 'CASH TOP-UP', '', '', '$5.22', 'USD', '1.1055'],
        ['2019-12-02T08:23:08.459586Z', '', 'CASH WITHDRAWAL', '', '', '-$30.93', 'USD', '1.1019'],
        ['2021-09-01T07:40:54.539038Z', '', 'CUSTODY FEE', '', '', '-$0.01', 'USD', '1.18'],
        ['2023-08-06T09:06:58.899860Z', 'WBD', 'TRANSFER FROM REVOLUT TRADING LTD TO REVOLUT SECURITIES EUROPE UAB', '0.0004562', '', '$0', 'USD', '1.1018'],
        ['2023-09-09T07:59:34.452648Z', '', 'TRANSFER FROM REVOLUT BANK UAB TO REVOLUT SECURITIES EUROPE UAB', '', '', '-$0.01', 'USD', '0.0902'],
      ]);
      expect(r.transactions).toHaveLength(1);
      expect(r.skipped).toHaveLength(5);
      expect(r.warnings).toHaveLength(0);
      expect(r.structuredWarnings).toHaveLength(0);
    });
  });

  it('parses a Romanian-locale export (comma decimals, inline euro symbol)', () => {
    const rows = generateRevolutStatement({
      trades: [{ ticker: 'ASML', side: 'buy', quantity: 0.76672417, pricePerShare: 26.09, totalAmount: 20, date: '2025-09-08T07:29:03.333Z', currency: 'EUR' }],
      euroDecimals: true,
      includeNoise: false,
    });
    // sanity: the generated quantity cell really is comma-formatted
    expect(rows[1][3]).toBe('0,76672417');
    expect(rows[1][5]).toBe('€20');
    const r = parseRevolutStatement(rows);
    expect(r.transactions).toHaveLength(1);
    const t = r.transactions[0];
    expect(t.shares).toBeCloseTo(0.76672417);
    expect(t.pricePerShare).toBeCloseTo(26.09);
    expect(t.totalAmountOriginal).toBe(20);
    expect(t.priceCurrency).toBe('EUR');
  });

  it('falls back to the inline currency symbol when the Currency column is blank', () => {
    const rows = [
      ['Date', 'Ticker', 'Type', 'Quantity', 'Price per share', 'Total Amount', 'Currency', 'FX Rate'],
      ['2025-04-01T10:00:00.000Z', 'SAP', 'BUY - MARKET', '2', '€100', '€200', '', '1'],
    ];
    const r = parseRevolutStatement(rows);
    expect(r.transactions).toHaveLength(1);
    expect(r.transactions[0].priceCurrency).toBe('EUR');
  });

  it('tags each transaction with its own currency in a mixed USD/EUR statement', () => {
    const rows = generateRevolutStatement({
      trades: [
        { ticker: 'AAPL', side: 'buy', quantity: 1, pricePerShare: 100, totalAmount: 100, date: '2025-02-01T10:00:00.000Z', currency: 'USD' },
        { ticker: 'ASML', side: 'buy', quantity: 1, pricePerShare: 600, totalAmount: 600, date: '2025-02-02T10:00:00.000Z', currency: 'EUR' },
      ],
      includeNoise: false,
    });
    const r = parseRevolutStatement(rows);
    const byTicker = Object.fromEntries(r.transactions.map((t) => [t.ticker, t.priceCurrency]));
    expect(byTicker['AAPL']).toBe('USD');
    expect(byTicker['ASML']).toBe('EUR');
  });

  it('parses a real-format statement shape (microsecond dates, inline symbols, noise, euro row)', () => {
    // Hand-built to mirror the live Revolut Account Statement formatting quirks
    // (not a real portfolio): variable sub-second ISO dates, inline $/€ symbols,
    // negative fee, $0 transfer, the long entity-migration transfer label, and a
    // comma-decimal quantity. Values are generic.
    const rows = [
      ['Date', 'Ticker', 'Type', 'Quantity', 'Price per share', 'Total Amount', 'Currency', 'FX Rate'],
      ['2019-11-15T23:15:55.878985Z', '', 'CASH TOP-UP', '', '', '$5.22', 'USD', '1.1055'],
      ['2019-12-02T08:23:08.459586Z', '', 'CASH WITHDRAWAL', '', '', '-$30.93', 'USD', '1.1019'],
      ['2023-09-22T13:30:10.514Z', 'O', 'BUY - MARKET', '1.63453043', '$52.07', '$85.11', 'USD', '1.0665'],
      ['2023-07-14T13:30:00.797Z', 'MA', 'SELL - MARKET', '0.1998348', '$402.13', '$80.34', 'USD', '1.1241'],
      ['2019-12-13T08:40:00.835101Z', 'MSFT', 'DIVIDEND', '', '', '$0.08', 'USD', '1.1179'],
      ['2021-09-01T07:40:54.539038Z', '', 'CUSTODY FEE', '', '', '-$0.01', 'USD', '1.18'],
      ['2022-08-25T08:27:46.419568Z', 'TSLA', 'STOCK SPLIT', '0.16431924', '', '$0', 'USD', '0.0947'],
      ['2023-08-06T09:06:58.899860Z', 'WBD', 'TRANSFER FROM REVOLUT TRADING LTD TO REVOLUT SECURITIES EUROPE UAB', '0.0004562', '', '$0', 'USD', '1.1018'],
      ['2023-09-09T07:59:34.452648Z', '', 'TRANSFER FROM REVOLUT BANK UAB TO REVOLUT SECURITIES EUROPE UAB', '', '', '-$0.01', 'USD', '0.0902'],
      ['2025-09-08T07:29:03.333Z', 'MSFT', 'BUY - MARKET', '0,76672417', '€26.09', '€20', 'EUR', '1'],
    ];
    const r = parseRevolutStatement(rows);
    // top-up + withdrawal + custody fee + both transfers = 5 ignored, no warnings
    expect(r.skipped.length).toBe(5);
    expect(r.warnings).toHaveLength(0);
    const buys = r.transactions.filter((t) => t.action === 'buy');
    const sells = r.transactions.filter((t) => t.action === 'sell');
    const divs = r.transactions.filter((t) => t.action === 'dividend');
    expect(buys.length).toBe(3); // O buy, TSLA split-as-buy, MSFT euro buy
    expect(sells.length).toBe(1);
    expect(divs.length).toBe(1);
    const euroBuy = r.transactions.find((t) => t.priceCurrency === 'EUR');
    expect(euroBuy!.shares).toBeCloseTo(0.76672417);
    const split = r.transactions.find((t) => t.action === 'buy' && t.totalAmountOriginal === 0 && t.ticker === 'TSLA');
    expect(split!.shares).toBeCloseTo(0.16431924);
  });

  it('flows through calculateTaxes to a correct capital gain', () => {
    const rows = generateRevolutStatement({
      trades: [
        { ticker: 'AAPL', side: 'buy', quantity: 10, pricePerShare: 100, totalAmount: 1000, date: '2025-02-01T10:00:00.000Z' },
        { ticker: 'AAPL', side: 'sell', quantity: 10, pricePerShare: 150, totalAmount: 1500, date: '2025-09-01T10:00:00.000Z' },
      ],
      dividends: [{ ticker: 'AAPL', amount: 5, date: '2025-06-12T08:00:00.000Z' }],
      includeNoise: true,
    });
    const { transactions } = parseRevolutStatement(rows);
    // exchangeRateToLocal is 1 here (BNR enrichment is a later pipeline step).
    const { taxResult } = calculateTaxes(transactions, romaniaTaxConfig, 2025);
    expect(taxResult.capitalGains.netGains).toBeCloseTo(500); // 1500 - 1000
    expect(taxResult.capitalGains.taxOwed).toBeCloseTo(500 * romaniaTaxConfig.capitalGainsTaxRate);
    expect(taxResult.dividends.grossTotal).toBeCloseTo(5);
    expect(taxResult.dividends.withholdingTaxPaid).toBeCloseTo(0); // no WHT in Revolut format
    // full 10% with no credit (the safe over-stating direction)
    expect(taxResult.dividends.taxOwed).toBeCloseTo(5 * romaniaTaxConfig.dividendTaxRate);
  });
});

describe('parseRevolutStatement (edge cases)', () => {
  const HEADER = ['Date', 'Ticker', 'Type', 'Quantity', 'Price per share', 'Total Amount', 'Currency', 'FX Rate'];

  it('skips empty and all-blank padding rows that an xlsx export carries', () => {
    const r = parseRevolutStatement([
      HEADER,
      [],
      ['', '', '', '', '', '', '', ''],
      ['2025-02-01T10:00:00.000Z', 'AAPL', 'BUY - MARKET', '1', '$10', '$10', 'USD', '1'],
    ]);
    expect(r.transactions).toHaveLength(1);
    expect(r.warnings).toHaveLength(0);
  });

  it('skips a trade row with an invalid date', () => {
    const r = parseRevolutStatement([
      HEADER,
      ['not-a-date', 'AAPL', 'BUY - MARKET', '1', '$10', '$10', 'USD', '1'],
    ]);
    expect(r.transactions).toHaveLength(0);
    expect(r.skipped.some((s) => s.reason.includes('Invalid date'))).toBe(true);
  });

  it('skips a trade row with zero quantity', () => {
    const r = parseRevolutStatement([
      HEADER,
      ['2025-02-01T10:00:00.000Z', 'AAPL', 'BUY - MARKET', '0', '$10', '$0', 'USD', '1'],
    ]);
    expect(r.transactions).toHaveLength(0);
    expect(r.skipped.some((s) => s.reason.includes('Zero quantity'))).toBe(true);
  });

  it('skips a zero-amount dividend', () => {
    const r = parseRevolutStatement([
      HEADER,
      ['2025-06-12T08:00:00.000Z', 'MSFT', 'DIVIDEND', '', '', '$0', 'USD', '1'],
    ]);
    expect(r.transactions).toHaveLength(0);
    expect(r.skipped.some((s) => s.reason.includes('Zero-amount dividend'))).toBe(true);
  });

  it('skips a row when the currency cannot be determined (blank column, no symbol)', () => {
    const r = parseRevolutStatement([
      HEADER,
      ['2025-02-01T10:00:00.000Z', 'AAPL', 'BUY - MARKET', '1', '100', '200', '', '1'],
    ]);
    expect(r.transactions).toHaveLength(0);
    expect(r.skipped.some((s) => s.reason.includes('Could not determine the currency'))).toBe(true);
  });

  it('parses thousands separators in both US and European number formats', () => {
    const r = parseRevolutStatement([
      HEADER,
      ['2025-02-01T10:00:00.000Z', 'AAPL', 'BUY - MARKET', '1', '$1,234.56', '$1,234.56', 'USD', '1'],
      ['2025-02-02T10:00:00.000Z', 'ASML', 'BUY - MARKET', '1', '€1.234,56', '€1.234,56', 'EUR', '1'],
    ]);
    expect(r.transactions).toHaveLength(2);
    expect(r.transactions[0].totalAmountOriginal).toBeCloseTo(1234.56); // US: comma thousands, dot decimal
    expect(r.transactions[1].totalAmountOriginal).toBeCloseTo(1234.56); // EU: dot thousands, comma decimal
  });

  it('falls back to the price-column symbol when the amount has none and the currency column is blank', () => {
    const r = parseRevolutStatement([
      HEADER,
      ['2025-02-01T10:00:00.000Z', 'AAPL', 'BUY - MARKET', '1', '$100', '200', '', '1'],
    ]);
    expect(r.transactions).toHaveLength(1);
    expect(r.transactions[0].priceCurrency).toBe('USD');
  });
});

describe('parseRevolutStatement (property-based)', () => {
  const tradeArb = fc.record({
    ticker: fc.constantFrom('AAPL', 'MSFT', 'TSLA', 'KO', 'ASML'),
    side: fc.constantFrom<'buy' | 'sell'>('buy', 'sell'),
    quantity: fc.integer({ min: 1, max: 100 }),
    pricePerShare: fc.integer({ min: 1, max: 1000 }),
    currency: fc.constantFrom('USD', 'EUR', 'GBP'),
  });

  it('returns exactly one transaction per trade row and never silently drops to zero', () => {
    fc.assert(
      fc.property(fc.array(tradeArb, { minLength: 1, maxLength: 30 }), (trades) => {
        const specs: RevolutTradeSpec[] = trades.map((t, i) => ({
          ...t,
          totalAmount: t.quantity * t.pricePerShare,
          date: `2025-03-${String((i % 27) + 1).padStart(2, '0')}T10:00:00.000Z`,
        }));
        const rows = generateRevolutStatement({ trades: specs, includeNoise: false });
        const r = parseRevolutStatement(rows);
        const tradeTx = r.transactions.filter((t) => t.action === 'buy' || t.action === 'sell');
        expect(tradeTx).toHaveLength(specs.length);
        for (const t of tradeTx) {
          expect(t.shares).toBeGreaterThan(0);
          expect(['USD', 'EUR', 'GBP', 'RON']).toContain(t.priceCurrency);
        }
      })
    );
  });

  it('never throws and yields finite, non-negative amounts under arbitrary numeric inputs', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            ticker: fc.constantFrom('AAPL', 'MSFT'),
            side: fc.constantFrom<'buy' | 'sell'>('buy', 'sell'),
            quantity: fc.double({ min: 0.0001, max: 10000, noNaN: true }),
            pricePerShare: fc.double({ min: 0.01, max: 100000, noNaN: true }),
            currency: fc.constantFrom('USD', 'EUR'),
          }),
          { minLength: 1, maxLength: 20 }
        ),
        fc.boolean(),
        (trades, euro) => {
          const specs: RevolutTradeSpec[] = trades.map((t, i) => ({
            ...t,
            totalAmount: t.quantity * t.pricePerShare,
            date: `2025-05-${String((i % 27) + 1).padStart(2, '0')}T10:00:00.000Z`,
          }));
          const rows = generateRevolutStatement({ trades: specs, euroDecimals: euro, includeNoise: false });
          const r = parseRevolutStatement(rows);
          for (const t of r.transactions) {
            expect(Number.isFinite(t.totalAmountOriginal)).toBe(true);
            expect(t.totalAmountOriginal).toBeGreaterThanOrEqual(0);
            expect(t.shares).toBeGreaterThanOrEqual(0);
          }
        }
      )
    );
  });
});
