/**
 * First-party client error capture. Beacons uncaught client errors to our own
 * /api/errors endpoint, where they land in the same grouped ErrorEvent table as
 * server errors (source='client'). This is the client half of the first-party
 * error monitoring that replaces Sentry (Sentry stays wired until PR3).
 *
 * Best-effort and non-blocking, exactly like the analytics emitter: uses
 * navigator.sendBeacon (which survives page unload, falling back to keepalive
 * fetch), is a no-op outside the browser (SSR/prerender/tests), and swallows
 * every error. Telemetry must NEVER be able to break the page it is reporting on.
 *
 * The server re-filters junk + re-truncates + PII-scrubs in recordError, so this
 * module only has to avoid wasting beacons: it drops known browser/extension
 * noise, de-dups repeats within a page session, and hard-caps total sends so an
 * error loop cannot flood the endpoint.
 */

export interface ClientError {
  name?: string;
  message?: string;
  stack?: string;
  context?: string;
}

const MESSAGE_MAX = 2000;
const STACK_MAX = 10000;
// Stop after this many DISTINCT errors in one page session; an error loop that
// throws thousands of times can never turn into thousands of beacons.
const MAX_SENDS_PER_SESSION = 20;

// Browser / extension / transient-network noise we never want to record. Mirrors
// the server-side JUNK_PATTERNS in server/src/lib/errorMonitor.ts: recordError
// re-filters these, but matching here avoids wasting a beacon on them.
const JUNK_PATTERNS: readonly RegExp[] = [
  /ResizeObserver loop/i,
  /Non-Error promise rejection captured/i,
  /Failed to fetch/i,
  /NetworkError when attempting to fetch/i,
  /Load failed/i,
  /The operation was aborted/i,
  /chrome-extension:\/\//i,
  /moz-extension:\/\//i,
  /safari-extension:\/\//i,
];

function isJunk(message: string): boolean {
  return JUNK_PATTERNS.some((re) => re.test(message));
}

// Per page session (module lifetime) de-dup + cap state. A page reload resets it.
const seen = new Set<string>();

/**
 * Report one client-side captured error to /api/errors. Safe to call from
 * anywhere: it is a no-op in SSR/prerender, drops known noise, de-dups repeats,
 * caps total sends, and swallows every error so it can never break the page.
 */
export function reportClientError(err: ClientError): void {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return;
  try {
    const rawMessage = err.message ?? '';
    if (isJunk(rawMessage)) return;

    // De-dup on name|message; also enforce the hard per-session cap. We add the
    // key before the size cap check so a flood of new distinct errors still stops
    // at the cap (rather than every distinct error always sending).
    const key = `${err.name ?? 'Error'}|${rawMessage}`;
    if (seen.has(key)) return;
    if (seen.size >= MAX_SENDS_PER_SESSION) return;
    seen.add(key);

    const body = JSON.stringify({
      name: err.name,
      message: rawMessage ? rawMessage.slice(0, MESSAGE_MAX) : undefined,
      stack: err.stack ? err.stack.slice(0, STACK_MAX) : undefined,
      context: err.context,
    });

    if (typeof navigator.sendBeacon === 'function') {
      navigator.sendBeacon('/api/errors', new Blob([body], { type: 'application/json' }));
    } else {
      void fetch('/api/errors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: true,
      }).catch(() => {});
    }
  } catch {
    // Telemetry must never break the page.
  }
}

// Derive a {name, message, stack} triple from an unhandledrejection reason, which
// may be an Error, a string, or any thrown value.
function fromReason(reason: unknown): ClientError {
  if (reason instanceof Error) {
    return { name: reason.name, message: reason.message, stack: reason.stack };
  }
  return { name: 'UnhandledRejection', message: typeof reason === 'string' ? reason : String(reason) };
}

let installed = false;

/**
 * Register global window.onerror + unhandledrejection handlers ONCE, each
 * funnelling into reportClientError. Idempotent: a second call is a no-op.
 * Caught render errors are handled separately by ErrorBoundary.
 */
export function initErrorMonitor(): void {
  if (typeof window === 'undefined') return;
  if (installed) return;
  installed = true;

  window.addEventListener('error', (event: ErrorEvent) => {
    const e = event.error;
    if (e instanceof Error) {
      reportClientError({ name: e.name, message: e.message, stack: e.stack, context: 'window.onerror' });
    } else {
      reportClientError({ name: 'Error', message: event.message, context: 'window.onerror' });
    }
  });

  window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
    reportClientError({ ...fromReason(event.reason), context: 'unhandledrejection' });
  });
}
