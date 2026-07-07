/**
 * XSD shape lock for the past-year D212 generators (incomes 2023 + 2024).
 *
 * ANAF publishes one XML schema per filing season; the real ones are committed
 * as fixtures (fetched 2026-07-07 from
 * https://static.anaf.ro/static/10/Anaf/Declaratii_R/AplicatiiDec/):
 *
 * - `d212_v7_20240709.xsd`  -> season 2024 form (income 2023, OPANAF 6/2024)
 * - `d212_20250113.xsd`     -> season 2025 form (income 2024)
 *
 * Undeclared attributes fail XSD validation outright, and a missing
 * `use="required"` attribute does too, so this suite asserts for each past year:
 *
 * 1. every attribute the generator emits on `d212` / `oblig_realizat` / `cap14`
 *    is DECLARED in that season's schema (no attribute invented for the wrong
 *    generation, e.g. v11's `den_stat` leaking into a v9 file);
 * 2. every REQUIRED root attribute is present in the emitted XML;
 * 3. the category codes and country codes used are in that schema's enums.
 *
 * This is a structural lock, not a full XSD validation (that is DUKIntegrator's
 * job, run out-of-band on a generated file per the runbook in
 * `docs/d212-past-year-validation.md`); it catches the entire class of
 * "attribute from the wrong form generation" regressions in CI with zero new
 * dependencies.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { generateD212Xml, type D212Identity } from '../d212Xml.js';
import type { TaxCalculationResult, SecurityBreakdown } from '../../types/tax.js';

const fixtureDir = join(__dirname, '../../../../test-data/fixtures');

const IDENTITY: D212Identity = {
  nume_c: 'TEST',
  initiala_c: 'T',
  prenume_c: 'TEST',
  cif: '1900101000000',
  cont_bancar: 'RO00BANK0000000000000000',
  telefon_c: '0700000000',
  adresa_c: 'Str. Test Nr. 1, Arad',
};

/** Extracts the `<xs:complexType name="...">...</xs:complexType>` block. */
function complexType(xsd: string, name: string): string {
  const start = xsd.indexOf(`<xs:complexType name="${name}"`);
  expect(start, `complexType ${name} should exist in the schema`).toBeGreaterThan(-1);
  const end = xsd.indexOf('</xs:complexType>', start);
  return xsd.slice(start, end);
}

/** All declared attribute names of a complexType block. */
function declaredAttrs(block: string): Set<string> {
  return new Set(
    Array.from(block.matchAll(/<xs:attribute name="([^"]+)"/g)).map((m) => m[1]),
  );
}

/** The declared attribute names marked use="required". */
function requiredAttrs(block: string): Set<string> {
  return new Set(
    Array.from(
      block.matchAll(/<xs:attribute name="([^"]+)"[^>]*use="required"/g),
    ).map((m) => m[1]),
  );
}

/** Enumeration values of a named simpleType. */
function enumValues(xsd: string, name: string): Set<string> {
  const start = xsd.indexOf(`<xs:simpleType name="${name}"`);
  expect(start, `simpleType ${name} should exist in the schema`).toBeGreaterThan(-1);
  const end = xsd.indexOf('</xs:simpleType>', start);
  return new Set(
    Array.from(xsd.slice(start, end).matchAll(/<xs:enumeration value="([^"]+)"/g)).map(
      (m) => m[1],
    ),
  );
}

/** Attribute names present on an emitted XML element string. */
function emittedAttrs(element: string): string[] {
  return Array.from(element.matchAll(/ ([\w-]+)="/g))
    .map((m) => m[1])
    .filter((name) => name !== 'xmlns');
}

/** The root `<d212 ...>` open tag, the `<oblig_realizat .../>`, and all `<cap14 .../>`. */
function elements(xml: string): { root: string; oblig: string; cap14: string[] } {
  const root = /<d212\b[^>]*>/.exec(xml)![0];
  const oblig = /<oblig_realizat\b[^>]*\/>/.exec(xml)![0];
  const cap14 = xml.match(/<cap14\b[^>]*\/>/g) ?? [];
  return { root, oblig, cap14 };
}

/** Bracket-consistent synthetic engine result for the given past year. */
function resultFor(taxYear: 2023 | 2024): TaxCalculationResult {
  // CASS six-wage bracket: 1.800 lei (base 18.000) for 2023, 1.980 (19.800) for 2024.
  const cass = taxYear === 2023 ? 1800 : 1980;
  return {
    taxYearId: String(taxYear),
    capitalGains: {
      totalProceeds: 60000,
      totalCostBasis: 40000,
      netGains: 20000,
      losses: 0,
      taxRate: 0.1,
      taxOwed: 2000,
    },
    dividends: {
      grossTotal: 1000,
      taxBeforeCredit: 80,
      withholdingTaxPaid: 100,
      foreignTaxCredit: 80,
      taxOwed: 0,
      taxRate: 0.08,
    },
    healthContribution: {
      totalNonSalaryIncome: 21000,
      thresholdHit: 'six',
      amountOwed: cass,
    },
    totals: { totalTaxOwed: 2000 + cass, earlyFilingDiscount: 0, totalAfterDiscount: 2000 + cass },
    calculatedAt: new Date('2026-07-01T00:00:00Z'),
  };
}

const SECURITIES: SecurityBreakdown[] = [
  {
    isin: 'US0378331005',
    ticker: 'AAPL',
    securityName: 'Apple',
    totalBoughtShares: 0,
    totalSoldShares: 0,
    remainingShares: 0,
    weightedAvgCostLocal: 0,
    totalProceeds: 0,
    totalCostBasis: 0,
    realizedGainLoss: 20000,
    totalDividends: 1000,
    totalWithholdingTax: 100,
  },
];

const CASES = [
  { taxYear: 2023 as const, xsdFile: 'd212_v7_20240709.xsd', categEnum: 'Int_str_categ_venit2024SType' },
  { taxYear: 2024 as const, xsdFile: 'd212_20250113.xsd', categEnum: 'Int_str_categ_venitSType' },
];

describe.each(CASES)('D212 $taxYear XML vs the season XSD ($xsdFile)', ({ taxYear, xsdFile, categEnum }) => {
  const xsd = readFileSync(join(fixtureDir, xsdFile), 'utf8');
  const xml = generateD212Xml(resultFor(taxYear), IDENTITY, SECURITIES, taxYear);
  const { root, oblig, cap14 } = elements(xml);

  it('declares the v9 namespace (both past seasons share it, despite the v7 file name)', () => {
    expect(root).toContain('xmlns="mfp:anaf:dgti:d212:declaratie:v9"');
    expect(xsd).toContain('targetNamespace="mfp:anaf:dgti:d212:declaratie:v9"');
  });

  it('emits only attributes declared on D212Type, and every required one', () => {
    const block = complexType(xsd, 'D212Type');
    const declared = declaredAttrs(block);
    for (const name of emittedAttrs(root)) {
      expect(declared.has(name), `root attribute ${name} must exist in ${xsdFile}`).toBe(true);
    }
    const emitted = new Set(emittedAttrs(root));
    for (const name of requiredAttrs(block)) {
      expect(emitted.has(name), `required root attribute ${name} must be emitted`).toBe(true);
    }
  });

  it('emits only attributes declared on Oblig_realizatType (all optional there)', () => {
    const declared = declaredAttrs(complexType(xsd, 'Oblig_realizatType'));
    for (const name of emittedAttrs(oblig)) {
      expect(declared.has(name), `oblig_realizat attribute ${name} must exist in ${xsdFile}`).toBe(
        true,
      );
    }
  });

  it('emits only attributes declared on Cap14Type on every foreign-income row', () => {
    expect(cap14.length).toBeGreaterThan(0);
    const declared = declaredAttrs(complexType(xsd, 'Cap14Type'));
    for (const row of cap14) {
      for (const name of emittedAttrs(row)) {
        expect(declared.has(name), `cap14 attribute ${name} must exist in ${xsdFile}`).toBe(true);
      }
    }
  });

  it('uses category and country codes present in the schema nomenclators', () => {
    const categ = enumValues(xsd, categEnum);
    expect(categ.has('2012')).toBe(true);
    expect(categ.has('2018')).toBe(true);
    const countries = enumValues(xsd, 'Str_nomenclatorTariSType');
    for (const row of cap14) {
      const code = / str_stat_realiz_v="([^"]+)"/.exec(row)![1];
      expect(countries.has(code), `country ${code} must be in the nomenclator`).toBe(true);
    }
  });

  it('pins an_r to the season year (income year + 1) as the schema restricts it', () => {
    expect(root).toContain(`an_r="${taxYear + 1}"`);
    // The schema's an_r simple type floor equals the season year.
    expect(xsd).toContain(`IntInt${taxYear + 1}_2100SType`);
  });
});
