/**
 * UI registry for the brokers InvesTax can parse.
 *
 * The shared `supportedBrokers` config (`shared/src/taxRules/romania.ts`) is the
 * source of truth for WHICH brokers have a parser; this registry adds the
 * presentation layer (display label + beta/trusted state).
 *
 * A `beta` broker is one whose parser was built to the broker's published export
 * format WITHOUT a real account to validate against (see the Regression Firewall,
 * `investax-docs/09-backlog-and-discipline.md` Section 8.6 #5). A beta broker must
 * always show a verify-before-filing caveat on the results page and may never let
 * a number reach a user without it. It graduates to `trusted` only after at least
 * 3 real anonymized user exports parse correctly end-to-end.
 */

export type BrokerId = 'trading212' | 'ibkr';

export type BrokerStatus = 'trusted' | 'beta';

export interface BrokerMeta {
  id: BrokerId;
  /** Human-readable label shown in the UI. */
  label: string;
  status: BrokerStatus;
}

export const BROKERS: Record<BrokerId, BrokerMeta> = {
  trading212: { id: 'trading212', label: 'Trading 212', status: 'trusted' },
  ibkr: { id: 'ibkr', label: 'Interactive Brokers', status: 'beta' },
};

/** Ordered list for rendering broker pickers (trusted brokers first). */
export const CSV_BROKERS: BrokerMeta[] = [BROKERS.trading212, BROKERS.ibkr];

/** Resolve broker metadata from a stored broker id, tolerating unknown values. */
export function getBrokerMeta(broker: string | null | undefined): BrokerMeta | null {
  if (broker && broker in BROKERS) return BROKERS[broker as BrokerId];
  return null;
}
