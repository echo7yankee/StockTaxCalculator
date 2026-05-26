/**
 * CI sweep: parseTrading212AnnualStatement over the parameterized synthesizer.
 *
 * Part of PR 6 A.2 (`pdf-robustness-execution-plan.md`). Builds on the
 * synthesizer shipped in PR #125 (A.1) and the spec list in
 * `test-data/synthesized-sweep-specs.ts`. Where the round-trip tests in
 * `test-data/__tests__/synthesize-t212-pages.test.ts` certify that the
 * generator produces parser-readable output for a hand-picked sample, this
 * sweep exercises the full cartesian (~210 main combinations + 10 edge cases +
 * 4 year-range samples) and asserts parser invariants on every spec.
 *
 * Invariants asserted on the main cartesian:
 *   1. Parser does not throw.
 *   2. Sell-trade / dividend / distribution counts match the spec.
 *   3. Detected year matches the spec.
 *   4. Detected base currency matches the spec.
 *
 * Edge-case invariants:
 *   - only-divs specs: parser still reports the correct dividend count, and
 *     the spec's expected "no sell trades section" warning fires.
 *   - large-volume specs: parser does not drop rows.
 *
 * The engine sweep at `shared/src/engine/__tests__/pdfTaxCalculator.synthesized.test.ts`
 * iterates over the same spec set. Keep both in sync via the shared list.
 */

import { describe, it, expect } from 'vitest';
import { parseTrading212AnnualStatement } from '../trading212Pdf.js';
import { synthesizeT212Pages } from '../../../../test-data/synthesize-t212-pages.js';
import {
  mainCartesian,
  yearSpecs,
  edgeCaseSpecs,
} from '../../../../test-data/synthesized-sweep-specs.js';

describe('parseTrading212AnnualStatement: synthesized CI sweep', () => {
  describe(`main cartesian (${mainCartesian.length} specs)`, () => {
    it.each(mainCartesian)('$name', ({ spec }) => {
      const pages = synthesizeT212Pages(spec);

      const result = parseTrading212AnnualStatement(pages);

      expect(result.sellTrades).toHaveLength(spec.sellTradeCount);
      expect(result.dividends).toHaveLength(spec.dividendCount);
      expect(result.distributions).toHaveLength(spec.distributionCount);
      expect(result.year).toBe(spec.year);
      expect(result.overview.currency).toBe(spec.baseCurrency);
    });
  });

  describe('year detection across the 2023-2026 range', () => {
    it.each(yearSpecs)('$name', ({ spec }) => {
      const pages = synthesizeT212Pages(spec);
      const result = parseTrading212AnnualStatement(pages);

      expect(result.year).toBe(spec.year);
    });
  });

  describe('edge cases: counts and detection still hold', () => {
    it.each(edgeCaseSpecs)('$name', ({ spec }) => {
      const pages = synthesizeT212Pages(spec);
      const result = parseTrading212AnnualStatement(pages);

      expect(result.sellTrades).toHaveLength(spec.sellTradeCount);
      expect(result.dividends).toHaveLength(spec.dividendCount);
      expect(result.distributions).toHaveLength(spec.distributionCount);
      expect(result.year).toBe(spec.year);
      expect(result.overview.currency).toBe(spec.baseCurrency);
    });

    it('only-divs en USD spec emits the expected "no sell trades section" warning', () => {
      const onlyDivs = edgeCaseSpecs.find((s) => s.name.startsWith('only-divs en USD'));
      expect(onlyDivs).toBeDefined();
      const result = parseTrading212AnnualStatement(synthesizeT212Pages(onlyDivs!.spec));
      expect(result.warnings).toContain('No sell trades section found in the PDF.');
    });
  });

  describe('non-empty-section specs produce zero parser warnings', () => {
    // Main cartesian always has sellTradeCount >= 1, dividendCount >= 1; the
    // parser should find every section it expects and emit no warnings.
    it.each(mainCartesian)('$name has empty warnings array', ({ spec }) => {
      const result = parseTrading212AnnualStatement(synthesizeT212Pages(spec));
      expect(result.warnings).toEqual([]);
    });
  });
});
