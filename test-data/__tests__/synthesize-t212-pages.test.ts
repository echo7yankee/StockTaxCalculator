/**
 * Round-trip tests for the parameterized T212 PDF synthesizer.
 *
 * The contract: every spec the synthesizer emits must parse through
 * `parseTrading212AnnualStatement` (the production parser) into a structurally
 * consistent `PdfParseResult`. Specifically:
 *   - sell-trade count matches the spec
 *   - dividend count matches the spec
 *   - distribution count matches the spec
 *   - detected year matches the spec
 *   - detected currency matches the spec's baseCurrency
 *   - no "format may differ" / "no section found when one was emitted" / "could
 *     not detect year" warnings fire for normal (non-empty) specs
 *
 * This is the foundation A.2 will build on: A.2 sweeps the cartesian product
 * of these specs against parser + engine invariants. A.1 only certifies that
 * the GENERATOR produces well-formed input.
 */
import { describe, it, expect } from 'vitest';
import { parseTrading212AnnualStatement } from '../../shared/src/parsers/trading212Pdf';
import {
  synthesizeT212Pages,
  defaultSpec,
  type T212SynthSpec,
} from '../synthesize-t212-pages.js';

describe('synthesizeT212Pages', () => {
  describe('default spec', () => {
    it('emits a parseable annual statement with no unexpected warnings', () => {
      const pages = synthesizeT212Pages(defaultSpec());
      const result = parseTrading212AnnualStatement(pages);

      expect(result.sellTrades).toHaveLength(3);
      expect(result.dividends).toHaveLength(2);
      expect(result.distributions).toHaveLength(1);
      expect(result.year).toBe(2025);
      expect(result.overview.currency).toBe('USD');
      expect(result.warnings).toEqual([]);
    });
  });

  describe('account count variations', () => {
    it('single-account Invest layout parses', () => {
      const pages = synthesizeT212Pages(defaultSpec({ accounts: ['Invest'] }));
      const result = parseTrading212AnnualStatement(pages);

      expect(result.sellTrades).toHaveLength(3);
      expect(result.warnings).toEqual([]);
    });

    it('two-account Invest + CFD horizontal layout parses Invest-only numbers', () => {
      const pages = synthesizeT212Pages(defaultSpec({ accounts: ['Invest', 'CFD'] }));
      const result = parseTrading212AnnualStatement(pages);

      expect(result.sellTrades).toHaveLength(3);
      expect(result.dividends).toHaveLength(2);
      expect(result.overview.closedResult).toBeGreaterThan(0);
      expect(result.warnings).toEqual([]);
    });

    it('three-account Invest + CFD + Crypto horizontal layout parses Invest-only numbers', () => {
      const pages = synthesizeT212Pages(
        defaultSpec({ accounts: ['Invest', 'CFD', 'Crypto'] }),
      );
      const result = parseTrading212AnnualStatement(pages);

      expect(result.sellTrades).toHaveLength(3);
      expect(result.dividends).toHaveLength(2);
      expect(result.distributions).toHaveLength(1);
      expect(result.warnings).toEqual([]);
    });
  });

  describe('language variations', () => {
    it('English variant parses cleanly', () => {
      const pages = synthesizeT212Pages(defaultSpec({ language: 'en' }));
      const result = parseTrading212AnnualStatement(pages);

      expect(result.warnings).toEqual([]);
      expect(result.sellTrades).toHaveLength(3);
    });

    it('Romanian variant parses cleanly via localized keywords', () => {
      const pages = synthesizeT212Pages(defaultSpec({ language: 'ro' }));
      const result = parseTrading212AnnualStatement(pages);

      expect(result.warnings).toEqual([]);
      expect(result.sellTrades).toHaveLength(3);
      expect(result.dividends).toHaveLength(2);
    });
  });

  describe('base currency variations', () => {
    it('USD overview is detected as USD', () => {
      const pages = synthesizeT212Pages(defaultSpec({ baseCurrency: 'USD' }));
      const result = parseTrading212AnnualStatement(pages);
      expect(result.overview.currency).toBe('USD');
    });

    it('EUR overview is detected as EUR', () => {
      const pages = synthesizeT212Pages(defaultSpec({ baseCurrency: 'EUR' }));
      const result = parseTrading212AnnualStatement(pages);
      expect(result.overview.currency).toBe('EUR');
    });

    it('GBP overview is detected as GBP', () => {
      const pages = synthesizeT212Pages(defaultSpec({ baseCurrency: 'GBP' }));
      const result = parseTrading212AnnualStatement(pages);
      expect(result.overview.currency).toBe('GBP');
    });

    it('RON overview is detected as RON', () => {
      const pages = synthesizeT212Pages(
        defaultSpec({ baseCurrency: 'RON', language: 'ro' }),
      );
      const result = parseTrading212AnnualStatement(pages);
      expect(result.overview.currency).toBe('RON');
    });
  });

  describe('year variations', () => {
    it.each([2023, 2024, 2025, 2026])('detects year %s', (year) => {
      const pages = synthesizeT212Pages(defaultSpec({ year }));
      const result = parseTrading212AnnualStatement(pages);
      expect(result.year).toBe(year);
    });
  });

  describe('trade / dividend / distribution counts', () => {
    it('high trade count (large statement) parses all rows', () => {
      const pages = synthesizeT212Pages(
        defaultSpec({ sellTradeCount: 50, dividendCount: 30, distributionCount: 10 }),
      );
      const result = parseTrading212AnnualStatement(pages);

      expect(result.sellTrades).toHaveLength(50);
      expect(result.dividends).toHaveLength(30);
      expect(result.distributions).toHaveLength(10);
      expect(result.warnings).toEqual([]);
    });

    it('only-sells (zero dividends) parses with appropriate "no dividend section" absence', () => {
      const pages = synthesizeT212Pages(
        defaultSpec({ sellTradeCount: 5, dividendCount: 0, distributionCount: 0 }),
      );
      const result = parseTrading212AnnualStatement(pages);

      expect(result.sellTrades).toHaveLength(5);
      expect(result.dividends).toHaveLength(0);
      expect(result.distributions).toHaveLength(0);
      // No warning fires for a missing section the parser never sees a heading for.
      expect(result.warnings).toEqual([]);
    });

    it('only-dividends (zero sells) reports the missing sell-trades section', () => {
      const pages = synthesizeT212Pages(
        defaultSpec({ sellTradeCount: 0, dividendCount: 5, distributionCount: 0 }),
      );
      const result = parseTrading212AnnualStatement(pages);

      expect(result.sellTrades).toHaveLength(0);
      expect(result.dividends).toHaveLength(5);
      // Parser warns when no sell-trades section is present at all. Expected.
      expect(result.warnings).toContain('No sell trades section found in the PDF.');
    });

    it('only-distributions (ETF-only Invest account) parses', () => {
      const pages = synthesizeT212Pages(
        defaultSpec({ sellTradeCount: 1, dividendCount: 0, distributionCount: 4 }),
      );
      const result = parseTrading212AnnualStatement(pages);

      expect(result.distributions).toHaveLength(4);
      expect(result.warnings).toEqual([]);
    });
  });

  describe('ligature artifacts', () => {
    it('ligature-broken text still parses cleanly (parser tolerates "Pro\\tfi\\tt")', () => {
      const pages = synthesizeT212Pages(defaultSpec({ ligatureBroken: true }));
      const result = parseTrading212AnnualStatement(pages);

      expect(result.sellTrades).toHaveLength(3);
      expect(result.dividends).toHaveLength(2);
      // closedResult comes from the "Closed result" row, which has no ligatures,
      // so even with ligature-broken "Profit" the engine numbers stay clean.
      expect(result.overview.closedResult).toBeGreaterThan(0);
      // The ligature artifact appears in the first page's text (visible proof
      // the generator actually injected the breaks).
      expect(pages[0]).toContain('Pro\tfi\tt');
    });
  });

  describe('overview cross-checks (parser invariants)', () => {
    it('per-row sell-trade sum matches overview.closedResult within 1 RON tolerance', () => {
      const pages = synthesizeT212Pages(defaultSpec({ sellTradeCount: 20 }));
      const result = parseTrading212AnnualStatement(pages);

      const parsedSum = result.sellTrades.reduce((s, t) => s + t.totalResult, 0);
      expect(Math.abs(parsedSum - result.overview.closedResult)).toBeLessThan(1);
    });

    it('per-row dividend grossUsd sum matches overview.grossDividends within 1 RON tolerance', () => {
      const pages = synthesizeT212Pages(
        defaultSpec({ dividendCount: 10, distributionCount: 5 }),
      );
      const result = parseTrading212AnnualStatement(pages);

      const parsedGross = [...result.dividends, ...result.distributions].reduce(
        (s, d) => s + d.grossAmountUsd,
        0,
      );
      expect(Math.abs(parsedGross - result.overview.grossDividends)).toBeLessThan(1);
    });
  });

  describe('structural validation', () => {
    it('rejects empty accounts list', () => {
      const spec = defaultSpec();
      spec.accounts = [];
      expect(() => synthesizeT212Pages(spec)).toThrow(/accounts must be non-empty/);
    });

    it('rejects more than 3 accounts', () => {
      const spec = defaultSpec();
      // Invest + 3 siblings = 4 accounts, exceeds the layout T212 supports.
      spec.accounts = ['Invest', 'CFD', 'Crypto', 'ISA'];
      expect(() => synthesizeT212Pages(spec)).toThrow(/at most 3 entries/);
    });

    it('rejects non-Invest first account', () => {
      const spec = defaultSpec();
      spec.accounts = ['CFD', 'Invest'];
      expect(() => synthesizeT212Pages(spec)).toThrow(/first account must be Invest/);
    });

    it('rejects out-of-range year', () => {
      expect(() => synthesizeT212Pages(defaultSpec({ year: 2010 }))).toThrow(/outside supported range/);
      expect(() => synthesizeT212Pages(defaultSpec({ year: 2040 }))).toThrow(/outside supported range/);
    });

    it('rejects negative counts', () => {
      expect(() => synthesizeT212Pages(defaultSpec({ sellTradeCount: -1 }))).toThrow();
      expect(() => synthesizeT212Pages(defaultSpec({ dividendCount: -1 }))).toThrow();
      expect(() => synthesizeT212Pages(defaultSpec({ distributionCount: -1 }))).toThrow();
    });
  });

  describe('cartesian sample (smoke)', () => {
    // A small hand-picked sample of the parameter space, run end-to-end through
    // the parser. PR A.2 will replace this with describe.each over hundreds of
    // combinations. Today this is the "did I break a dimension?" tripwire.
    const sampleSpecs: Array<{ name: string; overrides: Partial<T212SynthSpec> }> = [
      { name: 'en USD single Invest', overrides: { language: 'en', baseCurrency: 'USD', accounts: ['Invest'] } },
      { name: 'ro RON single Invest', overrides: { language: 'ro', baseCurrency: 'RON', accounts: ['Invest'] } },
      { name: 'en USD multi Invest+CFD', overrides: { language: 'en', baseCurrency: 'USD', accounts: ['Invest', 'CFD'] } },
      { name: 'ro RON multi Invest+CFD+Crypto', overrides: { language: 'ro', baseCurrency: 'RON', accounts: ['Invest', 'CFD', 'Crypto'] } },
      { name: 'en EUR ligature-broken', overrides: { language: 'en', baseCurrency: 'EUR', ligatureBroken: true } },
      { name: 'en GBP year 2024', overrides: { language: 'en', baseCurrency: 'GBP', year: 2024 } },
      { name: 'en USD heavy 100 trades 50 divs', overrides: { sellTradeCount: 100, dividendCount: 50, distributionCount: 20 } },
      { name: 'en USD only-sells', overrides: { sellTradeCount: 10, dividendCount: 0, distributionCount: 0 } },
      { name: 'ro RON only-divs', overrides: { language: 'ro', baseCurrency: 'RON', sellTradeCount: 0, dividendCount: 5, distributionCount: 0 } },
      { name: 'en USD only-distributions (ETF only)', overrides: { sellTradeCount: 1, dividendCount: 0, distributionCount: 6 } },
    ];

    it.each(sampleSpecs)('$name: parser does not throw', ({ overrides }) => {
      const spec = defaultSpec(overrides);
      const pages = synthesizeT212Pages(spec);
      expect(() => parseTrading212AnnualStatement(pages)).not.toThrow();
    });

    it.each(sampleSpecs)('$name: parsed counts match spec', ({ overrides }) => {
      const spec = defaultSpec(overrides);
      const pages = synthesizeT212Pages(spec);
      const result = parseTrading212AnnualStatement(pages);

      expect(result.sellTrades).toHaveLength(spec.sellTradeCount);
      expect(result.dividends).toHaveLength(spec.dividendCount);
      expect(result.distributions).toHaveLength(spec.distributionCount);
    });

    it.each(sampleSpecs)('$name: year and currency detected correctly', ({ overrides }) => {
      const spec = defaultSpec(overrides);
      const pages = synthesizeT212Pages(spec);
      const result = parseTrading212AnnualStatement(pages);

      expect(result.year).toBe(spec.year);
      expect(result.overview.currency).toBe(spec.baseCurrency);
    });
  });

  describe('output shape', () => {
    it('emits at least 2 pages (overview + glossary minimum)', () => {
      const pages = synthesizeT212Pages(
        defaultSpec({ sellTradeCount: 0, dividendCount: 0, distributionCount: 0 }),
      );
      expect(pages.length).toBeGreaterThanOrEqual(2);
    });

    it('emits exactly overview + sells + divs + dists + glossary when all sections requested', () => {
      const pages = synthesizeT212Pages(
        defaultSpec({ sellTradeCount: 1, dividendCount: 1, distributionCount: 1 }),
      );
      expect(pages).toHaveLength(5);
    });

    it('every page ends with the standard footer + page marker', () => {
      const pages = synthesizeT212Pages(defaultSpec());
      pages.forEach((page, i) => {
        expect(page).toMatch(new RegExp(`${i + 1}/${pages.length}$`));
      });
    });
  });
});
