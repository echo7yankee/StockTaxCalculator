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
};
