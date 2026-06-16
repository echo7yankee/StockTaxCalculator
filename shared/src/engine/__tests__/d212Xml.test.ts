/**
 * Tests for the D212 v11 XML generator.
 *
 * Two layers:
 *
 * 1. Golden regression lock: parse the committed real 2025 Trading212 statement
 *    fixture, run it through the engine exactly like `pdfIntegration.test.ts`,
 *    generate the D212 XML, and assert the EXACT v11 attribute values the
 *    session #144 spike proved congruent with Dragos's ANAF-accepted filing.
 *    This codifies the spike proof as a permanent regression lock.
 *
 * 2. Hermetic unit tests on the pure generator with synthetic
 *    `TaxCalculationResult` inputs (no engine): rounding, dividend credit cap,
 *    zero dividends, XML escaping, well-formedness.
 *
 * Note: Dragos's actual filed XML was PII, deleted, and never committed. These
 * tests assert only against engine-derived values from the committed fixture.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseTrading212AnnualStatement } from '../../parsers/trading212Pdf.js';
import { calculateTaxesFromPdf } from '../pdfTaxCalculator.js';
import { romaniaTaxConfig } from '../../taxRules/romania.js';
import { generateD212Xml, type D212Identity } from '../d212Xml.js';
import type { TaxCalculationResult } from '../../types/tax.js';

const fixtureDir = join(__dirname, '../../../../test-data/fixtures');
const loadFixture = (name: string): string[] =>
  JSON.parse(readFileSync(join(fixtureDir, name), 'utf8'));

const USD_ANNUAL_AVG_2025 = 4.4705; // BNR official curs mediu anual USD/RON 2025

// Dummy identity (no real PII). Names/IBAN are placeholders; cif matches the
// CNP pattern [1-9]\d{12}.
const DUMMY_IDENTITY: D212Identity = {
  nume_c: 'TEST',
  initiala_c: 'T',
  prenume_c: 'TEST',
  cif: '1900101000000',
  cont_bancar: 'RO00BANK0000000000000000',
  telefon_c: '0700000000',
};

/** Extracts an attribute value from an XML element by name (first match). */
function attr(xml: string, name: string): string | undefined {
  const m = new RegExp(`\\b${name}="([^"]*)"`).exec(xml);
  return m ? m[1] : undefined;
}

/** Returns the substring for the `<cap14 .../>` element with the given str_categ_venit code. */
function cap14ByCode(xml: string, code: string): string {
  const re = new RegExp(`<cap14\\b[^>]*\\bstr_categ_venit="${code}"[^>]*/>`);
  const m = re.exec(xml);
  expect(m, `cap14 with str_categ_venit="${code}" should be present`).not.toBeNull();
  return m![0];
}

/** Returns the substring for the single `<oblig_realizat .../>` element. */
function obligRealizat(xml: string): string {
  const m = /<oblig_realizat\b[^>]*\/>/.exec(xml);
  expect(m, 'oblig_realizat element should be present').not.toBeNull();
  return m![0];
}

describe('D212 v11 XML generator', () => {
  describe('golden regression lock (real 2025 statement -> engine -> XML)', () => {
    const parsed = parseTrading212AnnualStatement(
      loadFixture('annual-statement-2025-pages.json'),
    );
    const usdDaily2025: Record<string, number> = JSON.parse(
      readFileSync(join(fixtureDir, 'bnr-usd-2025-daily.json'), 'utf8'),
    );
    const { taxResult } = calculateTaxesFromPdf(
      parsed,
      romaniaTaxConfig,
      USD_ANNUAL_AVG_2025,
      usdDaily2025,
    );
    const xml = generateD212Xml(taxResult, DUMMY_IDENTITY);

    it('declares the v11 namespace on the d212 root', () => {
      expect(xml).toContain('xmlns="mfp:anaf:dgti:d212:declaratie:v11"');
      expect(xml.startsWith('<?xml')).toBe(true);
    });

    it('emits both foreign-income category codes (2012 capital gains, 2018 dividends)', () => {
      expect(xml).toContain('str_categ_venit="2012"');
      expect(xml).toContain('str_categ_venit="2018"');
    });

    it('cap14[2012] capital gains: net == recalculat == 187292, tax == dif == 18729', () => {
      const row = cap14ByCode(xml, '2012');
      expect(attr(row, 'str_venit_net_anual')).toBe('187292');
      expect(attr(row, 'str_venit_recalculat')).toBe('187292');
      expect(attr(row, 'str_impozit_datorat_Ro')).toBe('18729');
      expect(attr(row, 'str_dif_impozit_datorat')).toBe('18729');
      expect(attr(row, 'str_impozit_platit')).toBe('0');
      expect(attr(row, 'str_credit_fiscal')).toBe('0');
      expect(attr(row, 'str_stat_realiz_v')).toBe('US');
    });

    it('cap14[2018] dividends: recalculat 629, Ro tax 63, platit 11, credit 11, dif 52', () => {
      const row = cap14ByCode(xml, '2018');
      expect(attr(row, 'str_venit_net_anual')).toBe('0');
      expect(attr(row, 'str_venit_recalculat')).toBe('629');
      expect(attr(row, 'str_impozit_datorat_Ro')).toBe('63');
      expect(attr(row, 'str_impozit_platit')).toBe('11');
      expect(attr(row, 'str_credit_fiscal')).toBe('11');
      expect(attr(row, 'str_dif_impozit_datorat')).toBe('52');
    });

    it('oblig_realizat: CASS 9720 / baza 97200 / ven_inv 187921, income-tax total 18781, bonif 563, dif_de_plata 28501', () => {
      const row = obligRealizat(xml);
      expect(attr(row, 'cass_datorat')).toBe('9720');
      expect(attr(row, 'cass_baza')).toBe('97200');
      expect(attr(row, 'cass_ven_inv')).toBe('187921');
      expect(attr(row, 'oblimpoz_real_total')).toBe('18781');
      expect(attr(row, 'oblimpozit_real_bonif')).toBe('563');
      expect(attr(row, 'dif_de_plata')).toBe('28501');
    });

    it('keeps the verbatim Romanian capital-gains category label (with diacritics)', () => {
      expect(xml).toContain(
        'den_categ_venit="Transferul titlurilor de valoare și orice alte operațiuni cu instrumente financiare, inclusiv instrumente financiare derivate, precum și transferul aurului financiar"',
      );
      expect(xml).toContain('den_stat="Statele Unite ale Americii"');
    });
  });

  describe('pure generator unit tests (synthetic inputs, no engine)', () => {
    /** Builds a synthetic TaxCalculationResult; override any leaf via the partials. */
    const makeResult = (overrides: {
      capitalGains?: Partial<TaxCalculationResult['capitalGains']>;
      dividends?: Partial<TaxCalculationResult['dividends']>;
      healthContribution?: Partial<TaxCalculationResult['healthContribution']>;
      totals?: Partial<TaxCalculationResult['totals']>;
    } = {}): TaxCalculationResult => ({
      taxYearId: '2025',
      capitalGains: {
        totalProceeds: 0,
        totalCostBasis: 0,
        netGains: 0,
        losses: 0,
        taxRate: 0.1,
        taxOwed: 0,
        ...overrides.capitalGains,
      },
      dividends: {
        grossTotal: 0,
        withholdingTaxPaid: 0,
        taxOwed: 0,
        ...overrides.dividends,
      },
      healthContribution: {
        totalNonSalaryIncome: 0,
        thresholdHit: 'none',
        amountOwed: 0,
        ...overrides.healthContribution,
      },
      totals: {
        totalTaxOwed: 0,
        earlyFilingDiscount: 0,
        totalAfterDiscount: 0,
        ...overrides.totals,
      },
      calculatedAt: new Date('2026-04-10T00:00:00Z'),
    });

    it('rounds money fields to whole lei, half up', () => {
      const result = makeResult({
        capitalGains: { netGains: 100.5, taxOwed: 10.5 },
        dividends: { grossTotal: 50.5 },
        healthContribution: { amountOwed: 9720.5, totalNonSalaryIncome: 150.49 },
        totals: { earlyFilingDiscount: 0.5 },
      });
      const xml = generateD212Xml(result, DUMMY_IDENTITY);

      const cg = cap14ByCode(xml, '2012');
      expect(attr(cg, 'str_venit_net_anual')).toBe('101'); // 100.5 -> 101
      expect(attr(cg, 'str_impozit_datorat_Ro')).toBe('11'); // 10.5 -> 11

      const ob = obligRealizat(xml);
      expect(attr(ob, 'cass_datorat')).toBe('9721'); // 9720.5 -> 9721
      expect(attr(ob, 'cass_ven_inv')).toBe('150'); // 150.49 -> 150
      expect(attr(ob, 'oblimpozit_real_bonif')).toBe('1'); // 0.5 -> 1

      const div = cap14ByCode(xml, '2018');
      expect(attr(div, 'str_venit_recalculat')).toBe('51'); // 50.5 -> 51
    });

    it('caps the dividend credit at RO tax due when WHT exceeds it (credit = roTax, dif = 0)', () => {
      // gross 1000 -> RO tax 100; WHT 250 paid abroad. Credit capped at 100, dif 0.
      const result = makeResult({
        dividends: { grossTotal: 1000, withholdingTaxPaid: 250 },
      });
      const xml = generateD212Xml(result, DUMMY_IDENTITY);
      const div = cap14ByCode(xml, '2018');
      expect(attr(div, 'str_venit_recalculat')).toBe('1000');
      expect(attr(div, 'str_impozit_datorat_Ro')).toBe('100');
      expect(attr(div, 'str_impozit_platit')).toBe('250');
      expect(attr(div, 'str_credit_fiscal')).toBe('100'); // min(100, 250)
      expect(attr(div, 'str_dif_impozit_datorat')).toBe('0'); // 100 - 100
    });

    it('handles zero dividends: the 2018 cap14 is still well-formed with zeros', () => {
      const result = makeResult({
        capitalGains: { netGains: 5000, taxOwed: 500 },
      });
      const xml = generateD212Xml(result, DUMMY_IDENTITY);
      const div = cap14ByCode(xml, '2018');
      expect(attr(div, 'str_venit_net_anual')).toBe('0');
      expect(attr(div, 'str_venit_recalculat')).toBe('0');
      expect(attr(div, 'str_impozit_datorat_Ro')).toBe('0');
      expect(attr(div, 'str_impozit_platit')).toBe('0');
      expect(attr(div, 'str_credit_fiscal')).toBe('0');
      expect(attr(div, 'str_dif_impozit_datorat')).toBe('0');
    });

    it('XML-escapes identity values containing &, <, >, "', () => {
      const result = makeResult();
      const tricky: D212Identity = {
        nume_c: 'A & B',
        initiala_c: '<X>',
        prenume_c: 'Q"R',
        cif: '1900101000000',
        cont_bancar: 'RO00 & 00',
        telefon_c: '0700000000',
      };
      const xml = generateD212Xml(result, tricky);
      expect(xml).toContain('nume_c="A &amp; B"');
      expect(xml).toContain('initiala_c="&lt;X&gt;"');
      expect(xml).toContain('prenume_c="Q&quot;R"');
      expect(xml).toContain('cont_bancar="RO00 &amp; 00"');
      // No raw special chars leaked into the identity attributes.
      expect(xml).not.toContain('nume_c="A & B"');
      expect(xml).not.toContain('initiala_c="<X>"');
    });

    it('produces well-formed XML: single d212 root, balanced, declaration first', () => {
      const result = makeResult({
        capitalGains: { netGains: 1234, taxOwed: 123 },
        dividends: { grossTotal: 500, withholdingTaxPaid: 20 },
      });
      const xml = generateD212Xml(result, DUMMY_IDENTITY);

      expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
      // Exactly one root open + close.
      expect(xml.match(/<d212\b/g)).toHaveLength(1);
      expect(xml.match(/<\/d212>/g)).toHaveLength(1);
      // Exactly two cap14 + one oblig_realizat, all self-closed.
      expect(xml.match(/<cap14\b/g)).toHaveLength(2);
      expect(xml.match(/<oblig_realizat\b/g)).toHaveLength(1);
      // Root closes last.
      expect(xml.endsWith('</d212>')).toBe(true);
      // No stray unescaped ampersands (every & must start an entity).
      expect(/&(?!amp;|lt;|gt;|quot;)/.test(xml)).toBe(false);
    });

    it('uses result.capitalGains.taxRate for the dividend RO tax, not a hardcoded 0.10', () => {
      // A 15% rate result must produce 15% dividend RO tax, proving the rate is
      // read from the result rather than a magic number.
      const result = makeResult({
        capitalGains: { taxRate: 0.15 },
        dividends: { grossTotal: 1000, withholdingTaxPaid: 0 },
        healthContribution: { amountOwed: 1500 },
      });
      const xml = generateD212Xml(result, DUMMY_IDENTITY);
      const div = cap14ByCode(xml, '2018');
      expect(attr(div, 'str_impozit_datorat_Ro')).toBe('150'); // 1000 * 0.15
      // cass_baza = amountOwed / rate = 1500 / 0.15 = 10000.
      expect(attr(obligRealizat(xml), 'cass_baza')).toBe('10000');
    });

    describe('input-domain guard (fail loud, never a silent wrong number)', () => {
      it('throws on a net capital-loss year instead of silently dropping the loss (qa DEFECT-1)', () => {
        // The engine clamps a net loss to netGains=0 and reports the magnitude in
        // `losses`. The pre-guard generator emitted str_pierdere_compensata="0",
        // silently dropping the loss into an incomplete declaration.
        const lossYear = makeResult({
          capitalGains: { netGains: 0, losses: 5000, taxOwed: 0 },
        });
        expect(() => generateD212Xml(lossYear, DUMMY_IDENTITY)).toThrow(/capital-loss year/i);
      });

      it('throws on a non-finite money field (NaN / Infinity), never emitting it', () => {
        expect(() =>
          generateD212Xml(makeResult({ capitalGains: { netGains: NaN } }), DUMMY_IDENTITY),
        ).toThrow(/finite number/i);
        expect(() =>
          generateD212Xml(makeResult({ dividends: { grossTotal: Infinity } }), DUMMY_IDENTITY),
        ).toThrow(/finite number/i);
        expect(() =>
          generateD212Xml(
            makeResult({ healthContribution: { totalNonSalaryIncome: NaN } }),
            DUMMY_IDENTITY,
          ),
        ).toThrow(/finite number/i);
      });

      it('throws on a negative money field (out of domain; the engine clamps, so this is corrupt input)', () => {
        expect(() =>
          generateD212Xml(makeResult({ capitalGains: { netGains: -1 } }), DUMMY_IDENTITY),
        ).toThrow(/must not be negative/i);
        expect(() =>
          generateD212Xml(
            makeResult({ dividends: { withholdingTaxPaid: -0.01 } }),
            DUMMY_IDENTITY,
          ),
        ).toThrow(/must not be negative/i);
      });

      it('throws on an out-of-range taxRate (0 divides-by-zero cass_baza; >1 is nonsense)', () => {
        expect(() =>
          generateD212Xml(makeResult({ capitalGains: { taxRate: 0 } }), DUMMY_IDENTITY),
        ).toThrow(/taxRate/i);
        expect(() =>
          generateD212Xml(makeResult({ capitalGains: { taxRate: 1.5 } }), DUMMY_IDENTITY),
        ).toThrow(/taxRate/i);
        expect(() =>
          generateD212Xml(makeResult({ capitalGains: { taxRate: NaN } }), DUMMY_IDENTITY),
        ).toThrow(/taxRate/i);
      });

      it('accepts a clean gain year with zero losses (the guard does not false-positive)', () => {
        const gainYear = makeResult({
          capitalGains: { netGains: 5000, losses: 0, taxOwed: 500 },
          dividends: { grossTotal: 100, withholdingTaxPaid: 10 },
          healthContribution: { amountOwed: 1000, totalNonSalaryIncome: 5100 },
        });
        expect(() => generateD212Xml(gainYear, DUMMY_IDENTITY)).not.toThrow();
      });
    });
  });
});
