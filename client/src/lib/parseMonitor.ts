/**
 * Fire-and-forget parse-outcome reporting.
 *
 * Tells the server how a PDF/CSV parse went so a failure or invariant warning
 * reaches the operator inbox quickly instead of staying invisible until a
 * customer complains. A genuine parse FAILURE is additionally recorded in the
 * first-party error monitor (it shows in the admin Errors dashboard); parser /
 * engine WARNINGS are data-quality signals, not JS errors, so they stay in the
 * parse-report channel only and never reach the error dashboard.
 *
 * Monitoring must never block or break the user's upload flow: this returns
 * void, the caller never awaits it, and every failure mode is swallowed.
 */

import { reportClientError } from './errorMonitor';

export type ParseFileType = 'pdf' | 'csv';
export type ParseOutcome = 'success' | 'warning' | 'error';

export interface ParseEventSummary {
  buys?: number;
  sells?: number;
  dividends?: number;
  distributions?: number;
  skipped?: number;
  totalRows?: number;
  pages?: number;
  year?: number;
}

export interface ParseEvent {
  fileType: ParseFileType;
  outcome: ParseOutcome;
  fileName?: string | null;
  errorMessage?: string | null;
  warnings?: string[];
  engineWarnings?: string[];
  summary?: ParseEventSummary;
}

// Surface a genuine parse FAILURE into the first-party error monitor so it shows
// in the admin Errors dashboard. reportClientError is self-contained (SSR-safe,
// junk-filtered, de-duped, never throws), so this is safe to call directly.
function recordParseError(event: ParseEvent): void {
  if (event.outcome !== 'error') return;
  reportClientError({
    name: 'ParseError',
    message: event.errorMessage || `Parser error (${event.fileType})`,
    context: `parser:${event.fileType}`,
  });
}

export function reportParseEvent(event: ParseEvent): void {
  recordParseError(event);

  fetch('/api/parse-reports', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(event),
  }).catch(() => {
    // Best-effort telemetry. A failed report must never surface to the user.
  });
}
