/**
 * Tests for the D212 v11 XML generator.
 *
 * Two layers:
 *
 * 1. Golden regression lock: parse the committed real 2025 Trading212 statement
 *    fixture, run it through the engine exactly like `pdfIntegration.test.ts`,
 *    generate the D212 XML, and assert the EXACT v11 attribute values. The
 *    session #144 spike proved the single-country baseline congruent with
 *    Dragos's ANAF-accepted filing; PR 3 splits foreign income by source country,
 *    so his US stocks stay one capital-gains row while his dividends split into a
 *    US row + an Irish (IE00B3XXRP09 Vanguard S&P 500) row. The Irish row carries
 *    0 WHT, so it correctly does NOT borrow the US dividend credit. This codifies
 *    the per-country split as a permanent regression lock.
 *
 * 2. Hermetic unit tests on the pure generator with synthetic
 *    `TaxCalculationResult` + `SecurityBreakdown[]` inputs (no engine): rounding,
 *    dividend credit cap, per-country split, omitted empty rows, XML escaping,
 *    well-formedness, and the fail-loud input-domain guards.
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
import { generateD212Xml, D212_SUPPORTED_TAX_YEAR, type D212Identity } from '../d212Xml.js';
import type { TaxCalculationResult, SecurityBreakdown } from '../../types/tax.js';

describe('D212_SUPPORTED_TAX_YEAR', () => {
  it('pins the generator to the 2025 income year the v11 structure was validated against', () => {
    expect(D212_SUPPORTED_TAX_YEAR).toBe(2025);
  });
});

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

/** Builds a SecurityBreakdown with sensible zero defaults; override any leaf. */
const makeSecurity = (overrides: Partial<SecurityBreakdown> = {}): SecurityBreakdown => ({
  isin: 'US0000000000',
  ticker: 'TST',
  securityName: 'Test Security',
  totalBoughtShares: 0,
  totalSoldShares: 0,
  remainingShares: 0,
  weightedAvgCostLocal: 0,
  totalProceeds: 0,
  totalCostBasis: 0,
  realizedGainLoss: 0,
  totalDividends: 0,
  totalWithholdingTax: 0,
  ...overrides,
});

/** A single US security whose amounts reconcile with a synthetic result. */
const usSecuritiesFor = (result: TaxCalculationResult): SecurityBreakdown[] => [
  makeSecurity({
    isin: 'US0000000000',
    realizedGainLoss: result.capitalGains.netGains,
    totalDividends: result.dividends.grossTotal,
    totalWithholdingTax: result.dividends.withholdingTaxPaid,
  }),
];

/** Extracts an attribute value from an XML element by name (first match). */
function attr(xml: string, name: string): string | undefined {
  const m = new RegExp(`\\b${name}="([^"]*)"`).exec(xml);
  return m ? m[1] : undefined;
}

/**
 * Returns the `<cap14 .../>` element for the given (str_categ_venit,
 * str_stat_realiz_v) pair. Uses lookaheads so it matches regardless of attribute
 * order, and asserts the row is present.
 */
function cap14By(xml: string, code: string, country: string): string {
  const re = new RegExp(
    `<cap14\\b(?=[^>]*\\bstr_categ_venit="${code}")(?=[^>]*\\bstr_stat_realiz_v="${country}")[^>]*/>`,
  );
  const m = re.exec(xml);
  expect(m, `cap14 with categ=${code} country=${country} should be present`).not.toBeNull();
  return m![0];
}

/** All `<cap14 .../>` elements in document order. */
function allCap14(xml: string): string[] {
  return xml.match(/<cap14\b[^>]*\/>/g) ?? [];
}

/** Returns the substring for the single `<oblig_realizat .../>` element. */
function obligRealizat(xml: string): string {
  const m = /<oblig_realizat\b[^>]*\/>/.exec(xml);
  expect(m, 'oblig_realizat element should be present').not.toBeNull();
  return m![0];
}

describe('D212 v11 XML generator', () => {
  describe('golden regression lock (real 2025 statement -> engine -> per-country XML)', () => {
    const parsed = parseTrading212AnnualStatement(
      loadFixture('annual-statement-2025-pages.json'),
    );
    const usdDaily2025: Record<string, number> = JSON.parse(
      readFileSync(join(fixtureDir, 'bnr-usd-2025-daily.json'), 'utf8'),
    );
    const { taxResult, securities } = calculateTaxesFromPdf(
      parsed,
      romaniaTaxConfig,
      USD_ANNUAL_AVG_2025,
      usdDaily2025,
    );
    const xml = generateD212Xml(taxResult, DUMMY_IDENTITY, securities);

    it('declares the v11 namespace on the d212 root', () => {
      expect(xml).toContain('xmlns="mfp:anaf:dgti:d212:declaratie:v11"');
      expect(xml.startsWith('<?xml')).toBe(true);
    });

    it('emits three cap14 rows: one US capital-gains + US and IE dividend rows', () => {
      const rows = allCap14(xml);
      expect(rows).toHaveLength(3);
      // US rows come before IE (sorted by total income), gains before dividends.
      expect(rows[0]).toContain('str_categ_venit="2012"');
      expect(rows[0]).toContain('str_stat_realiz_v="US"');
      expect(rows[1]).toContain('str_categ_venit="2018"');
      expect(rows[1]).toContain('str_stat_realiz_v="US"');
      expect(rows[2]).toContain('str_categ_venit="2018"');
      expect(rows[2]).toContain('str_stat_realiz_v="IE"');
    });

    it('cap14[2012,US] capital gains: net == recalculat == 187292, tax == dif == 18729', () => {
      const row = cap14By(xml, '2012', 'US');
      expect(attr(row, 'str_venit_net_anual')).toBe('187292');
      expect(attr(row, 'str_venit_recalculat')).toBe('187292');
      expect(attr(row, 'str_impozit_datorat_Ro')).toBe('18729');
      expect(attr(row, 'str_dif_impozit_datorat')).toBe('18729');
      expect(attr(row, 'str_impozit_platit')).toBe('0');
      expect(attr(row, 'str_credit_fiscal')).toBe('0');
    });

    it('cap14[2018,US] dividends: recalculat 115, Ro tax 11, platit 11, credit 11, dif 0', () => {
      const row = cap14By(xml, '2018', 'US');
      expect(attr(row, 'str_venit_net_anual')).toBe('0');
      expect(attr(row, 'str_venit_recalculat')).toBe('115');
      expect(attr(row, 'str_impozit_datorat_Ro')).toBe('11');
      expect(attr(row, 'str_impozit_platit')).toBe('11');
      expect(attr(row, 'str_credit_fiscal')).toBe('11');
      expect(attr(row, 'str_dif_impozit_datorat')).toBe('0');
    });

    it('cap14[2018,IE] Irish ETF dividends: recalculat 515, Ro tax 51, platit 0, credit 0, dif 51 (no US credit borrowed)', () => {
      const row = cap14By(xml, '2018', 'IE');
      expect(attr(row, 'str_venit_net_anual')).toBe('0');
      expect(attr(row, 'str_venit_recalculat')).toBe('515');
      expect(attr(row, 'str_impozit_datorat_Ro')).toBe('51');
      expect(attr(row, 'str_impozit_platit')).toBe('0'); // Ireland distributions: 0 WHT
      expect(attr(row, 'str_credit_fiscal')).toBe('0'); // so 0 credit, not borrowed from US
      expect(attr(row, 'str_dif_impozit_datorat')).toBe('51');
    });

    it('oblig_realizat: CASS 9720 / baza 97200 / ven_inv 187921, income-tax total 18780 (sum of rows), bonif 563, dif_de_plata 28500', () => {
      const row = obligRealizat(xml);
      expect(attr(row, 'cass_datorat')).toBe('9720');
      expect(attr(row, 'cass_baza')).toBe('97200');
      expect(attr(row, 'cass_ven_inv')).toBe('187921');
      // 18729 (US gains) + 0 (US div) + 51 (IE div) = 18780.
      expect(attr(row, 'oblimpoz_real_total')).toBe('18780');
      expect(attr(row, 'oblimpozit_real_bonif')).toBe('563');
      // 18780 income tax + 9720 CASS = 28500.
      expect(attr(row, 'dif_de_plata')).toBe('28500');
    });

    it('is internally consistent: oblimpoz_real_total equals the sum of cap14 difs, dif_de_plata = income tax + CASS', () => {
      const rows = allCap14(xml);
      const sumDif = rows.reduce((s, r) => s + Number(attr(r, 'str_dif_impozit_datorat')), 0);
      const ob = obligRealizat(xml);
      expect(Number(attr(ob, 'oblimpoz_real_total'))).toBe(sumDif);
      expect(Number(attr(ob, 'dif_de_plata'))).toBe(
        Number(attr(ob, 'oblimpoz_real_total')) + Number(attr(ob, 'cass_datorat')),
      );
    });

    it('keeps the verbatim Romanian category label + both confirmed country names', () => {
      expect(xml).toContain(
        'den_categ_venit="Transferul titlurilor de valoare și orice alte operațiuni cu instrumente financiare, inclusiv instrumente financiare derivate, precum și transferul aurului financiar"',
      );
      expect(xml).toContain('den_stat="Statele Unite ale Americii"');
      expect(xml).toContain('den_stat="Irlanda"');
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
        taxBeforeCredit: 0,
        withholdingTaxPaid: 0,
        foreignTaxCredit: 0,
        taxOwed: 0,
        taxRate: 0.1,
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

    it('rounds money fields to whole lei, half up; gains tax is per-row venit*rate', () => {
      const result = makeResult({
        capitalGains: { netGains: 100.5, taxOwed: 10.5 },
        dividends: { grossTotal: 50.5 },
        healthContribution: { amountOwed: 9720.5, totalNonSalaryIncome: 150.49 },
        totals: { earlyFilingDiscount: 0.5 },
      });
      const xml = generateD212Xml(result, DUMMY_IDENTITY, usSecuritiesFor(result));

      const cg = cap14By(xml, '2012', 'US');
      expect(attr(cg, 'str_venit_net_anual')).toBe('101'); // 100.5 -> 101
      // Per-row tax = round(gain * rate) = round(100.5 * 0.10) = round(10.05) = 10
      // (derived per row, not taken from the synthetic result.taxOwed of 10.5).
      expect(attr(cg, 'str_impozit_datorat_Ro')).toBe('10');

      const ob = obligRealizat(xml);
      expect(attr(ob, 'cass_datorat')).toBe('9721'); // 9720.5 -> 9721
      expect(attr(ob, 'cass_ven_inv')).toBe('150'); // 150.49 -> 150
      expect(attr(ob, 'oblimpozit_real_bonif')).toBe('1'); // 0.5 -> 1

      const div = cap14By(xml, '2018', 'US');
      expect(attr(div, 'str_venit_recalculat')).toBe('51'); // 50.5 -> 51
    });

    it('caps the dividend credit at RO tax due when WHT exceeds it (credit = roTax, dif = 0)', () => {
      // gross 1000 -> RO tax 100; WHT 250 paid abroad. Credit capped at 100, dif 0.
      const result = makeResult({
        dividends: { grossTotal: 1000, withholdingTaxPaid: 250 },
      });
      const xml = generateD212Xml(result, DUMMY_IDENTITY, usSecuritiesFor(result));
      const div = cap14By(xml, '2018', 'US');
      expect(attr(div, 'str_venit_recalculat')).toBe('1000');
      expect(attr(div, 'str_impozit_datorat_Ro')).toBe('100');
      expect(attr(div, 'str_impozit_platit')).toBe('250');
      expect(attr(div, 'str_credit_fiscal')).toBe('100'); // min(100, 250)
      expect(attr(div, 'str_dif_impozit_datorat')).toBe('0'); // 100 - 100
    });

    it('taxes dividends at dividends.taxRate, not capitalGains.taxRate (no second source)', () => {
      // 2023/24 dividends are 8% while capital gains are a different rate. The
      // dividend row must scale by its own rate; if it borrowed capitalGains.taxRate
      // the RO tax would be wrong (the killed second-source recompute, Bug #16).
      const result = makeResult({
        capitalGains: { netGains: 1000, taxOwed: 160, taxRate: 0.16 },
        dividends: { grossTotal: 1000, withholdingTaxPaid: 0, taxRate: 0.08 },
      });
      const xml = generateD212Xml(result, DUMMY_IDENTITY, usSecuritiesFor(result));

      const cg = cap14By(xml, '2012', 'US');
      expect(attr(cg, 'str_impozit_datorat_Ro')).toBe('160'); // 1000 * 0.16

      const div = cap14By(xml, '2018', 'US');
      expect(attr(div, 'str_impozit_datorat_Ro')).toBe('80'); // 1000 * 0.08, NOT 0.16
      expect(attr(div, 'str_dif_impozit_datorat')).toBe('80'); // no WHT, full tax due
    });

    it('omits the dividend cap14 row entirely when there are no dividends', () => {
      const result = makeResult({
        capitalGains: { netGains: 5000, taxOwed: 500 },
      });
      const xml = generateD212Xml(result, DUMMY_IDENTITY, usSecuritiesFor(result));
      // Only the capital-gains row; no empty 2018 dividends row.
      expect(xml).not.toContain('str_categ_venit="2018"');
      const cg = cap14By(xml, '2012', 'US');
      expect(attr(cg, 'str_venit_net_anual')).toBe('5000');
      expect(allCap14(xml)).toHaveLength(1);
    });

    it('splits dividends by source country and credits WHT per country (Irish 0-WHT does not borrow the US credit)', () => {
      const result = makeResult({
        dividends: { grossTotal: 600, withholdingTaxPaid: 10 },
      });
      const securities = [
        makeSecurity({ isin: 'US0378331005', totalDividends: 100, totalWithholdingTax: 10 }),
        makeSecurity({ isin: 'IE00B3XXRP09', totalDividends: 500, totalWithholdingTax: 0 }),
      ];
      const xml = generateD212Xml(result, DUMMY_IDENTITY, securities);

      const us = cap14By(xml, '2018', 'US');
      expect(attr(us, 'str_venit_recalculat')).toBe('100');
      expect(attr(us, 'str_impozit_datorat_Ro')).toBe('10');
      expect(attr(us, 'str_credit_fiscal')).toBe('10'); // US WHT credited
      expect(attr(us, 'str_dif_impozit_datorat')).toBe('0');

      const ie = cap14By(xml, '2018', 'IE');
      expect(attr(ie, 'str_venit_recalculat')).toBe('500');
      expect(attr(ie, 'str_impozit_datorat_Ro')).toBe('50');
      expect(attr(ie, 'str_credit_fiscal')).toBe('0'); // 0 WHT, no credit borrowed
      expect(attr(ie, 'str_dif_impozit_datorat')).toBe('50');
      expect(xml).toContain('den_stat="Irlanda"');
    });

    it('skips zero-income securities (held-but-not-sold) without requiring a country', () => {
      // A buy-and-hold position with no realized gain and no dividends contributes
      // no declaration row and must not fail loud even if its ISIN is unresolvable.
      const result = makeResult({ capitalGains: { netGains: 5000, taxOwed: 500 } });
      const securities = [
        makeSecurity({ isin: 'US0378331005', realizedGainLoss: 5000 }),
        makeSecurity({ isin: '', ticker: 'HOLD', realizedGainLoss: 0 }),
      ];
      const xml = generateD212Xml(result, DUMMY_IDENTITY, securities);
      expect(allCap14(xml)).toHaveLength(1);
      expect(attr(cap14By(xml, '2012', 'US'), 'str_venit_net_anual')).toBe('5000');
    });

    it('orders countries deterministically, breaking ties by country code', () => {
      // Two countries with identical total income exercise the code tie-break, so
      // the emitted XML is stable across runs.
      const result = makeResult({ capitalGains: { netGains: 2000, taxOwed: 200 } });
      const securities = [
        makeSecurity({ isin: 'US0378331005', realizedGainLoss: 1000 }),
        makeSecurity({ isin: 'IE00B3XXRP09', realizedGainLoss: 1000 }),
      ];
      const xml = generateD212Xml(result, DUMMY_IDENTITY, securities);
      const rows = allCap14(xml);
      expect(rows).toHaveLength(2);
      // Tie on total income (1000 each) -> ascending country code: IE before US.
      expect(rows[0]).toContain('str_stat_realiz_v="IE"');
      expect(rows[1]).toContain('str_stat_realiz_v="US"');
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
      // No income -> no cap14 rows; reconcile(0, 0) passes with an empty breakdown.
      const xml = generateD212Xml(result, tricky, []);
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
      const xml = generateD212Xml(result, DUMMY_IDENTITY, usSecuritiesFor(result));

      expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
      // Exactly one root open + close.
      expect(xml.match(/<d212\b/g)).toHaveLength(1);
      expect(xml.match(/<\/d212>/g)).toHaveLength(1);
      // One US gains + one US dividends row + one oblig_realizat, all self-closed.
      expect(xml.match(/<cap14\b/g)).toHaveLength(2);
      expect(xml.match(/<oblig_realizat\b/g)).toHaveLength(1);
      // Root closes last.
      expect(xml.endsWith('</d212>')).toBe(true);
      // No stray unescaped ampersands (every & must start an entity).
      expect(/&(?!amp;|lt;|gt;|quot;)/.test(xml)).toBe(false);
    });

    it('reads the tax rates from the result, not a hardcoded 0.10', () => {
      // A 15% rate result must produce 15% dividend RO tax, proving the rate is
      // read from the result rather than a magic number. The dividend rate is its
      // own field; cass_baza is recovered via capitalGains.taxRate.
      const result = makeResult({
        capitalGains: { taxRate: 0.15 },
        dividends: { grossTotal: 1000, withholdingTaxPaid: 0, taxRate: 0.15 },
        healthContribution: { amountOwed: 1500 },
      });
      const xml = generateD212Xml(result, DUMMY_IDENTITY, usSecuritiesFor(result));
      const div = cap14By(xml, '2018', 'US');
      expect(attr(div, 'str_impozit_datorat_Ro')).toBe('150'); // 1000 * 0.15
      // cass_baza = amountOwed / capitalGains.taxRate = 1500 / 0.15 = 10000.
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
        expect(() => generateD212Xml(lossYear, DUMMY_IDENTITY, [])).toThrow(/capital-loss year/i);
      });

      it('throws on a non-finite money field (NaN / Infinity), never emitting it', () => {
        expect(() =>
          generateD212Xml(makeResult({ capitalGains: { netGains: NaN } }), DUMMY_IDENTITY, []),
        ).toThrow(/finite number/i);
        expect(() =>
          generateD212Xml(makeResult({ dividends: { grossTotal: Infinity } }), DUMMY_IDENTITY, []),
        ).toThrow(/finite number/i);
        expect(() =>
          generateD212Xml(
            makeResult({ healthContribution: { totalNonSalaryIncome: NaN } }),
            DUMMY_IDENTITY,
            [],
          ),
        ).toThrow(/finite number/i);
      });

      it('throws on a negative money field (out of domain; the engine clamps, so this is corrupt input)', () => {
        expect(() =>
          generateD212Xml(makeResult({ capitalGains: { netGains: -1 } }), DUMMY_IDENTITY, []),
        ).toThrow(/must not be negative/i);
        expect(() =>
          generateD212Xml(
            makeResult({ dividends: { withholdingTaxPaid: -0.01 } }),
            DUMMY_IDENTITY,
            [],
          ),
        ).toThrow(/must not be negative/i);
      });

      it('throws on an out-of-range taxRate (0 divides-by-zero cass_baza; >1 is nonsense)', () => {
        expect(() =>
          generateD212Xml(makeResult({ capitalGains: { taxRate: 0 } }), DUMMY_IDENTITY, []),
        ).toThrow(/taxRate/i);
        expect(() =>
          generateD212Xml(makeResult({ capitalGains: { taxRate: 1.5 } }), DUMMY_IDENTITY, []),
        ).toThrow(/taxRate/i);
        expect(() =>
          generateD212Xml(makeResult({ capitalGains: { taxRate: NaN } }), DUMMY_IDENTITY, []),
        ).toThrow(/taxRate/i);
      });

      it('throws on an out-of-range dividends.taxRate (consumed for the dividend rows)', () => {
        expect(() =>
          generateD212Xml(makeResult({ dividends: { taxRate: 0 } }), DUMMY_IDENTITY, []),
        ).toThrow(/dividends\.taxRate/i);
        expect(() =>
          generateD212Xml(makeResult({ dividends: { taxRate: 1.5 } }), DUMMY_IDENTITY, []),
        ).toThrow(/dividends\.taxRate/i);
        expect(() =>
          generateD212Xml(makeResult({ dividends: { taxRate: NaN } }), DUMMY_IDENTITY, []),
        ).toThrow(/dividends\.taxRate/i);
      });

      it('accepts a clean gain year with zero losses (the guard does not false-positive)', () => {
        const gainYear = makeResult({
          capitalGains: { netGains: 5000, losses: 0, taxOwed: 500 },
          dividends: { grossTotal: 100, withholdingTaxPaid: 10 },
          healthContribution: { amountOwed: 1000, totalNonSalaryIncome: 5100 },
        });
        expect(() =>
          generateD212Xml(gainYear, DUMMY_IDENTITY, usSecuritiesFor(gainYear)),
        ).not.toThrow();
      });
    });

    describe('per-country guards (PR 3)', () => {
      it('throws when the breakdown does not reconcile with the engine totals', () => {
        // Engine taxed 10000 of gains but the breakdown attributes none of it
        // (e.g. overview-sourced gains): refuse rather than emit a contradictory split.
        const result = makeResult({ capitalGains: { netGains: 10000, taxOwed: 1000 } });
        expect(() => generateD212Xml(result, DUMMY_IDENTITY, [])).toThrow(/reconcile/i);
      });

      it('throws on an unmapped source country (only US/IE confirmed)', () => {
        const result = makeResult({ capitalGains: { netGains: 5000, taxOwed: 500 } });
        const securities = [makeSecurity({ isin: 'DE000BASF111', realizedGainLoss: 5000 })];
        expect(() => generateD212Xml(result, DUMMY_IDENTITY, securities)).toThrow(
          /not yet supported|DE/i,
        );
      });

      it('throws when a security ISIN has no usable country prefix', () => {
        const result = makeResult({ capitalGains: { netGains: 5000, taxOwed: 500 } });
        const securities = [makeSecurity({ isin: '', ticker: 'XXX', realizedGainLoss: 5000 })];
        expect(() => generateD212Xml(result, DUMMY_IDENTITY, securities)).toThrow(
          /determine the source country/i,
        );
      });

      it('throws when a source country has a net capital loss within an overall gain year', () => {
        // Overall gain 5000 (US +6000, IE -1000) reconciles, but the IE country
        // loss needs the deferred pierdere-compensata representation.
        const result = makeResult({ capitalGains: { netGains: 5000, losses: 0, taxOwed: 500 } });
        const securities = [
          makeSecurity({ isin: 'US0378331005', realizedGainLoss: 6000 }),
          makeSecurity({ isin: 'IE00B3XXRP09', realizedGainLoss: -1000 }),
        ];
        expect(() => generateD212Xml(result, DUMMY_IDENTITY, securities)).toThrow(
          /net capital loss|loss compensation|compensat/i,
        );
      });
    });
  });
});
