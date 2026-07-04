import type { MergedParseResult, PdfParseResult } from '@shared/index';
import type { BrokerId } from './brokers';

/**
 * Pending-parse persistence across the Stripe checkout redirect (backlog #24B
 * Phase 2, PR-2).
 *
 * The pre-pay gate parses the buyer's statement FREE in their own browser
 * (PreviewPage), then sends them through signup/login + Stripe checkout, which is
 * a full cross-origin `window.location` redirect. `UploadContext` is in-memory
 * `useState`, so the parse is lost on the round-trip. This module stashes the
 * PARSER output the engine consumes (never the raw File, never any engine output)
 * in `sessionStorage` so `/upload?welcome=1` can rehydrate it and run the engine
 * once, without a re-upload.
 *
 * Why sessionStorage, not localStorage: it survives the same-tab cross-origin
 * Stripe round-trip and auto-clears on tab close, so the buyer's financial data
 * is ephemeral (execution-plan Section 4, and the Phase-1 spec's "no PII at rest"
 * DO-NOT). It is same-origin and client-only; nothing is persisted server-side.
 *
 * Moat boundary (execution-plan Section 7): the stored blob is PARSER output only
 * (the discriminated `PdfParseResult` / `MergedParseResult`, plus the file label,
 * detected year, and the CSV broker + history flag the engine trigger needs). It
 * holds NO gains / tax / CASS / total / D212 figure. The engine still runs post-pay
 * on `/upload`, exactly as the re-upload path does; only its TRIGGER is new.
 *
 * The engine input must be byte-identical to the re-upload path: the parser output
 * types are plain data (numbers, strings, dates-as-strings), so a JSON round-trip
 * reproduces them exactly. The 28,053 lei founder case must therefore produce the
 * SAME number via rehydration as via re-upload (proven by an E2E).
 */

const STORAGE_KEY = 'investax.pendingParse';

/** Schema version tag. Bump when the stored shape changes; a read of a mismatched
 *  version returns null so the caller falls back to a clean re-upload rather than
 *  feeding a stale shape to the engine. */
const SCHEMA_VERSION = 'v1' as const;

/** Serialized-size ceiling. A very large IBKR history can blow past the ~5 MB
 *  sessionStorage quota; rather than risk a QuotaExceededError throw mid-write, we
 *  skip persistence above this size and let the buyer fall back to re-upload (the
 *  checker already proved the file parses). Kept well under the typical 5 MB quota. */
const MAX_SERIALIZED_BYTES = 2 * 1024 * 1024;

/** The PDF arm: the discriminated PDF parser result plus the file label. The
 *  detected year lives on `pdf.year`; the account currency on `pdf.overview`. */
interface PendingPdfParse {
  fileType: 'pdf';
  fileName: string;
  /** The exact structured result the PDF engine (`calculateTaxesFromPdf`) consumes. */
  pdf: PdfParseResult;
}

/** The CSV arm: the merged parser result, the broker (drives the beta caveat and
 *  the results `broker` field), and the year the buyer selected in the checker.
 *  The engine (`calculateTaxes`) keys tax rates + BNR fetches off `selectedYear`. */
interface PendingCsvParse {
  fileType: 'csv';
  fileName: string;
  broker: BrokerId;
  selectedYear: number;
  /** The exact merged result the CSV engine path consumes. */
  csv: MergedParseResult;
}

/** The discriminated pending-parse payload (sans the version envelope). */
export type PendingParse = PendingPdfParse | PendingCsvParse;

/** The on-disk envelope: the version tag wraps the payload so a read can reject a
 *  shape from an older/newer build before it reaches the engine. */
interface StoredEnvelope {
  version: typeof SCHEMA_VERSION;
  payload: PendingParse;
}

/** True when `window.sessionStorage` is usable. Guards SSR/prerender/tests and
 *  browsers that throw on storage access (private-mode Safari historically). */
function hasSessionStorage(): boolean {
  try {
    return typeof window !== 'undefined' && !!window.sessionStorage;
  } catch {
    return false;
  }
}

/**
 * Persist a pending parse for rehydration after the Stripe redirect. Returns true
 * when the write succeeded, false when it was skipped (no storage, oversized, or a
 * storage throw). A false return is not an error: the caller simply proceeds, and
 * `/upload?welcome=1` falls back to the normal re-upload flow.
 */
export function writePendingParse(payload: PendingParse): boolean {
  if (!hasSessionStorage()) return false;
  try {
    const envelope: StoredEnvelope = { version: SCHEMA_VERSION, payload };
    const serialized = JSON.stringify(envelope);
    // Size guard: a huge history falls back to re-upload rather than risk a quota
    // throw. `.length` is the UTF-16 code-unit count; a safe upper bound on the
    // byte size for our ASCII-dominant JSON, and cheaper than a TextEncoder pass.
    if (serialized.length > MAX_SERIALIZED_BYTES) return false;
    window.sessionStorage.setItem(STORAGE_KEY, serialized);
    return true;
  } catch {
    // A quota throw (or any storage error) must not break the unlock CTA; the
    // buyer falls back to re-upload.
    return false;
  }
}

/**
 * Read a persisted pending parse, or null when there is none, the JSON is corrupt,
 * or the schema version does not match this build. A null read is the graceful
 * fallback signal: the caller renders the normal re-upload flow unchanged.
 */
export function readPendingParse(): PendingParse | null {
  if (!hasSessionStorage()) return null;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredEnvelope> | null;
    if (!parsed || parsed.version !== SCHEMA_VERSION || !parsed.payload) return null;
    const payload = parsed.payload;
    // Minimal shape check on the discriminant so a truncated/foreign blob that
    // happens to carry the right version tag still fails closed to re-upload.
    if (payload.fileType !== 'pdf' && payload.fileType !== 'csv') return null;
    return payload;
  } catch {
    // Corrupt JSON or a storage throw: fall back to re-upload.
    return null;
  }
}

/** Remove the persisted pending parse. Called after a SUCCESSFUL rehydrated engine
 *  run so a browser refresh does not re-run it, and defensively on any invalid read. */
export function clearPendingParse(): void {
  if (!hasSessionStorage()) return;
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to do; a failed clear only means a stale key, which the version tag
    // and shape checks already defend against on the next read.
  }
}
