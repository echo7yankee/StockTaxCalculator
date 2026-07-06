// Single source of truth for the audience-capture topics. Consumed by the
// subscribe route (zod enum), the broadcast CLI, and the broadcast template
// registry, so a new topic added here propagates everywhere by type error.
export const SUBSCRIBE_TOPICS = [
  'filing_reminder',
  'broker_revolut',
  'broker_ibkr',
  'prior_years',
  // Gate-blocked lead capture (backlog #24B Phase 2, PR-4): a statement the free
  // checker could not read or support. `crypto_exchange` splits out the visitors
  // who self-identify their file as coming from a crypto exchange (Binance etc.),
  // so that list is directly addressable if crypto support ever ships (board #6
  // demand instrumentation, not crypto support).
  'unsupported_statement',
  'crypto_exchange',
] as const;

export type SubscribeTopic = (typeof SUBSCRIBE_TOPICS)[number];
