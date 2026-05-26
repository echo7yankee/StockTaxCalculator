/**
 * CI sweep: calculateTaxesFromPdf over the parameterized synthesizer.
 *
 * Part of PR 6 A.2 (`pdf-robustness-execution-plan.md`). Mirror of the parser
 * sweep at `shared/src/parsers/__tests__/trading212Pdf.synthesized.test.ts`,
 * sharing the spec list at `test-data/synthesized-sweep-specs.ts`. Every spec
 * the parser sweep covers also runs end-to-end through the engine here.
 *
 * Invariants asserted on the main cartesian:
 *   1. Engine does not throw.
 *   2. Output structure is consistent (taxResult / securities / warnings, all
 *      typed correctly).
 *   3. totalTaxOwed is non-negative.
 *   4. Dividend taxOwed sits in [0, grossDividends * dividendTaxRate + tol].
 *   5. Capital-gains taxOwed equals capitalGainsTaxRate * netGains (within rounding).
 *   6. netGains and losses are non-negative and mutually exclusive (one is zero).
 *
 * Edge-case invariants:
 *   - The engine stays stable when the parser produced warnings (only-divs case
 *     emits "No sell trades section found in the PDF."). No crash, well-formed
 *     output, non-negative totals.
 *   - Large-volume specs do not blow up downstream math (no NaN / Infinity).
 *
 * Engine sweep size scales linearly with parser sweep size; current run is
 * ~220 spec evaluations. Fixed BNR rate of 4.5 USD/RON (annual-average ballpark
 * for 2025) keeps assertions math-stable across specs.
 */

import { describe, it, expect } from 'vitest';
import { calculateTaxesFromPdf } from '../pdfTaxCalculator.js';
import { romaniaTaxConfig } from '../../taxRules/romania.js';
import { parseTrading212AnnualStatement } from '../../parsers/trading212Pdf.js';
import { synthesizeT212Pages } from '../../../../test-data/synthesize-t212-pages.js';
import {
  mainCartesian,
  edgeCaseSpecs,
} from '../../../../test-data/synthesized-sweep-specs.js';

const EXCHANGE_RATE = 4.5;
const TOL = 0.05;

describe('calculateTaxesFromPdf: synthesized CI sweep', () => {
  describe(`main cartesian (${mainCartesian.length} specs)`, () => {
    it.each(mainCartesian)('$name', ({ spec }) => {
      const pages = synthesizeT212Pages(spec);
      const parsed = parseTrading212AnnualStatement(pages);

      const result = calculateTaxesFromPdf(parsed, romaniaTaxConfig, EXCHANGE_RATE);

      expect(result).toHaveProperty('taxResult');
      expect(result).toHaveProperty('securities');
      expect(result).toHaveProperty('warnings');
      expect(Array.isArray(result.warnings)).toBe(true);
      expect(Array.isArray(result.securities)).toBe(true);
      result.warnings.forEach((w) => expect(typeof w).toBe('string'));

      expect(Number.isFinite(result.taxResult.totals.totalTaxOwed)).toBe(true);
      expect(result.taxResult.totals.totalTaxOwed).toBeGreaterThanOrEqual(0);

      const grossDividends = result.taxResult.dividends.grossTotal;
      expect(grossDividends).toBeGreaterThanOrEqual(0);
      const dividendTaxUpper = grossDividends * romaniaTaxConfig.dividendTaxRate + TOL;
      expect(result.taxResult.dividends.taxOwed).toBeGreaterThanOrEqual(0);
      expect(result.taxResult.dividends.taxOwed).toBeLessThanOrEqual(dividendTaxUpper);

      const { netGains, losses, taxOwed: cgTax } = result.taxResult.capitalGains;
      expect(netGains).toBeGreaterThanOrEqual(0);
      expect(losses).toBeGreaterThanOrEqual(0);
      expect(netGains * losses).toBe(0);
      expect(cgTax).toBeCloseTo(netGains * romaniaTaxConfig.capitalGainsTaxRate, 1);
    });
  });

  describe('engine stays stable when parser produced warnings', () => {
    it.each(edgeCaseSpecs)('$name', ({ spec }) => {
      const pages = synthesizeT212Pages(spec);
      const parsed = parseTrading212AnnualStatement(pages);

      const result = calculateTaxesFromPdf(parsed, romaniaTaxConfig, EXCHANGE_RATE);

      expect(result).toHaveProperty('taxResult');
      expect(Number.isFinite(result.taxResult.totals.totalTaxOwed)).toBe(true);
      expect(result.taxResult.totals.totalTaxOwed).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(result.taxResult.capitalGains.netGains)).toBe(true);
      expect(Number.isFinite(result.taxResult.capitalGains.losses)).toBe(true);
      expect(Number.isFinite(result.taxResult.dividends.taxOwed)).toBe(true);
    });
  });

  describe('large-volume specs do not produce NaN / Infinity', () => {
    const largeVolumeSpecs = edgeCaseSpecs.filter((s) => s.name.startsWith('large volume'));

    it.each(largeVolumeSpecs)('$name: all securities have finite numbers', ({ spec }) => {
      const pages = synthesizeT212Pages(spec);
      const parsed = parseTrading212AnnualStatement(pages);
      const result = calculateTaxesFromPdf(parsed, romaniaTaxConfig, EXCHANGE_RATE);

      for (const sec of result.securities) {
        expect(Number.isFinite(sec.totalProceeds)).toBe(true);
        expect(Number.isFinite(sec.totalCostBasis)).toBe(true);
        expect(Number.isFinite(sec.realizedGainLoss)).toBe(true);
        expect(Number.isFinite(sec.totalDividends)).toBe(true);
        expect(Number.isFinite(sec.totalWithholdingTax)).toBe(true);
      }
    });
  });
});
