// Single source of truth for the audience-capture topics. Consumed by the
// subscribe route (zod enum), the broadcast CLI, and the broadcast template
// registry, so a new topic added here propagates everywhere by type error.
export const SUBSCRIBE_TOPICS = [
  'filing_reminder',
  'broker_revolut',
  'broker_ibkr',
  'prior_years',
] as const;

export type SubscribeTopic = (typeof SUBSCRIBE_TOPICS)[number];
