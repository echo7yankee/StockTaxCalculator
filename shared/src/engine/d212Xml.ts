/**
 * Declaratia Unica (D212) v11 XML generator for the foreign-source
 * investment-income case (Romania).
 *
 * Turns a {@link TaxCalculationResult} (the engine's output for a parsed broker
 * statement) plus its per-security {@link SecurityBreakdown}[] into a D212 v11 XML
 * string in the ANAF namespace `mfp:anaf:dgti:d212:declaratie:v11`, ready to be
 * loaded into DUKIntegrator for validation + e-filing.
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
 * - PER-SOURCE-COUNTRY split (PR 3). Foreign income is grouped by the security's
 *   ISIN country prefix and emitted as one `cap14` per (country, category): so a
 *   holder of US stocks plus Irish-domiciled UCITS ETFs gets a US capital-gains
 *   row and separate US + IE dividend rows. This matters because foreign
 *   withholding tax is credited PER country (Irish distributions carry 0 WHT, so
 *   they must not borrow the US dividend credit). Dragos's accepted filing lumped
 *   everything under US; this is a strict correctness enhancement over that.
 * - Country names (`den_stat`) are only emitted for countries confirmed against
 *   an accepted filing (US) or unambiguous (IE); every other country fails loud
 *   pending DUKIntegrator nomenclator confirmation (PR 5). See {@link DEN_STAT}.
 * - The declaration is assembled BOTTOM-UP: each `cap14` row is independently
 *   rounded, and the realized income-tax total is the SUM of the emitted rows, so
 *   the totals always equal the sum of the parts. The CASS bracket amount + base
 *   come from the engine (they are bracket-derived, not a row sum).
 * - The numbers carried are the engine's PER-TRADE-DATE figures (art. 96), so
 *   the generated capital-gains row and everything derived from it (income-tax
 *   total, bonificatie, dif_de_plata) is intentionally higher than a filing built
 *   on the all-annual-average rate. This is a methodology stance, not a bug.
 * - Identity (CNP/IBAN/name/phone) is passed in by the caller; in-app identity
 *   collection is PR 4.
 * - No engine math happens here. This module consumes a finished
 *   {@link TaxCalculationResult} + {@link SecurityBreakdown}[] and never touches
 *   the parser, the PDF tax calculator, or any rate logic. Per-row tax is the
 *   ANAF per-row formula `venit * rate`, which equals the engine's `taxOwed` for
 *   real engine output (where `taxOwed == netGains * rate`) and keeps every row
 *   self-consistent.
 */

import type { TaxCalculationResult, SecurityBreakdown } from '../types/tax.js';

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
 * ISO 3166-1 alpha-2 country code -> Romanian `den_stat` name for the D212.
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
 * The single income tax year this generator models. The v11 structure, the
 * reporting period below, and the `an_r`/category constants are all pinned to the
 * 2025 income year (filed in 2026) that the session #144 spike validated against
 * Dragos's accepted filing. Callers MUST gate the download on this year; a
 * statement from any other year has to be filed manually until the generator is
 * extended (and re-validated) for it.
 */
export const D212_SUPPORTED_TAX_YEAR = 2025;

/** Tax-year reporting period (calendar year 2025, filed in 2026). */
const PERIOD_START = '01.01.2025';
const PERIOD_END = '31.12.2025';

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
  return code;
}

/**
 * Romanian `den_stat` name for a country code; fails loud on an unmapped country
 * (see {@link DEN_STAT}) rather than guessing a name into a legal declaration.
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
 * Generates a Declaratia Unica D212 v11 XML string from an engine
 * {@link TaxCalculationResult}, a filer {@link D212Identity}, and the engine's
 * per-security {@link SecurityBreakdown}[].
 *
 * The output is the foreign-source investment-income case for Romania: one
 * `cap14` row per (source country, category), capital gains code 2012 and
 * dividends code 2018, plus the `oblig_realizat` CASS + income-tax + bonificatie
 * block, all inside a `d212` root in the `mfp:anaf:dgti:d212:declaratie:v11`
 * namespace.
 *
 * Income is grouped by the security's ISIN country prefix (PR 3). The figures
 * carried are the engine's PER-TRADE-DATE numbers (Codul Fiscal art. 96), which
 * are intentionally higher than an all-annual-average filing. No engine math is
 * performed here; the result + breakdown are consumed as-is and per-row tax is
 * the ANAF per-row formula `venit * rate`.
 *
 * @param result Finished engine output for the tax year.
 * @param identity Filer PII for the declaration root (XML-escaped on emit).
 * @param securities Per-security breakdown from the same engine run, used to
 *   attribute income to source countries.
 * @returns A D212 v11 XML document string.
 * @throws If `result` is out of domain: a non-finite or negative money field, a
 *   `capitalGains.taxRate` or `dividends.taxRate` outside (0, 1], or a net capital-LOSS year
 *   (`capitalGains.losses > 0`). Also throws if the per-security breakdown does
 *   not reconcile with the engine totals, if any source country has a net capital
 *   loss within an overall gain year (cross-country loss compensation is not yet
 *   supported), if a security's ISIN has no country prefix, or if a source
 *   country is not in the confirmed {@link DEN_STAT} table. Fails loud rather than
 *   emitting a silently-wrong or incomplete declaration.
 */
export function generateD212Xml(
  result: TaxCalculationResult,
  identity: D212Identity,
  securities: SecurityBreakdown[],
): string {
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

  // taxRate scales the per-row RO tax and recovers cass_baza (amountOwed / rate),
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
  const divTaxRate = result.dividends.taxRate;

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
    const den = denStat(c.code, c.isinSample);

    // Capital gains (code 2012): net == recalculat == gain, RO tax == dif ==
    // rate*gain, no foreign tax/credit on capital gains.
    const gainLei = lei(c.gain);
    if (gainLei >= 1) {
      const gainTax = lei(c.gain * taxRate);
      incomeTaxFromRows += gainTax;
      capRows.push(
        '<cap14' +
          attrs({
            str_categ_venit: CATEG_CODE_CAPITAL_GAINS,
            str_stat_realiz_v: c.code,
            den_stat: den,
            den_categ_venit: CATEG_LABEL_CAPITAL_GAINS,
            dubla_impunere: '1',
            str_data_inceput: PERIOD_START,
            str_data_sfarsit: PERIOD_END,
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
    }

    // Dividends (code 2018): net_anual 0, recalculat == gross, RO tax ==
    // rate*gross, foreign WHT credited up to the RO tax due (per country: an
    // Irish 0-WHT distribution cannot borrow another country's credit).
    const divLei = lei(c.div);
    const divWhtLei = lei(c.wht);
    if (divLei >= 1 || divWhtLei >= 1) {
      const divRoTax = lei(c.div * divTaxRate);
      const divCredit = Math.min(divRoTax, divWhtLei);
      const divDif = divRoTax - divCredit;
      incomeTaxFromRows += divDif;
      capRows.push(
        '<cap14' +
          attrs({
            str_categ_venit: CATEG_CODE_DIVIDENDS,
            str_stat_realiz_v: c.code,
            den_stat: den,
            den_categ_venit: CATEG_LABEL_DIVIDENDS,
            dubla_impunere: '1',
            str_data_inceput: PERIOD_START,
            str_data_sfarsit: PERIOD_END,
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
    }
  }

  // CASS: amountOwed is the fixed bracket sum; cass_baza is the plafond that
  // bracket sits on, recovered as amountOwed / rate (e.g. 9720 / 0.10 = 97200).
  const cassDatorat = lei(result.healthContribution.amountOwed);
  const cassBaza = lei(result.healthContribution.amountOwed / taxRate);
  // cass_ven_inv stays the engine's already-summed investment income (the figure
  // that determined the CASS bracket), NOT the sum of the rounded cap14 venituri,
  // so the base is always consistent with cass_datorat's bracket. It can differ
  // from the row sum by up to a leu (round-each-row vs round-the-sum); whether
  // DUKIntegrator requires exact equality is a PR 5 gate.
  const cassVenInv = lei(result.healthContribution.totalNonSalaryIncome);

  // Income tax + totals. Income tax is the sum of the emitted cap14 rows
  // (bottom-up); bonificatie is the engine's early-filing discount (a rate policy,
  // congruent to the leu with the row-summed income tax for real input).
  const incomeTax = incomeTaxFromRows;
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

  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<d212${rootAttrs}>` +
    `<oblig_realizat${obligRealizat}/>` +
    capRows.join('') +
    `</d212>`
  );
}
