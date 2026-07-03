/**
 * First-party, cookieless analytics. Sends pageviews + conversion-funnel events
 * to our own /api/track endpoint instead of a third-party script (replaces
 * Plausible). No cookie, no third party, no PII: the server stores only the
 * event name, the pathname, and the referrer host.
 *
 * Best-effort and non-blocking: uses navigator.sendBeacon (which survives page
 * unload), swallows every error, and is a no-op outside the browser
 * (SSR/prerender/tests). The public `analytics.*` API is unchanged from the
 * Plausible version, so no call site had to change.
 *
 * Event names must match the server allowlist in server/src/lib/analyticsEvents.ts.
 */

import type { GateBlockReason } from './parseEligibility';

function send(name: string) {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return;
  try {
    const body = JSON.stringify({
      name,
      path: window.location?.pathname,
      referrer: document.referrer || undefined,
    });
    if (typeof navigator.sendBeacon === 'function') {
      navigator.sendBeacon('/api/track', new Blob([body], { type: 'application/json' }));
    } else {
      void fetch('/api/track', {
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

// Conversion funnel events (from 05-analytics-monitoring.md Section 4.1).
export const analytics = {
  pageview: () => send('pageview'),
  signupCompleted: () => send('signup_completed'),
  calculatorUsed: () => send('calculator_used'),
  pricingViewed: () => send('pricing_viewed'),
  paywallSeen: () => send('paywall_seen'),
  checkoutStarted: () => send('checkout_started'),
  paymentCompleted: () => send('payment_completed'),
  pdfUploaded: () => send('pdf_uploaded'),
  csvUploaded: () => send('csv_uploaded'),
  calculationSaved: () => send('calculation_saved'),
  pdfExported: () => send('pdf_exported'),
  d212Downloaded: () => send('d212_downloaded'),
  auditTrailDownloaded: () => send('audit_trail_downloaded'),
  // Pre-paywall parse checker (backlog #24B): started a check, the file is clean
  // and supported (the unlock-CTA is shown), or it is blocked by a warning /
  // unsupported broker-year (the lead-capture path is shown instead).
  previewStarted: () => send('preview_started'),
  previewClean: () => send('preview_clean'),
  previewBlocked: () => send('preview_blocked'),
  // Pre-pay parse GATE (backlog #24B Phase 2): the eligibility predicate opened
  // (gate_eligible) or closed the gate. The block reason rides in the event NAME
  // rather than a separate dimension, because the analytics store keys on `name`
  // only (no dimension column, and adding one would need a DB migration). A null
  // reason should not happen on the blocked path, but is mapped defensively so a
  // stray call still records a countable event.
  gateEligible: () => send('gate_eligible'),
  gateBlocked: (reason: GateBlockReason | null) =>
    send(reason ? `gate_blocked_${reason}` : 'gate_blocked'),
  // Distribution widget (/embed/calculator): the calculator was run inside an
  // embed on a third-party site. Beacons same-origin (the iframe origin is ours),
  // and the route's pageview already carries the embedding site as referrer.
  embedCalculatorUsed: () => send('embed_calculator_used'),
  // Topic-scoped calculator widgets embedded in the SEO /ghid pages (the dividende
  // and CASS widgets). Fired on a successful in-page calculation so we can see
  // engagement on those search-intent pages; the beacon's path field tells which
  // page (e.g. /ghid/dividende-broker-strain vs /ghid/cass-investitii).
  ghidCalculatorUsed: () => send('ghid_calculator_used'),
};
