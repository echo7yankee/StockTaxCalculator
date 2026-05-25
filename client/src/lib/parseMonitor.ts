/**
 * Fire-and-forget parse-outcome reporting.
 *
 * Tells the server how a PDF/CSV parse went so a failure or invariant warning
 * reaches the operator inbox quickly instead of staying invisible until a
 * customer complains. Also tags the event in Sentry (a no-op when SENTRY_DSN
 * is unset, but the call site is then ready once Dragos configures the DSN).
 *
 * Monitoring must never block or break the user's upload flow: this returns
 * void, the caller never awaits it, and every failure mode is swallowed.
 */

import { Sentry } from './sentry';

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

function captureToSentry(event: ParseEvent): void {
  const parserCount = event.warnings?.length ?? 0;
  const engineCount = event.engineWarnings?.length ?? 0;
  const hasWarnings = parserCount + engineCount > 0;
  const isError = event.outcome === 'error';

  if (!hasWarnings && !isError) return;

  const message = isError ? 'Parser error reported' : 'Parser warnings detected';
  Sentry.captureMessage(message, {
    level: isError ? 'error' : 'warning',
    tags: {
      component: 'parser',
      fileType: event.fileType,
      outcome: event.outcome,
      parserWarningCount: String(parserCount),
      engineWarningCount: String(engineCount),
    },
    extra: {
      fileName: event.fileName ?? null,
      errorMessage: event.errorMessage ?? null,
      warnings: event.warnings ?? [],
      engineWarnings: event.engineWarnings ?? [],
      summary: event.summary ?? null,
    },
  });
}

export function reportParseEvent(event: ParseEvent): void {
  try {
    captureToSentry(event);
  } catch {
    // Sentry call must never break the upload flow.
  }

  fetch('/api/parse-reports', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(event),
  }).catch(() => {
    // Best-effort telemetry. A failed report must never surface to the user.
  });
}
