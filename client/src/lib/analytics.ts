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
};
