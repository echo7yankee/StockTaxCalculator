import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { calculateTaxesFromPdf } from '../pdfTaxCalculator.js';
import { romaniaTaxConfig } from '../../taxRules/romania.js';
import type {
  PdfParseResult,
  PdfSellTrade,
  PdfDividend,
  PdfOverview,
} from '../../parsers/trading212Pdf.js';

const CURRENCIES = ['USD', 'EUR', 'GBP', 'RON'] as const;

// Fixed seed so CI failures reproduce locally. Bump if a property genuinely
// needs more coverage; do not change to mask a flake.
const ASSERT_OPTS = { numRuns: 100, seed: 4242 };

const sellTradeArb: fc.Arbitrary<PdfSellTrade> = fc.record({
  executionTime: fc.constant('15.03.2025 10:30'),
  instrument: fc.string({ minLength: 1, maxLength: 20 }),
  isin: fc.constantFrom('US0378331005', 'IE00B4L5Y983', 'DE000BASF111'),
  instrumentType: fc.constantFrom('Stock', 'ETF', 'Fund'),
  instrumentCurrency: fc.constantFrom(...CURRENCIES),
  positionSize: fc.double({ min: 0.001, max: 1000, noNaN: true, noDefaultInfinity: true }),
  averagePrice: fc.double({ min: 0.01, max: 10_000, noNaN: true, noDefaultInfinity: true }),
  executionPrice: fc.double({ min: 0.01, max: 10_000, noNaN: true, noDefaultInfinity: true }),
  fxRate: fc.double({ min: 0.1, max: 10, noNaN: true, noDefaultInfinity: true }),
  transactionCurrency: fc.constantFrom(...CURRENCIES),
  totalResult: fc.double({ min: -10_000, max: 10_000, noNaN: true, noDefaultInfinity: true }),
});

const dividendArb: fc.Arbitrary<PdfDividend> = fc.record({
  instrument: fc.string({ minLength: 1, maxLength: 20 }),
  isin: fc.constantFrom('US0378331005', 'IE00B4L5Y983'),
  instrumentCurrency: fc.constantFrom(...CURRENCIES),
  issuingCountry: fc.constantFrom('US', 'IE', 'DE', 'GB'),
  eligibleHoldings: fc.double({ min: 0, max: 1000, noNaN: true, noDefaultInfinity: true }),
  payDate: fc.constant('15.06.2025'),
  grossAmountPerShare: fc.double({ min: 0, max: 100, noNaN: true, noDefaultInfinity: true }),
  grossAmount: fc.double({ min: 0, max: 10_000, noNaN: true, noDefaultInfinity: true }),
  fxRate: fc.double({ min: 0.1, max: 10, noNaN: true, noDefaultInfinity: true }),
  grossAmountUsd: fc.double({ min: 0, max: 10_000, noNaN: true, noDefaultInfinity: true }),
  whtRate: fc.constantFrom('0%', '10%', '15%', '25%'),
  whtUsd: fc.double({ min: 0, max: 2_500, noNaN: true, noDefaultInfinity: true }),
  netAmountUsd: fc.double({ min: 0, max: 10_000, noNaN: true, noDefaultInfinity: true }),
});

const overviewArb: fc.Arbitrary<PdfOverview> = fc.record({
  closedResult: fc.double({ min: -100_000, max: 100_000, noNaN: true, noDefaultInfinity: true }),
  profit: fc.double({ min: 0, max: 100_000, noNaN: true, noDefaultInfinity: true }),
  loss: fc.double({ min: 0, max: 100_000, noNaN: true, noDefaultInfinity: true }),
  netDividends: fc.double({ min: 0, max: 10_000, noNaN: true, noDefaultInfinity: true }),
  grossDividends: fc.double({ min: 0, max: 10_000, noNaN: true, noDefaultInfinity: true }),
  taxWithheld: fc.double({ min: 0, max: 2_500, noNaN: true, noDefaultInfinity: true }),
  openResult: fc.double({ min: -100_000, max: 100_000, noNaN: true, noDefaultInfinity: true }),
  accountValue: fc.double({ min: 0, max: 1_000_000, noNaN: true, noDefaultInfinity: true }),
  currency: fc.constantFrom(...CURRENCIES),
});

const pdfDataArb: fc.Arbitrary<PdfParseResult> = fc.record({
  overview: overviewArb,
  sellTrades: fc.array(sellTradeArb, { minLength: 0, maxLength: 10 }),
  dividends: fc.array(dividendArb, { minLength: 0, maxLength: 10 }),
  distributions: fc.array(dividendArb, { minLength: 0, maxLength: 5 }),
  year: fc.integer({ min: 2020, max: 2030 }),
  warnings: fc.constant([]),
  structuredWarnings: fc.constant([]),
});

const exchangeRateArb = fc.double({
  min: 0.1,
  max: 10,
  noNaN: true,
  noDefaultInfinity: true,
});

describe('pdfTaxCalculator property tests', () => {
  it('never throws on arbitrary valid PdfParseResult input', () => {
    fc.assert(
      fc.property(pdfDataArb, exchangeRateArb, (data, rate) => {
        expect(() => calculateTaxesFromPdf(data, romaniaTaxConfig, rate)).not.toThrow();
      }),
      ASSERT_OPTS,
    );
  });

  it('totalTaxOwed is always non-negative', () => {
    fc.assert(
      fc.property(pdfDataArb, exchangeRateArb, (data, rate) => {
        const r = calculateTaxesFromPdf(data, romaniaTaxConfig, rate);
        expect(r.taxResult.totals.totalTaxOwed).toBeGreaterThanOrEqual(0);
      }),
      ASSERT_OPTS,
    );
  });

  it('netGains and losses are mutually exclusive (one is always zero)', () => {
    fc.assert(
      fc.property(pdfDataArb, exchangeRateArb, (data, rate) => {
        const r = calculateTaxesFromPdf(data, romaniaTaxConfig, rate);
        const { netGains, losses } = r.taxResult.capitalGains;
        expect(netGains).toBeGreaterThanOrEqual(0);
        expect(losses).toBeGreaterThanOrEqual(0);
        expect(netGains * losses).toBe(0);
      }),
      ASSERT_OPTS,
    );
  });

  it('empty sellTrades produces zero capital gains regardless of overview', () => {
    fc.assert(
      fc.property(overviewArb, exchangeRateArb, (overview, rate) => {
        const data: PdfParseResult = {
          overview,
          sellTrades: [],
          dividends: [],
          distributions: [],
          year: 2025,
          warnings: [],
          structuredWarnings: [],
        };
        const r = calculateTaxesFromPdf(data, romaniaTaxConfig, rate);
        expect(r.taxResult.capitalGains.netGains).toBe(0);
        expect(r.taxResult.capitalGains.losses).toBe(0);
        expect(r.taxResult.capitalGains.taxOwed).toBe(0);
      }),
      ASSERT_OPTS,
    );
  });

  it('dividend tax stays within [0, grossDividends * dividendTaxRate]', () => {
    fc.assert(
      fc.property(pdfDataArb, exchangeRateArb, (data, rate) => {
        const r = calculateTaxesFromPdf(data, romaniaTaxConfig, rate);
        const grossDividends = r.taxResult.dividends.grossTotal;
        const upperBound = grossDividends * romaniaTaxConfig.dividendTaxRate + 0.01;
        expect(r.taxResult.dividends.taxOwed).toBeGreaterThanOrEqual(0);
        expect(r.taxResult.dividends.taxOwed).toBeLessThanOrEqual(upperBound);
      }),
      ASSERT_OPTS,
    );
  });

  it('CASS health amount is one of the configured bracket fixedAmount values', () => {
    fc.assert(
      fc.property(pdfDataArb, exchangeRateArb, (data, rate) => {
        const r = calculateTaxesFromPdf(data, romaniaTaxConfig, rate);
        const validAmounts = romaniaTaxConfig.healthContributionBrackets.map(b => b.fixedAmount);
        expect(validAmounts).toContain(r.taxResult.healthContribution.amountOwed);
      }),
      ASSERT_OPTS,
    );
  });

  it('early filing discount equals (capitalGainsTax + dividendTax) * earlyFilingDiscountRate', () => {
    fc.assert(
      fc.property(pdfDataArb, exchangeRateArb, (data, rate) => {
        const r = calculateTaxesFromPdf(data, romaniaTaxConfig, rate);
        const cg = r.taxResult.capitalGains.taxOwed;
        const div = r.taxResult.dividends.taxOwed;
        const expected = (cg + div) * romaniaTaxConfig.earlyFilingDiscountRate;
        expect(r.taxResult.totals.earlyFilingDiscount).toBeCloseTo(expected, 1);
      }),
      ASSERT_OPTS,
    );
  });

  it('totalTaxOwed equals capitalGainsTax + dividendTax + healthAmount (within rounding)', () => {
    fc.assert(
      fc.property(pdfDataArb, exchangeRateArb, (data, rate) => {
        const r = calculateTaxesFromPdf(data, romaniaTaxConfig, rate);
        const cg = r.taxResult.capitalGains.taxOwed;
        const div = r.taxResult.dividends.taxOwed;
        const cass = r.taxResult.healthContribution.amountOwed;
        expect(r.taxResult.totals.totalTaxOwed).toBeCloseTo(cg + div + cass, 0);
      }),
      ASSERT_OPTS,
    );
  });

  it('capitalGainsTax equals netGains * capitalGainsTaxRate (within rounding)', () => {
    fc.assert(
      fc.property(pdfDataArb, exchangeRateArb, (data, rate) => {
        const r = calculateTaxesFromPdf(data, romaniaTaxConfig, rate);
        const { netGains, taxOwed } = r.taxResult.capitalGains;
        const expected = netGains * romaniaTaxConfig.capitalGainsTaxRate;
        expect(taxOwed).toBeCloseTo(expected, 1);
      }),
      ASSERT_OPTS,
    );
  });

  it('engine output structure is consistent (taxResult/securities/warnings always present)', () => {
    fc.assert(
      fc.property(pdfDataArb, exchangeRateArb, (data, rate) => {
        const r = calculateTaxesFromPdf(data, romaniaTaxConfig, rate);
        expect(r).toHaveProperty('taxResult');
        expect(r).toHaveProperty('securities');
        expect(r).toHaveProperty('warnings');
        expect(Array.isArray(r.warnings)).toBe(true);
        expect(Array.isArray(r.securities)).toBe(true);
        r.warnings.forEach(w => expect(typeof w).toBe('string'));
      }),
      ASSERT_OPTS,
    );
  });

  it('single-currency sells matching overview currency: netGains/losses derived from per-row sum', () => {
    const lockedCurrencyArb = fc.constantFrom(...CURRENCIES).chain(currency =>
      fc
        .tuple(
          fc.array(sellTradeArb, { minLength: 1, maxLength: 10 }),
          overviewArb,
        )
        .map(([trades, overview]) => ({
          currency,
          trades: trades.map(t => ({ ...t, transactionCurrency: currency })),
          overview: { ...overview, currency },
        })),
    );

    fc.assert(
      fc.property(lockedCurrencyArb, exchangeRateArb, ({ trades, overview }, rate) => {
        const data: PdfParseResult = {
          overview,
          sellTrades: trades,
          dividends: [],
          distributions: [],
          year: 2025,
          warnings: [],
          structuredWarnings: [],
        };
        const r = calculateTaxesFromPdf(data, romaniaTaxConfig, rate);
        const perRowSum = trades.reduce((s, t) => s + t.totalResult, 0);
        const expectedClosed = perRowSum * rate;
        const expectedNetGains = Math.max(0, expectedClosed);
        const expectedLosses = Math.max(0, -expectedClosed);
        expect(r.taxResult.capitalGains.netGains).toBeCloseTo(expectedNetGains, 0);
        expect(r.taxResult.capitalGains.losses).toBeCloseTo(expectedLosses, 0);
      }),
      ASSERT_OPTS,
    );
  });

  it('multi-currency sells fall back to overview.closedResult * exchangeRate', () => {
    // Force a mixed-currency situation: at least two distinct transactionCurrency
    // values across trades. Engine should ignore per-row sum and use overview.
    const mixedCurrencyArb = fc
      .tuple(
        fc.array(sellTradeArb, { minLength: 2, maxLength: 10 }),
        overviewArb,
      )
      .map(([trades, overview]) => {
        const stamped = trades.map((t, i) => ({
          ...t,
          transactionCurrency: CURRENCIES[i % CURRENCIES.length],
        }));
        return { trades: stamped, overview };
      })
      .filter(({ trades }) => {
        const cs = new Set(trades.map(t => t.transactionCurrency));
        return cs.size >= 2;
      });

    fc.assert(
      fc.property(mixedCurrencyArb, exchangeRateArb, ({ trades, overview }, rate) => {
        const data: PdfParseResult = {
          overview,
          sellTrades: trades,
          dividends: [],
          distributions: [],
          year: 2025,
          warnings: [],
          structuredWarnings: [],
        };
        const r = calculateTaxesFromPdf(data, romaniaTaxConfig, rate);
        const expectedClosed = overview.closedResult * rate;
        const expectedNetGains = Math.max(0, expectedClosed);
        const expectedLosses = Math.max(0, -expectedClosed);
        expect(r.taxResult.capitalGains.netGains).toBeCloseTo(expectedNetGains, 0);
        expect(r.taxResult.capitalGains.losses).toBeCloseTo(expectedLosses, 0);
      }),
      ASSERT_OPTS,
    );
  });

  it('sign-mismatch warning fires for single-currency trades that disagree with overview', () => {
    const currency = 'USD';
    fc.assert(
      fc.property(
        fc.double({ min: 1, max: 10_000, noNaN: true, noDefaultInfinity: true }),
        fc.double({ min: 1, max: 10_000, noNaN: true, noDefaultInfinity: true }),
        (perRow, overviewMag) => {
          const data: PdfParseResult = {
            overview: {
              closedResult: -overviewMag,
              profit: 0, loss: overviewMag,
              netDividends: 0, grossDividends: 0, taxWithheld: 0,
              openResult: 0, accountValue: 0,
              currency,
            },
            sellTrades: [{
              executionTime: '15.03.2025 10:30',
              instrument: 'TEST',
              isin: 'US0378331005',
              instrumentType: 'Stock',
              instrumentCurrency: currency,
              positionSize: 1,
              averagePrice: 1,
              executionPrice: 1 + perRow,
              fxRate: 1,
              transactionCurrency: currency,
              totalResult: perRow,
            }],
            dividends: [],
            distributions: [],
            year: 2025,
            warnings: [],
            structuredWarnings: [],
          };
          const r = calculateTaxesFromPdf(data, romaniaTaxConfig, 1);
          expect(r.warnings.some(w => w.toLowerCase().includes('sign mismatch'))).toBe(true);
        },
      ),
      ASSERT_OPTS,
    );
  });
});
