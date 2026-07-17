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
  'audit_trail_downloaded',
  'preview_started',
  'preview_clean',
  'preview_blocked',
  // Pre-pay parse GATE (backlog #24B Phase 2): the eligibility predicate opened
  // the gate, or closed it with a reason. The block reason rides in the event
  // name (the store keys on `name` only, no dimension column), so each reason is
  // its own allowlisted event. 'gate_blocked' (no reason) is kept as a defensive
  // fallback for a null-reason call.
  'gate_eligible',
  'gate_blocked',
  // 'rejected_file' refines 'unreadable' in telemetry only: the file never
  // reached a parser (wrong extension / over the size cap), so real parse
  // crashes stay countable on their own. Capture behavior is identical.
  'gate_blocked_rejected_file',
  'gate_blocked_unreadable',
  'gate_blocked_unsupported_year',
  'gate_blocked_missing_history',
  'gate_blocked_wrong_broker',
  'gate_blocked_empty',
  'gate_blocked_unreliable_amounts',
  'embed_calculator_used',
  'ghid_calculator_used',
] as const;

export type AnalyticsEventName = (typeof ANALYTICS_EVENTS)[number];
