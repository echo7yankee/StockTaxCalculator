/**
 * Declaratia Unica (D212) v11 XML generator for the foreign-source
 * investment-income case (Romania).
 *
 * Turns a {@link TaxCalculationResult} (the engine's output for a parsed broker
 * statement) into a D212 v11 XML string in the ANAF namespace
 * `mfp:anaf:dgti:d212:declaratie:v11`, ready to be loaded into DUKIntegrator for
 * validation + e-filing.
 *
 * The structure here is modelled field-for-field on Dragos's real,
 * ANAF-SPV-accepted April 2026 D212 filing (the 2025 Trading212 statement). A
 * session #144 spike generated this XML from the same engine output and diffed
 * it attribute-by-attribute against that accepted filing: structure was a 100%
 * match, dividends and CASS were exact, and the only value differences traced to
 * the engine's per-trade-date BNR methodology on capital gains (Codul Fiscal
 * art. 96), which is the app's current correct behavior and intentionally higher
 * than the all-annual-average simplification ANAF accepted in April 2026. See
 * `investax-docs/d212-prefill-spike-result.md`.
 *
 * Scope notes for this generator (the D212 pre-fill program):
 * - Inputs are guarded. A net capital-LOSS year and any non-finite/negative/
 *   out-of-range field are rejected up front (PR 2 fail-loud), so the generator
 *   never emits a silently-wrong declaration. Loss carry-forward representation
 *   (pierdere reportată) is deferred until tax-verified and engine-modelled.
 * - SINGLE source country (US). Foreign income is emitted as two `cap14` rows
 *   (capital gains + dividends) both under `US`, matching Dragos's accepted
 *   single-country filing where Irish ETF distributions were lumped into US.
 *   Per-country split (grouping {@link SecurityBreakdown} by ISIN-country
 *   prefix) is PR 3; it is a correctness enhancement, not required to match the
 *   accepted single-country baseline.
 * - The numbers carried are the engine's PER-TRADE-DATE figures (art. 96), so
 *   the generated capital-gains row and everything derived from it (CASS base,
 *   income-tax total, bonificatie, dif_de_plata) is intentionally higher than a
 *   filing built on the all-annual-average rate. This is a methodology stance,
 *   not a bug.
 * - Identity (CNP/IBAN/name/phone) is passed in by the caller; in-app identity
 *   collection is PR 4.
 * - No engine math happens here. This module consumes a finished
 *   {@link TaxCalculationResult} and never touches the parser, the PDF tax
 *   calculator, or any rate logic.
 */

import type { TaxCalculationResult } from '../types/tax.js';

/**
 * Filer identity for the D212 root element (user-supplied PII).
 *
 * - `cif` is the Romanian CNP (cod numeric personal), 13 digits, pattern
 *   `[1-9]\d{12}`.
 * - `cont_bancar` is the refund IBAN.
 * - `nume_c` / `initiala_c` / `prenume_c` are surname / middle initial / given
 *   name; `telefon_c` is the contact phone. All are XML-escaped on emit.
 */
export interface D212Identity {
  nume_c: string;
  initiala_c: string;
  prenume_c: string;
  cif: string;
  cont_bancar: string;
  telefon_c: string;
}

/**
 * Romanian foreign-income category code for "transferul titlurilor de valoare"
 * (capital gains from securities). Its `den_categ_venit` label is reproduced
 * verbatim, with diacritics, from the accepted filing.
 */
const CATEG_CODE_CAPITAL_GAINS = '2012';
const CATEG_LABEL_CAPITAL_GAINS =
  'Transferul titlurilor de valoare și orice alte operațiuni cu instrumente financiare, inclusiv instrumente financiare derivate, precum și transferul aurului financiar';

/** Romanian foreign-income category code + label for dividends. */
const CATEG_CODE_DIVIDENDS = '2018';
const CATEG_LABEL_DIVIDENDS = 'Dividende';

/**
 * Single source country for this PR. Per-country split is PR 2 (see the module
 * JSDoc); until then everything is emitted under US, matching the accepted
 * single-country baseline.
 */
const SOURCE_COUNTRY_CODE = 'US';
const SOURCE_COUNTRY_NAME = 'Statele Unite ale Americii';

/** Tax-year reporting period (calendar year 2025, filed in 2026). */
const PERIOD_START = '01.01.2025';
const PERIOD_END = '31.12.2025';

/** Whole-lei integer, round half up (D212 money fields are integers). */
function lei(n: number): number {
  return Math.round(n);
}

/**
 * Asserts a consumed result field is a finite, non-negative money amount. D212
 * money fields are unsigned, so a non-finite (NaN/Infinity) or negative value
 * means the caller handed us a corrupt or hand-built result this generator cannot
 * faithfully represent. We fail loud rather than emit a plausible-looking wrong
 * number into a legal declaration ("never a silent wrong number" is the whole
 * point of the tool). The engine clamps and rounds, so these throws are
 * unreachable from real engine output; they guard the wired path (PR 4) against a
 * corrupt result.
 */
function assertMoney(value: number, field: string): void {
  if (!Number.isFinite(value)) {
    throw new Error(`generateD212Xml: ${field} must be a finite number, got ${value}`);
  }
  if (value < 0) {
    throw new Error(`generateD212Xml: ${field} must not be negative, got ${value}`);
  }
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
 * Generates a Declaratia Unica D212 v11 XML string from an engine
 * {@link TaxCalculationResult} and a filer {@link D212Identity}.
 *
 * The output is the foreign-source investment-income case for Romania: two
 * `cap14` rows (capital gains code 2012 + dividends code 2018, both under US for
 * this PR) plus the `oblig_realizat` CASS + income-tax + bonificatie block, all
 * inside a `d212` root in the `mfp:anaf:dgti:d212:declaratie:v11` namespace.
 *
 * Important: the figures carried are the engine's PER-TRADE-DATE numbers (Codul
 * Fiscal art. 96), which are intentionally higher than an all-annual-average
 * filing. SINGLE source country (US) only; per-country split is PR 3. No engine
 * math is performed here, the result is consumed as-is.
 *
 * @param result Finished engine output for the tax year.
 * @param identity Filer PII for the declaration root (XML-escaped on emit).
 * @returns A D212 v11 XML document string.
 * @throws If `result` is out of domain: a non-finite or negative money field, a
 *   `capitalGains.taxRate` outside (0, 1], or a net capital-LOSS year
 *   (`capitalGains.losses > 0`), which is not yet supported. Fails loud rather
 *   than emitting a silently-wrong declaration.
 */
export function generateD212Xml(result: TaxCalculationResult, identity: D212Identity): string {
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

  // taxRate scales the dividend RO tax and recovers cass_baza (amountOwed / rate),
  // so a zero or out-of-range rate would yield NaN/Infinity money. Require a sane
  // fraction in (0, 1]. (RO is 0.10 for 2025, 0.16 for 2026.)
  if (
    !Number.isFinite(result.capitalGains.taxRate) ||
    result.capitalGains.taxRate <= 0 ||
    result.capitalGains.taxRate > 1
  ) {
    throw new Error(
      `generateD212Xml: capitalGains.taxRate must be a fraction in (0, 1], got ${result.capitalGains.taxRate}`,
    );
  }

  // Loss year. The engine clamps a net capital loss to netGains=0 and reports the
  // magnitude in `losses`. A correct D212 for a loss year needs the
  // pierdere-reportată (carry-forward) representation, which the engine does not
  // yet model and the session #144 spike never verified against an accepted
  // filing. Refuse rather than silently drop the loss into an incomplete
  // declaration (this is qa's DEFECT-1). Mapping `losses` to a `str_pierdere_*`
  // field is deferred until the correct v11 field is tax-verified AND the engine
  // tracks carry-forward.
  if (result.capitalGains.losses > 0) {
    throw new Error(
      'generateD212Xml: cannot generate a D212 for a capital-loss year ' +
        `(capitalGains.losses=${result.capitalGains.losses}). Loss carry-forward ` +
        '(pierdere reportată) is not yet supported; this declaration must be filed manually.',
    );
  }

  const taxRate = result.capitalGains.taxRate;

  // Foreign income: capital gains (per-trade-date, art. 96).
  const gainNet = lei(result.capitalGains.netGains);
  const gainTax = lei(result.capitalGains.taxOwed);

  // Foreign income: dividends. RO tax is 10% (taxRate) of gross; the foreign
  // withholding tax already paid is credited up to the RO tax due.
  const divGross = lei(result.dividends.grossTotal);
  const divRoTax = lei(result.dividends.grossTotal * taxRate);
  const divWht = lei(result.dividends.withholdingTaxPaid);
  const divCredit = Math.min(divRoTax, divWht);
  const divDif = divRoTax - divCredit;

  // CASS: amountOwed is the fixed bracket sum; cass_baza is the plafond that
  // bracket sits on, recovered as amountOwed / rate (e.g. 9720 / 0.10 = 97200).
  const cassDatorat = lei(result.healthContribution.amountOwed);
  const cassBaza = lei(result.healthContribution.amountOwed / taxRate);
  // cass_ven_inv intentionally rounds the engine's already-summed
  // totalNonSalaryIncome once, NOT lei(gainNet) + lei(divGross) re-summed, so it
  // can legitimately differ from the two cap14 rows by a leu (rounding once vs
  // twice). This matches the accepted filing.
  const cassVenInv = lei(result.healthContribution.totalNonSalaryIncome);

  // Income tax + totals.
  const incomeTax = gainTax + divDif;
  const bonif = lei(result.totals.earlyFilingDiscount);
  const difDePlata = incomeTax + cassDatorat;

  // TODO(PR5): confirm totalPlata_A semantics (was 33 in the real filing,
  // meaning TBD) via DUKIntegrator validation. Set to dif_de_plata for now.
  const totalPlataA = difDePlata;

  // d212 root: control flags + identity. Only bifa121/132/18 are set (the
  // foreign capital-gains + dividends + CASS chapters); all other bifa flags
  // stay "0". statut="3", nerezident="0".
  const rootAttrs = attrs({
    xmlns: 'mfp:anaf:dgti:d212:declaratie:v11',
    an_r: '2026',
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
    cif: identity.cif,
    cont_bancar: identity.cont_bancar,
    telefon_c: identity.telefon_c,
  });

  // oblig_realizat: realized CASS + income tax + bonificatie + totals (v11).
  const obligRealizat = attrs({
    bifa_cass_real: '3',
    cass_ven_inv: cassVenInv,
    cass_total_ven: cassVenInv,
    cass_baza: cassBaza,
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
    totalPlata_A: totalPlataA,
  });

  // cap14 capital gains (code 2012): net == recalculat == gain, RO tax ==
  // dif == 10% gain, no foreign tax/credit on capital gains.
  const cap14CapitalGains = attrs({
    str_categ_venit: CATEG_CODE_CAPITAL_GAINS,
    str_stat_realiz_v: SOURCE_COUNTRY_CODE,
    den_stat: SOURCE_COUNTRY_NAME,
    den_categ_venit: CATEG_LABEL_CAPITAL_GAINS,
    dubla_impunere: '1',
    str_data_inceput: PERIOD_START,
    str_data_sfarsit: PERIOD_END,
    str_venit_net_anual: gainNet,
    str_venit_recalculat: gainNet,
    str_impozit_datorat_Ro: gainTax,
    str_dif_impozit_datorat: gainTax,
    str_impozit_platit: 0,
    str_credit_fiscal: 0,
    str_pierdere_compensata: 0,
  });

  // cap14 dividends (code 2018): net_anual 0, recalculat == gross, RO tax ==
  // 10% gross, foreign WHT credited up to RO tax due.
  const cap14Dividends = attrs({
    str_categ_venit: CATEG_CODE_DIVIDENDS,
    str_stat_realiz_v: SOURCE_COUNTRY_CODE,
    den_stat: SOURCE_COUNTRY_NAME,
    den_categ_venit: CATEG_LABEL_DIVIDENDS,
    dubla_impunere: '1',
    str_data_inceput: PERIOD_START,
    str_data_sfarsit: PERIOD_END,
    str_venit_net_anual: 0,
    str_venit_recalculat: divGross,
    str_impozit_datorat_Ro: divRoTax,
    str_dif_impozit_datorat: divDif,
    str_impozit_platit: divWht,
    str_credit_fiscal: divCredit,
    str_pierdere_compensata: 0,
  });

  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<d212${rootAttrs}>` +
    `<oblig_realizat${obligRealizat}/>` +
    `<cap14${cap14CapitalGains}/>` +
    `<cap14${cap14Dividends}/>` +
    `</d212>`
  );
}
