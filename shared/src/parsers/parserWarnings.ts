/**
 * Structured parser warnings (SUGGESTIONS S6 phase A, closes S8).
 *
 * WHY THIS EXISTS
 *
 * Parsers have always returned warnings as prose (`warnings: string[]`), which
 * made every consumer that needs to REASON about a warning match on its text.
 * The pre-pay gate (`client/src/lib/parseEligibility.ts`, PR #265) does exactly
 * that: it substring-matches two Trading212 sentences to decide whether a file
 * would under-report the declaration. That works for the two warnings that
 * happened to exist and silently misses every equivalent one from another
 * parser -- e.g. IBKR drops a real income row when it cannot read the row's date
 * (SUGGESTIONS S8), yet the gate still opens the pay CTA.
 *
 * So parsers now emit a stable CODE and a SEVERITY alongside the prose. Consumers
 * key off the severity; the prose stays exactly as it was, for display.
 *
 * THE SEVERITY CRITERION (the one line that matters)
 *
 *   'fatal' = acting on this file would UNDER-state the declaration, because a
 *             real taxable amount was dropped or silently defaulted.
 *   'info'  = everything else: rows skipped by design (deposits, non-stock
 *             positions), transparency notes (splits applied, duplicates
 *             removed), out-of-scope income the user is told to declare
 *             separately, and structural "this is not a statement we read"
 *             notes that other gate reasons already cover.
 *
 * Under-statement is the criterion (not "anything imperfect") because it is the
 * ANAF risk that makes a number dangerous to file. It is also the definition the
 * pre-pay gate already documented for its fatal set. A warning that makes the
 * user OVER-state (an unapplied withholding-tax credit, say) is wrong too, but
 * it fails in the safe direction and is disclosed in the warning text, so it
 * does not close the gate. See `investax-docs/SUGGESTIONS.md` S10 for the list
 * of currently-'info' codes that arguably drop taxable rows and are queued for
 * a deliberate classification review, rather than being reclassified inside a
 * refactor.
 *
 * ADDITIVE BY CONSTRUCTION: `warnings: string[]` keeps the exact same strings in
 * the exact same order. Nothing that renders or reports prose today changes.
 */

export type ParserWarningSeverity = 'fatal' | 'info';

/**
 * Stable identifiers for every warning a parser can emit. Prefixed by source so
 * a code is unambiguous when results from several files are merged.
 *
 * These are a CONTRACT: the pre-pay gate and (later) the i18n render boundary
 * key off them. Do not rename a member without updating both. Adding a member is
 * safe and requires a severity entry in `WARNING_SEVERITY` below -- the compiler
 * enforces that the record is exhaustive.
 */
export type ParserWarningCode =
  // --- Trading212 CSV (shared/src/parsers/trading212.ts) ---
  | 't212_csv_empty'
  | 't212_missing_action_column'
  | 't212_interest_income_out_of_scope'
  | 't212_missing_total_column'
  | 't212_unreadable_numeric_value'
  | 't212_no_transactions_parsed'
  // --- Trading212 PDF (shared/src/parsers/trading212Pdf.ts) ---
  | 't212pdf_broker_mismatch'
  | 't212pdf_year_not_detected'
  | 't212pdf_sell_section_unparsed'
  | 't212pdf_sell_section_missing'
  | 't212pdf_dividend_section_unparsed'
  | 't212pdf_no_invest_account'
  | 't212pdf_sell_total_mismatch'
  | 't212pdf_dividend_gross_mismatch'
  // --- IBKR (shared/src/parsers/ibkr.ts) ---
  | 'ibkr_csv_empty'
  | 'ibkr_unreadable_row_date'
  | 'ibkr_withholding_security_unidentified'
  | 'ibkr_withholding_no_matching_dividend'
  | 'ibkr_non_stock_positions_skipped'
  | 'ibkr_unsupported_currencies_skipped'
  | 'ibkr_interest_withholding_skipped'
  | 'ibkr_not_an_activity_statement'
  | 'ibkr_no_transactions_parsed'
  // --- Revolut (shared/src/parsers/revolut.ts) ---
  | 'revolut_file_empty'
  | 'revolut_not_an_account_statement'
  | 'revolut_reverse_split_unapplied'
  | 'revolut_unsupported_currencies_skipped'
  | 'revolut_unrecognised_types_skipped'
  | 'revolut_no_transactions_parsed'
  // --- Known stock splits (shared/src/parsers/applyKnownStockSplits.ts) ---
  | 'splits_reverse_split_unapplied';

export interface ParserWarning {
  /** Stable identifier; consumers branch on this, never on the message. */
  code: ParserWarningCode;
  /** Whether acting on this file would under-state the declaration. */
  severity: ParserWarningSeverity;
  /** The human-readable English prose, identical to the `warnings[]` entry. */
  message: string;
}

/**
 * The severity of every code. Exhaustive by type: adding a code without a
 * severity here is a compile error, which is the point -- a new warning cannot
 * silently default to "harmless" and slip past the pre-pay gate.
 *
 * Only three codes are 'fatal' today, and each one drops or defaults a real
 * taxable amount while still producing an otherwise-usable preview:
 *  - `t212_missing_total_column`      -> row proceeds read as zero (PR #263)
 *  - `t212_unreadable_numeric_value`  -> cell falls back to 0 or a 1:1 rate (PR #264)
 *  - `ibkr_unreadable_row_date`       -> a real income row is skipped (S8, this PR)
 */
export const WARNING_SEVERITY: Record<ParserWarningCode, ParserWarningSeverity> = {
  // Trading212 CSV
  t212_csv_empty: 'info',
  t212_missing_action_column: 'info',
  // Deliberately benign (PR #265): interest is separate income we do not compute
  // and explicitly tell the user to declare, not an amount we got wrong.
  t212_interest_income_out_of_scope: 'info',
  t212_missing_total_column: 'fatal',
  t212_unreadable_numeric_value: 'fatal',
  t212_no_transactions_parsed: 'info',

  // Trading212 PDF -- structural notes; the gate covers the PDF failure modes
  // through `brokerMismatch` and the empty-result check.
  t212pdf_broker_mismatch: 'info',
  t212pdf_year_not_detected: 'info',
  t212pdf_sell_section_unparsed: 'info',
  t212pdf_sell_section_missing: 'info',
  t212pdf_dividend_section_unparsed: 'info',
  // A CFD/Crypto-only statement: the numbers are wrong, but not specifically
  // under-stated (crypto is taxed on a different basis entirely) -> see S10.
  t212pdf_no_invest_account: 'info',
  // Both cross-check notes are explicitly informational: the engine resolves the
  // discrepancy by picking the more reliable source, it does not drop an amount.
  t212pdf_sell_total_mismatch: 'info',
  t212pdf_dividend_gross_mismatch: 'info',

  // IBKR
  ibkr_csv_empty: 'info',
  ibkr_unreadable_row_date: 'fatal',
  // Both withholding cases drop a tax CREDIT, so they push the declaration UP,
  // not down. Wrong, disclosed, and safe-direction -> see S10.
  ibkr_withholding_security_unidentified: 'info',
  ibkr_withholding_no_matching_dividend: 'info',
  ibkr_non_stock_positions_skipped: 'info',
  ibkr_unsupported_currencies_skipped: 'info',
  ibkr_interest_withholding_skipped: 'info',
  ibkr_not_an_activity_statement: 'info',
  ibkr_no_transactions_parsed: 'info',

  // Revolut
  revolut_file_empty: 'info',
  revolut_not_an_account_statement: 'info',
  revolut_reverse_split_unapplied: 'info',
  revolut_unsupported_currencies_skipped: 'info',
  revolut_unrecognised_types_skipped: 'info',
  revolut_no_transactions_parsed: 'info',

  // Known stock splits
  splits_reverse_split_unapplied: 'info',
};

/**
 * Collects prose and structured warnings together so the two can never drift.
 *
 * Parsers build one sink and push through it instead of pushing onto a bare
 * string array; `warnings` and `structuredWarnings` then hold the same entries,
 * in the same order, by construction.
 */
export interface WarningSink {
  /** Prose warnings, unchanged from before this module existed. */
  readonly warnings: string[];
  /** The same warnings with their code and severity attached. */
  readonly structuredWarnings: ParserWarning[];
  /** Record one warning in both channels. */
  push(code: ParserWarningCode, message: string): void;
}

export function createWarningSink(): WarningSink {
  const warnings: string[] = [];
  const structuredWarnings: ParserWarning[] = [];
  return {
    warnings,
    structuredWarnings,
    push(code, message) {
      warnings.push(message);
      structuredWarnings.push({ code, severity: WARNING_SEVERITY[code], message });
    },
  };
}

/** True when any warning means the declaration would be under-stated. */
export function hasFatalWarning(warnings: readonly ParserWarning[]): boolean {
  return warnings.some((w) => w.severity === 'fatal');
}
