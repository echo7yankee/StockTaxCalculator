import { getLatestEngineSupportedConfig } from '@shared/taxRules/taxYears';
import type { GateBlockReason } from './parseEligibility';
import type { BrokerMeta } from './brokers';
import type { SubscribeTopic } from '../components/common/EmailCapture';

/**
 * Gate-blocked lead capture mapping (backlog #24B Phase 2, PR-4).
 *
 * Every visitor the pre-pay gate blocks is a measured, high-intent lead. This
 * module decides WHICH waitlist an email capture on the blocked state joins,
 * from the gate's block reason plus what we know about the attempt. Pure and
 * parser-output-only, like the eligibility predicate it keys off: no engine
 * value enters this decision (the moat boundary).
 *
 * The mapping:
 *  - `missing_history` -> NO capture. The fix is in the user's hands (re-export
 *    with full history); a "we'll email you when we support it" list would tell
 *    them to wait for us, which is the wrong action.
 *  - `unsupported_year` -> a year list. A year AFTER the latest engine-supported
 *    one (e.g. a 2026 YTD statement today) joins `filing_reminder`, whose
 *    welcome copy is exactly "when filing opens for 2026 income". Anything
 *    older (2022 and earlier, pre-CMP territory) joins `prior_years`.
 *  - `unreadable` / `wrong_broker` / `empty` -> a statement-support list. When
 *    the attempt was on a KNOWN beta broker (IBKR / Revolut CSV), keep that
 *    broker's graduation waitlist. Otherwise the visitor may optionally tell us
 *    where the statement came from (the origin select): a crypto origin joins
 *    `crypto_exchange` (board #6 demand instrumentation), anything else joins
 *    the generic `unsupported_statement` list.
 *
 * The `source` string carries the block reason (and origin, when given) so each
 * subscriber row is attributable in the DB without a schema change. It must
 * stay within the subscribe API's 60-char `source` cap.
 */

/** Self-identified statement origins offered on the blocked state. XTB is
 *  deliberately NOT listed: XTB withholds capital-gains tax at source, so its
 *  users should read /ghid/impozit-xtb, not wait for a parser (backlog #26). */
export const STATEMENT_ORIGINS = [
  'binance',
  'coinbase',
  'kraken',
  'crypto_other',
  'etoro',
  'broker_other',
] as const;

export type StatementOrigin = (typeof STATEMENT_ORIGINS)[number];

const CRYPTO_ORIGINS: ReadonlySet<StatementOrigin> = new Set([
  'binance',
  'coinbase',
  'kraken',
  'crypto_other',
]);

/** The block reasons where we do not know which broker/exchange the file came
 *  from, so the optional origin select is worth showing. */
const STATEMENT_LEVEL_REASONS: ReadonlySet<GateBlockReason> = new Set([
  'unreadable',
  'wrong_broker',
  'empty',
]);

export interface BlockedCaptureInput {
  reason: GateBlockReason;
  /** Best-known broker for the attempt (PDF tab -> Trading 212; CSV tab -> the
   *  selected broker). */
  broker: BrokerMeta;
  /** The detected tax year, when a parse landed far enough to know it. */
  year: number | null;
  /** The visitor's optional self-identified statement origin, when the select
   *  was shown and used. */
  origin: StatementOrigin | null;
}

export interface BlockedCapture {
  topic: SubscribeTopic;
  /** Attribution string for the subscriber row (<= 60 chars). */
  source: string;
}

/** Whether the optional "where is this statement from?" select applies: only
 *  for statement-level blocks where the origin is genuinely unknown (a beta
 *  broker attempt already names its broker). */
export function shouldAskStatementOrigin(reason: GateBlockReason, broker: BrokerMeta): boolean {
  return STATEMENT_LEVEL_REASONS.has(reason) && broker.status !== 'beta';
}

/**
 * Resolve the waitlist for a blocked parse, or null when no list fits (the
 * user-actionable missing-history case). Pure; the caller renders EmailCapture
 * off the result and the contact CTA stays available regardless.
 */
export function resolveBlockedCapture(input: BlockedCaptureInput): BlockedCapture | null {
  const { reason, broker, year, origin } = input;

  if (reason === 'missing_history') return null;

  if (reason === 'unsupported_year') {
    const latestSupported = getLatestEngineSupportedConfig().taxYear;
    const topic: SubscribeTopic =
      year !== null && year > latestSupported ? 'filing_reminder' : 'prior_years';
    return { topic, source: `checker:unsupported_year:${broker.id}` };
  }

  // Statement-level blocks: unreadable / wrong_broker / empty.
  if (broker.status === 'beta') {
    // A known beta broker keeps its graduation waitlist (same list the checker
    // offered before PR-4), with the reason now carried in the source.
    const topic: SubscribeTopic = broker.id === 'ibkr' ? 'broker_ibkr' : 'broker_revolut';
    return { topic, source: `checker:${reason}` };
  }

  if (origin && CRYPTO_ORIGINS.has(origin)) {
    return { topic: 'crypto_exchange', source: `checker:${reason}:${origin}` };
  }

  return {
    topic: 'unsupported_statement',
    source: origin ? `checker:${reason}:${origin}` : `checker:${reason}`,
  };
}
