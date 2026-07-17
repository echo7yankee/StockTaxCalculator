import { isEngineSupportedTaxYear } from '@shared/taxRules/taxYears';
import type { PreviewData } from '../hooks/useStatementPreview';

/**
 * Pre-pay parse eligibility predicate (backlog #24B Phase 2, PR-1).
 *
 * Single source of truth for whether a parsed statement is PAYMENT-ELIGIBLE
 * (the pre-pay gate is OPEN). It consumes ONLY parser output + engine support
 * flags (the `PreviewData` the shared `useStatementPreview` hook already
 * produces, plus the thrown-error and CSV missing-history flags that live
 * alongside it). It NEVER touches the tax engine: no gains / tax / CASS / total
 * / D212 / XML enters this decision. That is the moat boundary (execution plan
 * Section 2 + DO-NOT Section 7); this predicate stays engine-agnostic so the
 * free checker built on it can never leak a paid number.
 *
 * The rule is 3-way (Dragos-confirmed, session #181):
 *  - HARD ERROR: the file could not be read at all (a thrown parse error / crash
 *    / not a valid statement). BLOCK -> `unreadable`.
 *  - FATAL WARNING: the file was read, but we cannot produce a CORRECT number.
 *    The fatal set is exactly: an unsupported tax year, a CSV missing-history
 *    hard-stop, a PDF broker-mismatch, an empty result (zero sells AND zero
 *    dividends AND zero distributions), and a parser warning that the amounts
 *    themselves are wrong (a missing Total column or an unreadable numeric cell,
 *    both of which understate the declaration). BLOCK -> the matching reason.
 *  - BENIGN WARNING: the file was read on a supported broker + year and the only
 *    warnings are informational (skipped rows, duplicates removed, splits
 *    applied, mixed-currency notes). ALLOW. This is the deliberate refinement
 *    over the current PreviewPage, which wrongly routes ALL warnings to
 *    lead-capture and so would block payment for a serviceable file.
 *
 * The reason enum is STABLE: PR-4 keys crypto / Binance lead-capture off
 * `wrong_broker` (plus the broker id, held separately). Do not rename its
 * members without updating that downstream consumer.
 */
export type GateBlockReason =
  | 'unreadable'
  | 'unsupported_year'
  | 'missing_history'
  | 'wrong_broker'
  | 'empty'
  | 'unreliable_amounts';

export interface ParseEligibility {
  eligible: boolean;
  /** The reason the gate is closed, or null when eligible. */
  blockReason: GateBlockReason | null;
}

export interface ParseEligibilityInput {
  /** The structured preview the shared hook produced, or null if none yet. */
  preview: PreviewData | null;
  /** A thrown / caught parse error message (the hook's `error`), or null. */
  error: string | null;
  /** The CSV single-year missing-history hard-stop flag (the hook's
   *  `csvHistoryWarning`). Only meaningful for a CSV preview. */
  csvHistoryWarning: boolean;
}

/** True when the preview carries no sells, no dividends, and no distributions,
 *  i.e. nothing to tax (the Florin-style zero-everything parse). */
function isEmptyResult(preview: PreviewData): boolean {
  return preview.sells === 0 && preview.dividends === 0 && preview.distributions === 0;
}

/**
 * Substrings that mark a parser warning as reporting a WRONG amount, not merely
 * an informational note. A file can parse into a full preview (right broker,
 * right year, non-empty) yet still carry one of these: a cell whose value we
 * could not read, or a Total column we could not find. Both silently default the
 * affected amount (to 0 or a 1:1 rate), which UNDER-reports the declaration. The
 * moat promise is a correct number, so these must close the pre-pay gate rather
 * than let the buyer pay and then hit the #24A hard-stop (the Mihai paid-then-
 * blocked shape). Sourced from the two Trading212-CSV warnings in
 * shared/src/parsers/trading212.ts (missing-total, PR #263; unreadable-value,
 * PR #264); they are broker-agnostic markers, so an equivalent warning from
 * another parser is caught too.
 *
 * FRAGILITY: this couples the client gate to parser PROSE. It is the deliberate,
 * scoped fix for backlog #24B (SUGGESTIONS S3); the durable version is
 * structured warning codes emitted by the parsers (SUGGESTIONS S6). The
 * integration test in parseEligibility.test.ts runs the real parser through this
 * predicate, so a prose change that breaks the match fails a test rather than
 * silently re-opening the gate. Match on lower-cased warnings so casing drift
 * does not matter.
 */
const UNRELIABLE_AMOUNT_WARNING_MARKERS = [
  'find a total column',
  'numeric value(s) in this file',
] as const;

function hasUnreliableAmountWarning(warnings: string[]): boolean {
  return warnings.some((w) => {
    const lower = w.toLowerCase();
    return UNRELIABLE_AMOUNT_WARNING_MARKERS.some((marker) => lower.includes(marker));
  });
}

/**
 * Decide whether a parsed statement is payment-eligible. Pure: no side effects,
 * no engine, no navigation, no analytics. Callers (PreviewPage now, the wired
 * funnel in PR-3) render off the returned verdict and fire their own telemetry.
 *
 * Ordering note: a hard error wins over everything (we could not even read the
 * file). Among fatal warnings, the order below is stable but the cases are
 * mutually exclusive enough in practice that priority rarely bites; where it
 * could (e.g. an unsupported-year empty file), the earlier reason is reported.
 */
export function evaluateParseEligibility(input: ParseEligibilityInput): ParseEligibility {
  const { preview, error, csvHistoryWarning } = input;

  // HARD ERROR: a thrown parse error, or no preview produced at all. The file is
  // unreadable, so there is nothing to gate on.
  if (error || !preview) {
    return { eligible: false, blockReason: 'unreadable' };
  }

  // FATAL: a PDF that is not a Trading212 statement (wrong file / wrong broker).
  if (preview.fileType === 'pdf' && preview.brokerMismatch) {
    return { eligible: false, blockReason: 'wrong_broker' };
  }

  // FATAL: the detected tax year is not engine-supported (Mihai's 2021 case).
  if (!isEngineSupportedTaxYear(preview.year)) {
    return { eligible: false, blockReason: 'unsupported_year' };
  }

  // FATAL: a CSV single-year export missing historical buys (cost basis would be
  // wrong). Only applies on the CSV path, where the hook computes the flag.
  if (preview.fileType === 'csv' && csvHistoryWarning) {
    return { eligible: false, blockReason: 'missing_history' };
  }

  // FATAL: nothing to tax (zero sells / dividends / distributions).
  if (isEmptyResult(preview)) {
    return { eligible: false, blockReason: 'empty' };
  }

  // FATAL: the file parsed into a full preview but a parser warning says an
  // amount is wrong (unreadable cell / missing Total column), so the number
  // would under-report. Checked last: the structural reasons above are more
  // specific (an empty or wrong-year file is not merely "amounts unreliable").
  if (hasUnreliableAmountWarning(preview.warnings)) {
    return { eligible: false, blockReason: 'unreliable_amounts' };
  }

  // ELIGIBLE: read cleanly on a supported broker + year with a non-empty result.
  // Any remaining warnings (skipped rows, duplicates removed, splits applied,
  // mixed-currency notes) are benign and do NOT block payment; the caller still
  // renders them informationally.
  return { eligible: true, blockReason: null };
}
