// Canonical allowlist of first-party analytics event names. The POST /api/track
// route validates every incoming event against this set, so the open endpoint
// can never be used to write arbitrary rows. Keep in sync with the client
// emitter (client/src/lib/analytics.ts): a name the client sends that is absent
// here is rejected (400) and never stored.
//
// 'pageview' is emitted on every route change; the rest are the conversion-funnel
// events (originally the Plausible Goals from 05-analytics-monitoring.md Section 4.1).
export const ANALYTICS_EVENTS = [
  'pageview',
  'signup_completed',
  'calculator_used',
  'pricing_viewed',
  'paywall_seen',
  'checkout_started',
  'payment_completed',
  'pdf_uploaded',
  'csv_uploaded',
  'calculation_saved',
  'pdf_exported',
  'd212_downloaded',
  'preview_started',
  'preview_clean',
  'preview_blocked',
] as const;

export type AnalyticsEventName = (typeof ANALYTICS_EVENTS)[number];
