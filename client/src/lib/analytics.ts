/**
 * Plausible Analytics custom event tracking.
 * Events only fire when the Plausible script is loaded (production with VITE_PLAUSIBLE_DOMAIN set).
 */

type PlausibleArgs = [string, { callback?: () => void; props?: Record<string, string | number | boolean> }?];

declare global {
  interface Window {
    plausible?: (...args: PlausibleArgs) => void;
  }
}

function trackEvent(event: string, props?: Record<string, string | number | boolean>) {
  if (typeof window.plausible === 'function') {
    window.plausible(event, props ? { props } : undefined);
  }
}

// Conversion funnel events (from 05-analytics-monitoring.md Section 4.1)
export const analytics = {
  signupCompleted: () => trackEvent('signup_completed'),
  calculatorUsed: () => trackEvent('calculator_used'),
  pricingViewed: () => trackEvent('pricing_viewed'),
  checkoutStarted: () => trackEvent('checkout_started'),
  paymentCompleted: () => trackEvent('payment_completed'),
  pdfUploaded: () => trackEvent('pdf_uploaded'),
  csvUploaded: () => trackEvent('csv_uploaded'),
  calculationSaved: () => trackEvent('calculation_saved'),
  pdfExported: () => trackEvent('pdf_exported'),
  // Pre-paywall preview funnel (PR 4 backlog #24 sub-item B).
  // shown: PDF parse rendered on /upload for any logged-in user (free or paid).
  // confirmed: free user clicked Unlock on /results, initiated Stripe checkout.
  // abandoned: free user left /results without clicking Unlock (cleanup-fired).
  pdfPreviewShown: () => trackEvent('pdf_preview_shown'),
  pdfPreviewConfirmed: () => trackEvent('pdf_preview_confirmed'),
  pdfPreviewAbandoned: () => trackEvent('pdf_preview_abandoned'),
};
