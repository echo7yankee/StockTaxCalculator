import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { parseTrading212AnnualStatement } from '../trading212Pdf.js';
import type { PdfOverview } from '../trading212Pdf.js';

// Fixed seed so CI failures reproduce locally.
const ASSERT_OPTS = { numRuns: 100, seed: 4242 };

// Arbitrary string but exclude NUL bytes (which would never appear in a real
// PDF extraction and can crash some downstream tooling).
const safeStringArb = fc.string({ maxLength: 200 }).filter(s => !s.includes('\0'));
const pagesArb = fc.array(safeStringArb, { maxLength: 10 });

describe('parseTrading212AnnualStatement property tests', () => {
  it('never throws on arbitrary string[] input', () => {
    fc.assert(
      fc.property(pagesArb, pages => {
        expect(() => parseTrading212AnnualStatement(pages)).not.toThrow();
      }),
      ASSERT_OPTS,
    );
  });

  it('is idempotent (same input produces equal output)', () => {
    fc.assert(
      fc.property(pagesArb, pages => {
        const a = parseTrading212AnnualStatement(pages);
        const b = parseTrading212AnnualStatement(pages);
        expect(a).toEqual(b);
      }),
      ASSERT_OPTS,
    );
  });

  it('empty input produces a well-formed empty result', () => {
    const r = parseTrading212AnnualStatement([]);
    expect(r.sellTrades).toEqual([]);
    expect(r.dividends).toEqual([]);
    expect(r.distributions).toEqual([]);
    expect(typeof r.year).toBe('number');
    expect(Number.isInteger(r.year)).toBe(true);
    expect(Array.isArray(r.warnings)).toBe(true);
    expect(r.overview).toBeDefined();
  });

  it('warnings array is always string[]', () => {
    fc.assert(
      fc.property(pagesArb, pages => {
        const r = parseTrading212AnnualStatement(pages);
        expect(Array.isArray(r.warnings)).toBe(true);
        r.warnings.forEach(w => expect(typeof w).toBe('string'));
      }),
      ASSERT_OPTS,
    );
  });

  it('overview numeric fields are always finite numbers (never NaN/Infinity)', () => {
    const numericFields: (keyof PdfOverview)[] = [
      'closedResult', 'profit', 'loss',
      'netDividends', 'grossDividends', 'taxWithheld',
      'openResult', 'accountValue',
    ];
    fc.assert(
      fc.property(pagesArb, pages => {
        const r = parseTrading212AnnualStatement(pages);
        for (const field of numericFields) {
          const v = r.overview[field] as number;
          expect(typeof v).toBe('number');
          expect(Number.isFinite(v)).toBe(true);
        }
        expect(typeof r.overview.currency).toBe('string');
        expect(r.overview.currency.length).toBeGreaterThan(0);
      }),
      ASSERT_OPTS,
    );
  });

  it('year is always a plausible integer (1900-2100)', () => {
    fc.assert(
      fc.property(pagesArb, pages => {
        const r = parseTrading212AnnualStatement(pages);
        expect(Number.isInteger(r.year)).toBe(true);
        expect(r.year).toBeGreaterThanOrEqual(1900);
        expect(r.year).toBeLessThanOrEqual(2100);
      }),
      ASSERT_OPTS,
    );
  });

  it('sellTrades rows always have all required fields with correct types', () => {
    fc.assert(
      fc.property(pagesArb, pages => {
        const r = parseTrading212AnnualStatement(pages);
        for (const trade of r.sellTrades) {
          expect(typeof trade.executionTime).toBe('string');
          expect(typeof trade.instrument).toBe('string');
          expect(typeof trade.isin).toBe('string');
          expect(typeof trade.instrumentType).toBe('string');
          expect(typeof trade.instrumentCurrency).toBe('string');
          expect(typeof trade.transactionCurrency).toBe('string');
          expect(Number.isFinite(trade.positionSize)).toBe(true);
          expect(Number.isFinite(trade.averagePrice)).toBe(true);
          expect(Number.isFinite(trade.executionPrice)).toBe(true);
          expect(Number.isFinite(trade.fxRate)).toBe(true);
          expect(Number.isFinite(trade.totalResult)).toBe(true);
        }
      }),
      ASSERT_OPTS,
    );
  });

  it('dividend rows always have all required fields with correct types', () => {
    fc.assert(
      fc.property(pagesArb, pages => {
        const r = parseTrading212AnnualStatement(pages);
        for (const div of [...r.dividends, ...r.distributions]) {
          expect(typeof div.instrument).toBe('string');
          expect(typeof div.isin).toBe('string');
          expect(typeof div.instrumentCurrency).toBe('string');
          expect(typeof div.issuingCountry).toBe('string');
          expect(typeof div.payDate).toBe('string');
          expect(typeof div.whtRate).toBe('string');
          expect(Number.isFinite(div.eligibleHoldings)).toBe(true);
          expect(Number.isFinite(div.grossAmountPerShare)).toBe(true);
          expect(Number.isFinite(div.grossAmount)).toBe(true);
          expect(Number.isFinite(div.fxRate)).toBe(true);
          expect(Number.isFinite(div.grossAmountUsd)).toBe(true);
          expect(Number.isFinite(div.whtUsd)).toBe(true);
          expect(Number.isFinite(div.netAmountUsd)).toBe(true);
        }
      }),
      ASSERT_OPTS,
    );
  });

  it('Annual Statement YYYY pattern always wins year detection', () => {
    fc.assert(
      fc.property(fc.integer({ min: 2020, max: 2030 }), year => {
        const pages = [`Annual Statement - ${year}\n`];
        const r = parseTrading212AnnualStatement(pages);
        expect(r.year).toBe(year);
      }),
      ASSERT_OPTS,
    );
  });

  it('Romanian Declaratie anuala YYYY pattern is recognized', () => {
    fc.assert(
      fc.property(fc.integer({ min: 2020, max: 2030 }), year => {
        const pages = [`Declarație anuală - ${year}\n`];
        const r = parseTrading212AnnualStatement(pages);
        expect(r.year).toBe(year);
      }),
      ASSERT_OPTS,
    );
  });

  it('Closed Result line round-trips through parseOverview for USD/EUR/GBP values', () => {
    // Limit to non-zero positive values so the parser unambiguously picks the
    // numeric cell. Zero is exercised separately via the explicit-zero path.
    fc.assert(
      fc.property(
        fc.double({ min: 0.01, max: 10_000, noNaN: true, noDefaultInfinity: true })
          .map(v => Math.round(v * 100) / 100),
        fc.constantFrom('USD', 'EUR', 'GBP') as fc.Arbitrary<'USD' | 'EUR' | 'GBP'>,
        (value, currency) => {
          const symbol = currency === 'USD' ? '$' : currency === 'EUR' ? '€' : '£';
          const pages = [`Annual Statement - 2025\nClosed Result\t${symbol}${value.toFixed(2)}\n`];
          const r = parseTrading212AnnualStatement(pages);
          expect(r.overview.closedResult).toBeCloseTo(value, 1);
          expect(r.overview.currency).toBe(currency);
        },
      ),
      ASSERT_OPTS,
    );
  });

  it('Negative Closed Result formatted as parenthesised value round-trips with correct sign', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.01, max: 10_000, noNaN: true, noDefaultInfinity: true })
          .map(v => Math.round(v * 100) / 100),
        magnitude => {
          // T212 uses parens for negatives, e.g. "($123.45)". parseNum replaces ( ) with -.
          const pages = [`Annual Statement - 2025\nClosed Result\t($${magnitude.toFixed(2)})\n`];
          const r = parseTrading212AnnualStatement(pages);
          expect(r.overview.closedResult).toBeCloseTo(-magnitude, 1);
        },
      ),
      ASSERT_OPTS,
    );
  });
});
