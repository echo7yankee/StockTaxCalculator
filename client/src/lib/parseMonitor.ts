/**
 * Fire-and-forget parse-outcome reporting.
 *
 * Tells the server how a PDF/CSV parse went so a failure or invariant warning
 * reaches the operator inbox quickly instead of staying invisible until a
 * customer complains.
 *
 * Monitoring must never block or break the user's upload flow: this returns
 * void, the caller never awaits it, and every failure mode is swallowed.
 */

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
  summary?: ParseEventSummary;
}

export function reportParseEvent(event: ParseEvent): void {
  fetch('/api/parse-reports', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(event),
  }).catch(() => {
    // Best-effort telemetry. A failed report must never surface to the user.
  });
}
