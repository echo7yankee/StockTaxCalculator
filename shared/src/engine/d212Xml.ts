/**
 * Declaratia Unica (D212) XML generator for the foreign-source
 * investment-income case (Romania), income years 2023 / 2024 / 2025.
 *
 * Turns a {@link TaxCalculationResult} (the engine's output for a parsed broker
 * statement) plus its per-security {@link SecurityBreakdown}[] into a D212 XML
 * string in the ANAF schema for the requested income year, ready to be loaded
 * into that season's validator (DUKIntegrator / soft J) for validation +
 * e-filing.
 *
 * THREE form generations are modelled, one per supported income year. ANAF
 * publishes a distinct form package per filing season and a late/never-filed
 * declaration for income year N is filed on the season-(N+1) form, so each year
 * gets its own emit profile (see {@link D212_PROFILES}):
 *
 * - Income 2025 -> season-2026 form, namespace `mfp:anaf:dgti:d212:declaratie:v11`.
 *   Modelled field-for-field on Dragos's real, ANAF-SPV-accepted April 2026
 *   filing (session #144 spike: structure 100% match; dividends + CASS exact;
 *   the only value differences were the engine's per-trade-date BNR methodology
 *   on capital gains, which is intentional). See
 *   `investax-docs/d212-prefill-spike-result.md`.
 * - Income 2024 -> season-2025 form (OPANAF 7015/2024 cycle; the currently
 *   published package is per OPANAF 1929/30.07.2025), namespace v9, XSD
 *   `d212_20250113.xsd`, `an_r` fixed to 2025. Field set + validation formulas
 *   read from ANAF's own `structura_D212_2025_v1.0.3_01082025.pdf`.
 * - Income 2023 -> season-2024 form (OPANAF 6/2024), namespace v9 (the file is
 *   named `d212_v7_20240709.xsd` but declares the v9 namespace), `an_r` fixed to
 *   2024. Field set + formulas from `structura_declaratieUnica_2024_v1.0.0`.
 *
 * Both past-year XSDs are committed under `test-data/fixtures/` and a shape test
 * asserts every emitted attribute exists in that year's schema.
 *
 * Load-bearing per-year differences (all read off the official structure docs,
 * NOT guessed):
 * - The v9 forms have NO `den_stat` / `den_categ_venit` attributes (undeclared
 *   attributes fail XSD validation, so they are omitted); the authoritative
 *   country field is the 2-letter `str_stat_realiz_v` code. The v11 DEN_STAT
 *   country-name gate therefore applies ONLY to the v11 path.
 * - v9 date attributes are `str_data_incep` / `str_data_sf` (v11 renamed them
 *   `str_data_inceput` / `str_data_sfarsit`).
 * - v9 dividend rows carry `str_venit_brut` = gross and `str_venit_net_anual` =
 *   gross (rd.3 = rd.1 - rd.2, no deductible costs on dividends); the accepted
 *   v11 filing instead has `str_venit_net_anual="0"` + recalculat = gross.
 * - Neither past cycle had a PF early-filing bonificatie (the OUG 107/2024 3%
 *   was firms-only; the PF bonificatie returned only with OUG 8/2026 for 2025
 *   incomes), so the v9 bonificatie flags (`bifa110` in 2024-season, `bifa18` in
 *   2025-season) are 0 and the `obl*_real_bonif` attributes are omitted. A
 *   result carrying a positive earlyFilingDiscount for a past year is rejected.
 * - `totalPlata_A` is the CONTROL SUM: the digit sum of the filer's CNP, per
 *   both season structure docs ("Suma de control: totalPlata_A = suma
 *   caracterelor ce compun codul numeric personal"). This also resolved the old
 *   v11 TODO: the unexplained `totalPlata_A="33"` in the accepted filing is
 *   exactly that CNP digit sum, so v11 now emits the digit sum too.
 * - `bifa_cass_real` is the CASS bracket option (1 = 6-wage, 2 = 12-wage,
 *   3 = 24-wage base) and `cass_baza` must equal that bracket's base for the
 *   income year's minimum wage (3.000 lei for 2023, 3.300 for 2024, 4.050 for
 *   2025). It is DERIVED from the engine's CASS amount against TAX_YEARS (the
 *   previous v11 code hardcoded '3', which was only correct for the golden
 *   filing's bracket).
 * - v9 identity is a single `nume_c` = "Nume Initiala Prenume" plus a REQUIRED
 *   `adresa_c`; v11 splits the name and carries no address.
 *
 * Scope notes (unchanged from the v11-only generator):
 * - Inputs are guarded; anything out of domain fails loud (never a silently
 *   wrong legal declaration). Loss years and per-country net losses are
 *   rejected pending the pierdere-reportata/compensata representation.
 * - PER-SOURCE-COUNTRY split: one `cap14` per (country, category) from the
 *   ISIN prefix; foreign withholding tax is credited per country.
 * - The numbers carried are the engine's PER-TRADE-DATE figures (art. 96).
 * - This is an ORIGINAL declaration (d_rec=0, rectif=0, bifa_conformare=0): a
 *   never-filed past year files a late ORIGINAL on that year's form. A user who
 *   already filed a D212 for that year needs a rectificativa, which this
 *   generator cannot produce (it would have to merge income sections it did not
 *   compute); the UI carries that caveat.
 * - No engine math happens here.
 */

import type { TaxCalculationResult, SecurityBreakdown } from '../types/tax.js';
import { getTaxYearConfig, isEarlyFilingDiscountAvailable, type TaxYearConfig } from '../taxRules/taxYears.js';

/**
 * Filer identity for the D212 root element (user-supplied PII).
 *
 * - `cif` is the Romanian CNP (cod numeric personal), 13 digits, pattern
 *   `[1-9]\d{12}`. Also feeds the `totalPlata_A` control digit sum.
 * - `cont_bancar` is the refund IBAN.
 * - `nume_c` / `initiala_c` / `prenume_c` are surname / middle initial / given
 *   name; `telefon_c` is the contact phone. All are XML-escaped on emit.
 * - `adresa_c` is the filer's address: REQUIRED by the 2023/2024 form versions
 *   (the v11 web-form era form carries no address attribute, so it is unused
 *   for 2025).
 */
export interface D212Identity {
  nume_c: string;
  initiala_c: string;
  prenume_c: string;
  cif: string;
  cont_bancar: string;
  telefon_c: string;
  adresa_c?: string;
}

/**
 * Romanian foreign-income category code for "transferul titlurilor de valoare"
 * (capital gains from securities). Its `den_categ_venit` label is reproduced
 * verbatim, with diacritics, from the accepted filing (v11 only; the v9 schemas
 * have no label attribute). Codes 2012/2018 are confirmed present in the
 * `str_categ_venit` nomenclator of all three form generations.
 */
const CATEG_CODE_CAPITAL_GAINS = '2012';
const CATEG_LABEL_CAPITAL_GAINS =
  'Transferul titlurilor de valoare și orice alte operațiuni cu instrumente financiare, inclusiv instrumente financiare derivate, precum și transferul aurului financiar';

/** Romanian foreign-income category code + label for dividends. */
const CATEG_CODE_DIVIDENDS = '2018';
const CATEG_LABEL_DIVIDENDS = 'Dividende';

/**
 * ISO 3166-1 alpha-2 country code -> Romanian `den_stat` name for the D212
 * (v11 ONLY; the v9 past-year schemas carry no den_stat attribute).
 *
 * Deliberately SMALL. `US` is GROUND TRUTH: the exact string from Dragos's
 * ANAF-SPV-accepted April 2026 filing. `IE` ("Irlanda") is the standard
 * unambiguous name and the only other country in the golden fixture (Irish-
 * domiciled UCITS ETFs, the dominant non-US holding for RO retail investors).
 *
 * We do NOT seed this from the customs/ISO nomenclator, because those names
 * differ from D212's: the customs table lists US as "S.U.A., inclusiv Porto Rico"
 * rather than the filing's "Statele Unite ale Americii". So we emit only a name
 * we can stand behind and FAIL LOUD (see {@link denStat}) on every other
 * country. The authoritative routing field is the 2-letter `str_stat_realiz_v`
 * code, taken verbatim from the ISIN prefix, which is always correct; `den_stat`
 * is the human-readable label DUKIntegrator validates. Expanding this table is
 * gated on confirming each name against ANAF's DUKIntegrator nomenclator (PR 5).
 */
const DEN_STAT: Record<string, string> = {
  US: 'Statele Unite ale Americii',
  IE: 'Irlanda',
};

/**
 * The income tax years this generator models, oldest first. 2025 is validated
 * against an accepted filing; 2023/2024 are built from ANAF's published XSD +
 * structure docs and ship behind an explicit "validate in DUKIntegrator/SPV"
 * caveat until a generated file passes ANAF's own validator. Tax year 2022 and
 * earlier are out of scope (pre-CMP cost-method territory, Legea 142/2022).
 */
export const D212_SUPPORTED_TAX_YEARS = [2023, 2024, 2025] as const;

/**
 * The latest (and spike-validated) income year. Kept as the default for
 * {@link generateD212Xml} and for consumers that need "the current D212 year"
 * (e.g. the quick-calc API response).
 */
export const D212_SUPPORTED_TAX_YEAR = 2025;

/** Whether {@link generateD212Xml} can produce a declaration for this income year. */
export function isD212SupportedTaxYear(year: number): boolean {
  return (D212_SUPPORTED_TAX_YEARS as readonly number[]).includes(year);
}

/**
 * Statutory CASS rate (Codul Fiscal art. 170): CASS datorata = 10% x the
 * bracket base, all supported years. Used to recover `cass_baza` from the
 * engine's CASS amount; independent of the income-tax rates (which vary by
 * year), so it must NOT be conflated with capitalGains.taxRate.
 */
const CASS_RATE = 0.1;

/** One emit profile per supported income year (see the module doc). */
interface D212YearProfile {
  /** Income year the declaration covers. */
  taxYear: number;
  /** `an_r` (anul de raportare) = the filing-season year, income year + 1. */
  anR: number;
  /** Schema generation: drives the per-variant attribute sets below. */
  variant: 'v9-2024' | 'v9-2025' | 'v11';
  /** Root namespace. Both past seasons declare v9 (despite the v7 file name). */
  xmlns: string;
}

const D212_PROFILES: Record<number, D212YearProfile> = {
  2023: { taxYear: 2023, anR: 2024, variant: 'v9-2024', xmlns: 'mfp:anaf:dgti:d212:declaratie:v9' },
  2024: { taxYear: 2024, anR: 2025, variant: 'v9-2025', xmlns: 'mfp:anaf:dgti:d212:declaratie:v9' },
  2025: { taxYear: 2025, anR: 2026, variant: 'v11', xmlns: 'mfp:anaf:dgti:d212:declaratie:v11' },
};

/** Whole-lei integer, round half up (D212 money fields are integers). */
function lei(n: number): number {
  return Math.round(n);
}

/**
 * Asserts a consumed numeric field is finite (not NaN/Infinity). A non-finite
 * value means the caller handed us a corrupt or hand-built result this generator
 * cannot faithfully represent; we fail loud rather than emit it into a legal
 * declaration.
 */
function assertFinite(value: number, field: string): void {
  if (!Number.isFinite(value)) {
    throw new Error(`generateD212Xml: ${field} must be a finite number, got ${value}`);
  }
}

/**
 * Asserts a consumed result field is a finite, non-negative money amount. D212
 * money fields are unsigned, so a non-finite or negative value means corrupt
 * input. The engine clamps and rounds, so these throws are unreachable from real
 * engine output; they guard the wired path (PR 4) against a corrupt result.
 */
function assertMoney(value: number, field: string): void {
  assertFinite(value, field);
  if (value < 0) {
    throw new Error(`generateD212Xml: ${field} must not be negative, got ${value}`);
  }
}

/**
 * Reconciliation guard. The per-security breakdown must account for the same
 * income the engine taxed, or the per-country attribution is untrustworthy: e.g.
 * when the per-row sell trades are unit-inconsistent (mixed currencies, or trade
 * currency != overview currency) the engine sources capital gains from the
 * statement overview total, so the sum of per-security `realizedGainLoss` is a
 * different basis than `capitalGains.netGains`. Tolerates rounding drift (each
 * per-security amount is rounded to the bani; 1% relative with a 2-leu floor),
 * fails loud on a real mismatch rather than emitting a split that contradicts the
 * declared totals. This is the "amounts are RON / reconcile" check from the
 * spike's open-item #2, made concrete.
 */
function reconcile(actual: number, expected: number, what: string): void {
  const tol = Math.max(2, Math.abs(expected) * 0.01);
  if (Math.abs(actual - expected) > tol) {
    throw new Error(
      `generateD212Xml: the per-security ${what} sum (${actual.toFixed(2)}) does not ` +
        `reconcile with the engine total (${expected.toFixed(2)}), so income cannot be ` +
        `attributed to source countries. This statement must be filed manually.`,
    );
  }
}

/**
 * Extracts the ISO 3166-1 alpha-2 source country from a security's ISIN (the
 * first two letters). Throws if the ISIN has no usable country prefix
 * (missing/short/non-alphabetic), since that income cannot be placed under a
 * country in the declaration.
 */
function isoCountry(isin: string): string {
  const code = (isin || '').slice(0, 2).toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) {
    throw new Error(
      `generateD212Xml: cannot determine the source country from ISIN "${isin}". ` +
        `This statement must be filed manually.`,
    );
  }
  // cap14 is the FOREIGN-income section, and the D212 country nomenclator has no
  // RO entry (verified against both season XSDs): Romanian-source income (e.g.
  // BVB securities via IBKR) must not be declared there at all. XS (international
  // eurobond ISINs) and EU are ISIN prefixes without a nomenclator country. The
  // v11 path already rejects these structurally via the DEN_STAT gate; this keeps
  // the past-year paths equally loud instead of failing later in DUKIntegrator
  // with a raw schema error (qa #239 finding 1).
  if (code === 'RO' || code === 'XS' || code === 'EU') {
    throw new Error(
      `generateD212Xml: ISIN "${isin}" (${code}) cannot be declared as foreign income ` +
        `in cap14${code === 'RO' ? ' (Romanian-source income is not "venituri din străinătate")' : ''}. ` +
        `This statement must be filed manually.`,
    );
  }
  return code;
}

/**
 * Romanian `den_stat` name for a country code; fails loud on an unmapped country
 * (see {@link DEN_STAT}) rather than guessing a name into a legal declaration.
 * v11 only; the v9 schemas have no den_stat attribute, so past years do not
 * consult this table.
 */
function denStat(code: string, isinSample: string): string {
  const name = DEN_STAT[code];
  if (!name) {
    throw new Error(
      `generateD212Xml: country "${code}" (e.g. ISIN ${isinSample}) is not yet supported ` +
        `for auto-generated D212. Only country names confirmed against an accepted filing ` +
        `(US) or unambiguous (IE) are emitted; others await DUKIntegrator nomenclator ` +
        `validation. This statement must be filed manually.`,
    );
  }
  return name;
}

/**
 * XML-escapes a string value for use inside a double-quoted attribute. `&` is
 * replaced first so the ampersands introduced by the other replacements are not
 * double-escaped.
 */
function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Serializes an attribute map into ` key="escapedValue"` pairs (insertion order). */
function attrs(map: Record<string, string | number>): string {
  return Object.entries(map)
    .map(([key, value]) => ` ${key}="${esc(String(value))}"`)
    .join('');
}

/**
 * `totalPlata_A` control sum: the digit sum of the filer's CNP, per the ANAF
 * structure docs of both past seasons ("Suma de control ... suma caracterelor ce
 * compun codul numeric personal"). Requires a shape-valid CNP, or the control
 * sum (and the declaration keyed on the CNP) would be garbage.
 */
function cnpDigitSum(cif: string): number {
  if (!/^[1-9]\d{12}$/.test(cif)) {
    throw new Error(
      'generateD212Xml: identity.cif must be a 13-digit CNP ([1-9] then 12 digits); ' +
        'the totalPlata_A control sum is computed from its digits.',
    );
  }
  return cif.split('').reduce((sum, ch) => sum + Number(ch), 0);
}

/**
 * Derives the CASS bracket option (`bifa_cass_real`) + `cass_baza` from the
 * engine's CASS amount for the income year: the base recovered at the statutory
 * 10% rate must be exactly one of the year's 6/12/24-minimum-wage plafoane
 * (TAX_YEARS is the source of truth: 18.000/36.000/72.000 for 2023,
 * 19.800/39.600/79.200 for 2024, 24.300/48.600/97.200 for 2025). Real engine
 * output always lands on a bracket; anything else is corrupt input and fails
 * loud rather than emitting a bifa/baza pair the validator would reject.
 */
function cassBracket(
  amountOwed: number,
  cfg: TaxYearConfig,
): { bifa: '1' | '2' | '3'; baza: number } {
  const baza = lei(amountOwed / CASS_RATE);
  if (baza === cfg.cassThresholds.six) return { bifa: '1', baza };
  if (baza === cfg.cassThresholds.twelve) return { bifa: '2', baza };
  if (baza === cfg.cassThresholds.twentyFour) return { bifa: '3', baza };
  throw new Error(
    `generateD212Xml: healthContribution.amountOwed (${amountOwed}) does not map to a ` +
      `${cfg.taxYear} CASS bracket (bases ${cfg.cassThresholds.six}/${cfg.cassThresholds.twelve}/` +
      `${cfg.cassThresholds.twentyFour} at the statutory 10%). Corrupt result; file manually.`,
  );
}

/** Per-country accumulation of foreign income (RON), from the per-security breakdown. */
interface CountryIncome {
  code: string;
  gain: number;
  div: number;
  wht: number;
  /** A representative ISIN, for error messages on an unmapped country. */
  isinSample: string;
}

/**
 * Generates a Declaratia Unica D212 XML string from an engine
 * {@link TaxCalculationResult}, a filer {@link D212Identity}, and the engine's
 * per-security {@link SecurityBreakdown}[], on the form version of the requested
 * income year (2023 / 2024 / 2025; see the module doc and {@link D212_PROFILES}).
 *
 * The output is the foreign-source investment-income case for Romania: one
 * `cap14` row per (source country, category), capital gains code 2012 and
 * dividends code 2018, plus the realized-obligations summary block, all inside a
 * `d212` root in that year's namespace. It is an ORIGINAL declaration (d_rec=0):
 * suitable for a never-filed year, NOT for correcting an already-filed one.
 *
 * Income is grouped by the security's ISIN country prefix (PR 3). The figures
 * carried are the engine's PER-TRADE-DATE numbers (Codul Fiscal art. 96), which
 * are intentionally higher than an all-annual-average filing. No engine math is
 * performed here; the result + breakdown are consumed as-is and per-row tax is
 * the ANAF per-row formula `venit * rate`.
 *
 * @param result Finished engine output for the tax year.
 * @param identity Filer PII for the declaration root (XML-escaped on emit).
 *   `adresa_c` is required for 2023/2024 (those form versions require it).
 * @param securities Per-security breakdown from the same engine run, used to
 *   attribute income to source countries.
 * @param taxYear Income year to generate for; defaults to
 *   {@link D212_SUPPORTED_TAX_YEAR}. Must match the result's own year.
 * @param filingDate When the declaration is being filed; defaults to now. Gates
 *   the 2025 bonificatie: the 3% early-filing discount (OUG 8/2026) is emitted
 *   only when filingDate is on or before that year's early-filing deadline
 *   (15 Apr 2026 inclusive), and zeroed otherwise, because a late filing forfeits
 *   it. Has no effect on past-year (2023/2024) forms, which never had a bonificatie.
 * @returns A D212 XML document string on that year's form version.
 * @throws If the year is unsupported or contradicts `result.taxYearId`; if
 *   `result` is out of domain: a non-finite or negative money field, a
 *   `capitalGains.taxRate` or `dividends.taxRate` outside (0, 1], a net
 *   capital-LOSS year (`capitalGains.losses > 0`), a CASS amount that maps to no
 *   bracket, or a positive early-filing discount for a past year (no bonificatie
 *   existed for the 2023/2024 cycles). Also throws if the CNP is not shape-valid
 *   (the control sum derives from it), if a past-year identity lacks `adresa_c`,
 *   if the per-security breakdown does not reconcile with the engine totals, if
 *   any source country has a net capital loss within an overall gain year, if a
 *   security's ISIN has no country prefix, if there is no income to declare at
 *   all, or (v11 only) if a source country is not in the confirmed
 *   {@link DEN_STAT} table. Fails loud rather than emitting a silently-wrong or
 *   incomplete declaration.
 */
export function generateD212Xml(
  result: TaxCalculationResult,
  identity: D212Identity,
  securities: SecurityBreakdown[],
  taxYear: number = D212_SUPPORTED_TAX_YEAR,
  filingDate: Date = new Date(),
): string {
  const profile = D212_PROFILES[taxYear];
  if (!profile) {
    throw new Error(
      `generateD212Xml: income year ${taxYear} is not supported ` +
        `(supported: ${D212_SUPPORTED_TAX_YEARS.join(', ')}). This declaration must be filed manually.`,
    );
  }
  // The result must have been computed for the same income year, or the rates,
  // CASS brackets, and form version would silently disagree with the numbers.
  if (/^\d{4}$/.test(result.taxYearId) && Number(result.taxYearId) !== taxYear) {
    throw new Error(
      `generateD212Xml: result is for tax year ${result.taxYearId} but a ${taxYear} ` +
        'declaration was requested. Refusing to mix years.',
    );
  }
  const cfg = getTaxYearConfig(taxYear);
  if (!cfg) {
    throw new Error(`generateD212Xml: no TAX_YEARS config for ${taxYear}.`);
  }
  const isPastYear = profile.variant !== 'v11';

  // Input-domain guard. This generator emits a legal tax declaration, so it must
  // never turn a corrupt or unrepresentable result into a plausible-looking wrong
  // number. Every consumed field is validated up front; anything out of domain
  // fails loud (see assertMoney).
  assertMoney(result.capitalGains.netGains, 'capitalGains.netGains');
  assertMoney(result.capitalGains.taxOwed, 'capitalGains.taxOwed');
  assertMoney(result.capitalGains.losses, 'capitalGains.losses');
  assertMoney(result.dividends.grossTotal, 'dividends.grossTotal');
  assertMoney(result.dividends.withholdingTaxPaid, 'dividends.withholdingTaxPaid');
  assertMoney(result.healthContribution.amountOwed, 'healthContribution.amountOwed');
  assertMoney(
    result.healthContribution.totalNonSalaryIncome,
    'healthContribution.totalNonSalaryIncome',
  );
  assertMoney(result.totals.earlyFilingDiscount, 'totals.earlyFilingDiscount');

  // taxRate scales the per-row RO tax, so a zero or out-of-range rate would yield
  // NaN/Infinity money. Require a sane fraction in (0, 1]. (RO capital gains are
  // 0.10 for 2023-2025, 0.16 for 2026.)
  if (
    !Number.isFinite(result.capitalGains.taxRate) ||
    result.capitalGains.taxRate <= 0 ||
    result.capitalGains.taxRate > 1
  ) {
    throw new Error(
      `generateD212Xml: capitalGains.taxRate must be a fraction in (0, 1], got ${result.capitalGains.taxRate}`,
    );
  }
  // The dividend rate is its own field (8% in 2023/24 vs 10% capital gains), so
  // the dividend rows scale by it, not by capitalGains.taxRate. Same domain guard.
  if (
    !Number.isFinite(result.dividends.taxRate) ||
    result.dividends.taxRate <= 0 ||
    result.dividends.taxRate > 1
  ) {
    throw new Error(
      `generateD212Xml: dividends.taxRate must be a fraction in (0, 1], got ${result.dividends.taxRate}`,
    );
  }

  // Loss year. The engine clamps a net capital loss to netGains=0 and reports the
  // magnitude in `losses`. A correct D212 for a loss year needs the
  // pierdere-reportată (carry-forward) representation, which the engine does not
  // yet model and no spike ever verified against an accepted filing. Refuse
  // rather than silently drop the loss into an incomplete declaration (this is
  // qa's DEFECT-1).
  if (result.capitalGains.losses > 0) {
    throw new Error(
      'generateD212Xml: cannot generate a D212 for a capital-loss year ' +
        `(capitalGains.losses=${result.capitalGains.losses}). Loss carry-forward ` +
        '(pierdere reportată) is not yet supported; this declaration must be filed manually.',
    );
  }

  // Past-year cycles had NO PF bonificatie (see the module doc), so a positive
  // early-filing discount can only mean the result was computed with the wrong
  // year's config. Refuse rather than bake an unclaimable discount into the file.
  if (isPastYear && result.totals.earlyFilingDiscount > 0) {
    throw new Error(
      `generateD212Xml: result carries an early-filing discount (${result.totals.earlyFilingDiscount}) ` +
        `but no bonificatie existed for the ${taxYear} income cycle. Year/result mismatch.`,
    );
  }

  // Identity guards. The CNP is normalized once and the normalized value is both
  // summed for the control and emitted (a padded-but-valid cif must not pass the
  // guard yet emit whitespace that fails CnpSType; qa #239 finding 2). The v9
  // forms require an address.
  const cif = identity.cif.trim();
  const totalPlataControl = cnpDigitSum(cif);
  const adresa = (identity.adresa_c ?? '').trim();
  if (isPastYear && adresa.length === 0) {
    throw new Error(
      `generateD212Xml: the ${taxYear} form version requires the filer address (adresa_c).`,
    );
  }

  const taxRate = result.capitalGains.taxRate;
  const divTaxRate = result.dividends.taxRate;
  const periodStart = `01.01.${taxYear}`;
  const periodEnd = `31.12.${taxYear}`;

  // --- Per-country grouping (PR 3) ---
  // Group income-bearing securities by ISIN source country. Per-security amounts
  // are the engine's RON figures (capital gains per-trade-date art. 96, dividends
  // annual-average art. 131). An individual security's realizedGainLoss may be
  // negative, but each country's NET gain must be >= 0 (a country-level loss is
  // the deferred pierdere-compensata case, like the global loss guard above).
  const byCountry = new Map<string, CountryIncome>();
  let sumGain = 0;
  let sumDiv = 0;
  let sumWht = 0;
  for (const sec of securities) {
    const id = sec.isin || sec.ticker;
    assertFinite(sec.realizedGainLoss, `securities[${id}].realizedGainLoss`);
    assertMoney(sec.totalDividends, `securities[${id}].totalDividends`);
    assertMoney(sec.totalWithholdingTax, `securities[${id}].totalWithholdingTax`);

    sumGain += sec.realizedGainLoss;
    sumDiv += sec.totalDividends;
    sumWht += sec.totalWithholdingTax;

    // A security with no realized income contributes no declaration row (and its
    // ISIN need not resolve to a country), so skip it before requiring a country.
    if (sec.realizedGainLoss === 0 && sec.totalDividends === 0 && sec.totalWithholdingTax === 0) {
      continue;
    }
    const code = isoCountry(sec.isin);
    const agg = byCountry.get(code) ?? { code, gain: 0, div: 0, wht: 0, isinSample: sec.isin };
    agg.gain += sec.realizedGainLoss;
    agg.div += sec.totalDividends;
    agg.wht += sec.totalWithholdingTax;
    byCountry.set(code, agg);
  }

  // The breakdown must account for the income the engine taxed, or the country
  // attribution is unreliable (see reconcile).
  reconcile(sumGain, result.capitalGains.netGains, 'capital gains');
  reconcile(sumDiv, result.dividends.grossTotal, 'dividend gross');
  reconcile(sumWht, result.dividends.withholdingTaxPaid, 'dividend withholding tax');

  // A country with a NET capital loss within an overall gain year needs the
  // pierdere-compensata representation deferred in PR 2. Refuse rather than emit a
  // negative or dropped country gain. (A small negative epsilon absorbs float
  // dust on a true-zero country.)
  for (const agg of byCountry.values()) {
    if (agg.gain < -0.005) {
      throw new Error(
        `generateD212Xml: source country "${agg.code}" has a net capital loss ` +
          `(${agg.gain.toFixed(2)} RON) within an overall gain year. Cross-country loss ` +
          'compensation (pierdere compensată) is not yet supported; file manually.',
      );
    }
  }

  // Deterministic emit order: largest total income first, then country code, so
  // the XML is stable across runs.
  const countries = Array.from(byCountry.values()).sort(
    (a, b) => b.gain + b.div - (a.gain + a.div) || a.code.localeCompare(b.code),
  );

  // Build cap14 rows per country and accumulate the realized income tax as the SUM
  // of the emitted rows, so the declaration is internally consistent (totals ==
  // sum of parts), the way a paper D212 is filled. Rows that round to nothing
  // (< 1 leu) are omitted rather than emitted as empty zero rows.
  const capRows: string[] = [];
  let incomeTaxFromRows = 0;
  for (const c of countries) {
    // v11 emits the confirmed country label; v9 has no den_stat attribute, so
    // past years work for ANY ISIN country (the 2-letter code is authoritative).
    const den = profile.variant === 'v11' ? denStat(c.code, c.isinSample) : '';

    // Capital gains (code 2012): net == recalculat == gain, RO tax == dif ==
    // rate*gain, no foreign tax/credit on capital gains. The v9 structure docs
    // REQUIRE venit_brut/chelt_deduc to be absent for code 2012 (both are
    // omitted on every variant).
    const gainLei = lei(c.gain);
    if (gainLei >= 1) {
      const gainTax = lei(c.gain * taxRate);
      incomeTaxFromRows += gainTax;
      if (profile.variant === 'v11') {
        capRows.push(
          '<cap14' +
            attrs({
              str_categ_venit: CATEG_CODE_CAPITAL_GAINS,
              str_stat_realiz_v: c.code,
              den_stat: den,
              den_categ_venit: CATEG_LABEL_CAPITAL_GAINS,
              dubla_impunere: '1',
              str_data_inceput: periodStart,
              str_data_sfarsit: periodEnd,
              str_venit_net_anual: gainLei,
              str_venit_recalculat: gainLei,
              str_impozit_datorat_Ro: gainTax,
              str_dif_impozit_datorat: gainTax,
              str_impozit_platit: 0,
              str_credit_fiscal: 0,
              str_pierdere_compensata: 0,
            }) +
            '/>',
        );
      } else {
        // v9 (2023 + 2024): renamed date attrs, no den_* labels, no pierdere
        // attributes (str_pierdere_compensata does not even exist in the
        // 2024-season schema; with no prior losses both are correctly absent).
        capRows.push(
          '<cap14' +
            attrs({
              str_categ_venit: CATEG_CODE_CAPITAL_GAINS,
              str_stat_realiz_v: c.code,
              dubla_impunere: '1',
              str_data_incep: periodStart,
              str_data_sf: periodEnd,
              str_venit_net_anual: gainLei,
              str_venit_recalculat: gainLei,
              str_impozit_datorat_Ro: gainTax,
              str_dif_impozit_datorat: gainTax,
              str_impozit_platit: 0,
              str_credit_fiscal: 0,
            }) +
            '/>',
        );
      }
    }

    // Dividends (code 2018): RO tax == rate*gross, foreign WHT credited up to the
    // RO tax due (per country: an Irish 0-WHT distribution cannot borrow another
    // country's credit). Row shape differs by generation: the accepted v11 filing
    // carries venit_net_anual="0" + recalculat=gross; the v9 structure docs
    // instead define venit_brut=gross and venit_net_anual = rd.1 - rd.2 = gross
    // (no deductible costs on dividends), recalculat = net (no prior losses).
    const divLei = lei(c.div);
    const divWhtLei = lei(c.wht);
    if (divLei >= 1 || divWhtLei >= 1) {
      const divRoTax = lei(c.div * divTaxRate);
      const divCredit = Math.min(divRoTax, divWhtLei);
      const divDif = divRoTax - divCredit;
      incomeTaxFromRows += divDif;
      if (profile.variant === 'v11') {
        capRows.push(
          '<cap14' +
            attrs({
              str_categ_venit: CATEG_CODE_DIVIDENDS,
              str_stat_realiz_v: c.code,
              den_stat: den,
              den_categ_venit: CATEG_LABEL_DIVIDENDS,
              dubla_impunere: '1',
              str_data_inceput: periodStart,
              str_data_sfarsit: periodEnd,
              str_venit_net_anual: 0,
              str_venit_recalculat: divLei,
              str_impozit_datorat_Ro: divRoTax,
              str_dif_impozit_datorat: divDif,
              str_impozit_platit: divWhtLei,
              str_credit_fiscal: divCredit,
              str_pierdere_compensata: 0,
            }) +
            '/>',
        );
      } else {
        capRows.push(
          '<cap14' +
            attrs({
              str_categ_venit: CATEG_CODE_DIVIDENDS,
              str_stat_realiz_v: c.code,
              dubla_impunere: '1',
              str_data_incep: periodStart,
              str_data_sf: periodEnd,
              str_venit_brut: divLei,
              str_venit_net_anual: divLei,
              str_venit_recalculat: divLei,
              str_impozit_datorat_Ro: divRoTax,
              str_dif_impozit_datorat: divDif,
              str_impozit_platit: divWhtLei,
              str_credit_fiscal: divCredit,
            }) +
            '/>',
        );
      }
    }
  }

  // A declaration with zero income rows declares nothing: bifa121 would claim a
  // foreign-income chapter the file does not contain (a validator error) and the
  // user would be filing an empty legal document. Refuse.
  if (capRows.length === 0) {
    throw new Error(
      'generateD212Xml: no declarable income (every category rounds below 1 leu). ' +
        'There is nothing to put in the declaration; nothing to file.',
    );
  }

  // CASS: amountOwed is the fixed bracket sum; bifa_cass_real + cass_baza are
  // derived from it against the income year's plafoane (see cassBracket). The
  // engine only ever produces 0 or an exact bracket amount.
  const cassDue = result.healthContribution.amountOwed > 0;
  const cassDatorat = lei(result.healthContribution.amountOwed);
  const bracket = cassDue ? cassBracket(result.healthContribution.amountOwed, cfg) : null;
  // cass_ven_inv stays the engine's already-summed investment income (the figure
  // that determined the CASS bracket), NOT the sum of the rounded cap14 venituri,
  // so the base is always consistent with cass_datorat's bracket. It can differ
  // from the row sum by up to a leu (round-each-row vs round-the-sum); whether
  // DUKIntegrator requires exact equality is a PR 5 gate.
  const cassVenInv = lei(result.healthContribution.totalNonSalaryIncome);

  // Income tax + totals. Income tax is the sum of the emitted cap14 rows
  // (bottom-up); bonificatie is the engine's early-filing discount (v11 only; the
  // past-year guard above enforces 0 for 2023/2024).
  //
  // The bonificatie (OUG 8/2026, 3% for 2025 income) is FORFEITED unless the DU is
  // filed and paid in full by the early-filing deadline inclusive (15 Apr 2026 for
  // the 2025 cycle). A declaration produced after that date is a late filing and
  // MUST declare 0, or it understates the tax and ANAF rejects/claws it back. Since
  // that deadline has already passed, every 2025 declaration generated now is late:
  // the discount only survives for a filingDate on or before the deadline (e.g. the
  // golden regression fixture, Dragos's real on-time 2026-04-10 filing). The engine
  // still reports earlyFilingDiscount for display ("what you could have saved"); the
  // declaration reflects only what can actually be claimed. Past-year v9 paths never
  // reach a positive discount here (guarded above; no bonificatie ever existed).
  const incomeTax = incomeTaxFromRows;
  const bonif = isEarlyFilingDiscountAvailable(taxYear, filingDate)
    ? lei(result.totals.earlyFilingDiscount)
    : 0;
  const difDePlata = incomeTax + cassDatorat;

  if (profile.variant === 'v11') {
    // --- v11 (income 2025, filed 2026): modelled on the accepted filing. ---
    // d212 root: control flags + identity. Only bifa121/132/18 are set (the
    // foreign capital-gains + dividends + CASS chapters); all other bifa flags
    // stay "0". statut="3", nerezident="0".
    const rootAttrs = attrs({
      xmlns: profile.xmlns,
      an_r: String(profile.anR),
      luna_r: '12',
      d_rec: '0',
      rectif1: '0',
      rectif2: '0',
      bifa_conformare: '0',
      bifa121: '1',
      bifa132: '1',
      bifa18: '1',
      bifa11: '0',
      bifa12: '0',
      bifa13: '0',
      bifa14: '0',
      bifa15: '0',
      bifa16: '0',
      bifa17: '0',
      bifa19: '0',
      bifa122: '0',
      bifa131: '0',
      nerezident: '0',
      statut: '3',
      nume_c: identity.nume_c,
      initiala_c: identity.initiala_c,
      prenume_c: identity.prenume_c,
      cif,
      cont_bancar: identity.cont_bancar,
      telefon_c: identity.telefon_c,
    });

    // oblig_realizat: realized CASS + income tax + bonificatie + totals (v11).
    // bifa_cass_real is bracket-derived when CASS is due; a CASS-free result
    // keeps the accepted filing's shape with zeroed amounts ('3' + zeros, the
    // pre-existing v11 emit; restructuring that is gated on a DUKIntegrator run).
    const obligRealizat = attrs({
      bifa_cass_real: bracket ? bracket.bifa : '3',
      cass_ven_inv: cassVenInv,
      cass_total_ven: cassVenInv,
      cass_baza: bracket ? bracket.baza : 0,
      cass_datorat: cassDatorat,
      cass_anuala: cassDatorat,
      cass_dif_plus: cassDatorat,
      cass_plus: cassDatorat,
      oblcass_real_difPlus_dpi: cassDatorat,
      oblimpoz_real_total: incomeTax,
      oblimpoz_real_dif_deplata: incomeTax,
      impozit_venit_plus: incomeTax,
      oblimpozit_real_bonif: bonif,
      dif_de_plata: difDePlata,
      totalPlata_A: totalPlataControl,
    });

    return (
      `<?xml version="1.0" encoding="UTF-8"?>` +
      `<d212${rootAttrs}>` +
      `<oblig_realizat${obligRealizat}/>` +
      capRows.join('') +
      `</d212>`
    );
  }

  // --- v9 (incomes 2023 + 2024): built from the published season packages. ---
  // Shared v9 identity: single full-name field + required address; the phone is
  // digits-only per the structure docs ("Doar caractere numerice") and optional,
  // so a value that strips to nothing is omitted.
  const numeFull = [identity.nume_c, identity.initiala_c, identity.prenume_c]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(' ');
  const telefonDigits = identity.telefon_c.replace(/\D/g, '');

  const identityAttrs: Record<string, string | number> = {
    nume_c: numeFull,
    adresa_c: adresa,
    ...(telefonDigits ? { telefon_c: telefonDigits } : {}),
    cif,
    nerezident: '0',
    cont_bancar: identity.cont_bancar,
  };

  if (profile.variant === 'v9-2024') {
    // Income 2023, season-2024 form (OPANAF 6/2024, an_r fixed to 2024).
    // Root: every required bifa from the XSD, all 0 except bifa121 (foreign
    // income -> cap14 present) and bifa132 (CASS due). bifa110 is the
    // bonificatie flag: 0, none existed. bifa211 is optional and omitted.
    const rootAttrs = attrs({
      xmlns: profile.xmlns,
      luna_r: '12',
      an_r: String(profile.anR),
      rectif1: '0',
      rectif2: '0',
      d_rec: '0',
      totalPlata_A: totalPlataControl,
      bifa111: '0',
      bifa112: '0',
      bifa113: '0',
      bifa121: '1',
      bifa122: '0',
      bifa131: '0',
      bifa132: cassDue ? '1' : '0',
      bifa15: '0',
      bifa19: '0',
      bifa110: '0',
      bifa14: '0',
      bifa212: '0',
      bifa213: '0',
      bifa221: '0',
      bifa222: '0',
      ...identityAttrs,
    });

    // oblig_realizat, season-2024 shape. When CASS is due the structure doc
    // requires ALL SEVEN cass_ven_* categories present (the non-investment ones
    // as 0) plus total/baza/datorat; the summary is oblimpoz_real_total (sum of
    // the cap14 difs) + oblimpoz_real_deplata (= total, no indemnizatii) and the
    // CASS mirror oblcass_real / _difPlus / _deplata (= cass_datorat, nothing
    // withheld). oblimpoz_real_dif_deplata exists only when anticipat is
    // declared (not our case), and this season has no dif_de_plata attribute at
    // all (the form computes the payable total). Bonificatie attrs omitted
    // (bifa110=0).
    const obligRealizat = attrs({
      ...(cassDue && bracket
        ? {
            bifa_cass_real: bracket.bifa,
            cass_ven_indp: 0,
            cass_ven_dpi: 0,
            cass_ven_asc: 0,
            cass_ven_cfb: 0,
            cass_ven_inv: cassVenInv,
            cass_ven_asp: 0,
            cass_ven_alt: 0,
            cass_total_ven: cassVenInv,
            cass_baza: bracket.baza,
            cass_datorat: cassDatorat,
          }
        : {}),
      oblimpoz_real_total: incomeTax,
      oblimpoz_real_deplata: incomeTax,
      ...(cassDue
        ? {
            oblcass_real: cassDatorat,
            oblcass_real_difPlus: cassDatorat,
            oblcass_real_deplata: cassDatorat,
          }
        : {}),
    });

    return (
      `<?xml version="1.0" encoding="UTF-8"?>` +
      `<d212${rootAttrs}>` +
      `<oblig_realizat${obligRealizat}/>` +
      capRows.join('') +
      `</d212>`
    );
  }

  // Income 2024, season-2025 form (OPANAF 7015/2024 cycle, an_r fixed to 2025).
  // Root: adds bifa_succesor / anulare_litA / anulare_litB / bifa_conformare
  // (all required by the XSD, all 0 for a plain original filing). bifa18 is this
  // season's bonificatie flag: 0, none existed for PF. bifa132 = CASS due.
  const rootAttrs = attrs({
    xmlns: profile.xmlns,
    d_rec: '0',
    rectif1: '0',
    rectif2: '0',
    totalPlata_A: totalPlataControl,
    luna_r: '12',
    an_r: String(profile.anR),
    bifa_succesor: '0',
    anulare_litA: '0',
    anulare_litB: '0',
    bifa_conformare: '0',
    bifa111: '0',
    bifa112: '0',
    bifa113: '0',
    bifa121: '1',
    bifa122: '0',
    bifa131: '0',
    bifa132: cassDue ? '1' : '0',
    bifa14: '0',
    bifa15: '0',
    bifa18: '0',
    ...identityAttrs,
  });

  // oblig_realizat, season-2025 shape. The CASS block moved to the lit. c)-h)
  // family: bifa_cass_datorat_dpi flags the section that includes investment
  // income (its structure-doc label names "venituri din investiţii" explicitly),
  // with six cass_ven_* categories (no cass_ven_indp this season), the bracket
  // pair, cass_datorat and cass_dif_plus (= datorat, nothing withheld). The
  // summary chain per the doc: oblimpoz_real_dif_deplata = total (no anticipat),
  // impozit_venit_plus = dif_deplata, oblcass_real_difPlus_dpi = cass_dif_plus,
  // cass_plus = that, dif_de_plata = impozit_venit_plus + cass_plus. Bonificatie
  // attrs omitted (bifa18=0).
  const obligRealizat = attrs({
    ...(cassDue && bracket
      ? {
          bifa_cass_datorat_ai: '0',
          bifa_cass_datorat_dpi: '1',
          bifa_cass_real: bracket.bifa,
          cass_ven_dpi: 0,
          cass_ven_asc: 0,
          cass_ven_cfb: 0,
          cass_ven_inv: cassVenInv,
          cass_ven_asp: 0,
          cass_ven_alt: 0,
          cass_total_ven: cassVenInv,
          cass_baza: bracket.baza,
          cass_datorat: cassDatorat,
          cass_dif_plus: cassDatorat,
        }
      : {}),
    oblimpoz_real_total: incomeTax,
    oblimpoz_real_dif_deplata: incomeTax,
    ...(cassDue ? { oblcass_real_difPlus_dpi: cassDatorat } : {}),
    impozit_venit_plus: incomeTax,
    ...(cassDue ? { cass_plus: cassDatorat } : {}),
    dif_de_plata: difDePlata,
  });

  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<d212${rootAttrs}>` +
    `<oblig_realizat${obligRealizat}/>` +
    capRows.join('') +
    `</d212>`
  );
}
