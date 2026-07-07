import { describe, it, expect } from 'vitest';
import { getLatestEngineSupportedConfig } from '@shared/taxRules/taxYears';
import {
  resolveBlockedCapture,
  shouldAskStatementOrigin,
  STATEMENT_ORIGINS,
} from '../blockedCapture';
import { BROKERS } from '../brokers';

/**
 * Gate-blocked lead-capture mapping (backlog #24B Phase 2, PR-4). The mapping is
 * pure parser-metadata -> waitlist; nothing here may depend on engine output.
 */

const T212 = BROKERS.trading212;
const IBKR = BROKERS.ibkr;
const REVOLUT = BROKERS.revolut;

describe('resolveBlockedCapture - missing_history (user-actionable, no list)', () => {
  it('returns null: the fix is re-exporting with full history, not waiting for us', () => {
    expect(
      resolveBlockedCapture({ reason: 'missing_history', broker: T212, year: 2025, origin: null }),
    ).toBeNull();
  });
});

describe('resolveBlockedCapture - unsupported_year routes to a year list', () => {
  it('a pre-supported year (2022) joins prior_years with broker attribution', () => {
    expect(
      resolveBlockedCapture({ reason: 'unsupported_year', broker: T212, year: 2022, origin: null }),
    ).toEqual({ topic: 'prior_years', source: 'checker:unsupported_year:trading212' });
  });

  it('a year AFTER the latest engine-supported one joins filing_reminder', () => {
    const future = getLatestEngineSupportedConfig().taxYear + 1;
    expect(
      resolveBlockedCapture({ reason: 'unsupported_year', broker: T212, year: future, origin: null }),
    ).toEqual({ topic: 'filing_reminder', source: 'checker:unsupported_year:trading212' });
  });

  it('an unknown year defaults to prior_years (never filing_reminder on a guess)', () => {
    expect(
      resolveBlockedCapture({ reason: 'unsupported_year', broker: IBKR, year: null, origin: null }),
    ).toEqual({ topic: 'prior_years', source: 'checker:unsupported_year:ibkr' });
  });
});

describe('resolveBlockedCapture - statement-level blocks (unreadable / wrong_broker / empty)', () => {
  it('a beta broker attempt keeps its graduation waitlist (IBKR)', () => {
    expect(
      resolveBlockedCapture({ reason: 'empty', broker: IBKR, year: 2025, origin: null }),
    ).toEqual({ topic: 'broker_ibkr', source: 'checker:empty' });
  });

  it('a beta broker attempt keeps its graduation waitlist (Revolut, unreadable)', () => {
    expect(
      resolveBlockedCapture({ reason: 'unreadable', broker: REVOLUT, year: null, origin: null }),
    ).toEqual({ topic: 'broker_revolut', source: 'checker:unreadable' });
  });

  it('a crypto origin joins the crypto-interest list with the origin in the source', () => {
    expect(
      resolveBlockedCapture({ reason: 'unreadable', broker: T212, year: null, origin: 'binance' }),
    ).toEqual({ topic: 'crypto_exchange', source: 'checker:unreadable:binance' });
  });

  it('every crypto origin maps to crypto_exchange; broker origins do not', () => {
    for (const origin of ['binance', 'coinbase', 'kraken', 'crypto_other'] as const) {
      expect(
        resolveBlockedCapture({ reason: 'empty', broker: T212, year: null, origin })?.topic,
      ).toBe('crypto_exchange');
    }
    for (const origin of ['etoro', 'broker_other'] as const) {
      const capture = resolveBlockedCapture({ reason: 'empty', broker: T212, year: null, origin });
      expect(capture?.topic).toBe('unsupported_statement');
      expect(capture?.source).toBe(`checker:empty:${origin}`);
    }
  });

  it('no origin picked joins the generic unsupported_statement list', () => {
    expect(
      resolveBlockedCapture({ reason: 'wrong_broker', broker: T212, year: 2025, origin: null }),
    ).toEqual({ topic: 'unsupported_statement', source: 'checker:wrong_broker' });
  });
});

describe('resolveBlockedCapture - source stays inside the subscribe API cap', () => {
  it('every reachable source string is <= 60 chars (the zod source limit)', () => {
    const reasons = ['unreadable', 'unsupported_year', 'missing_history', 'wrong_broker', 'empty'] as const;
    const brokers = [T212, IBKR, REVOLUT];
    const origins = [null, ...STATEMENT_ORIGINS];
    for (const reason of reasons) {
      for (const broker of brokers) {
        for (const origin of origins) {
          const capture = resolveBlockedCapture({ reason, broker, year: 2022, origin });
          if (capture) expect(capture.source.length).toBeLessThanOrEqual(60);
        }
      }
    }
  });
});

describe('shouldAskStatementOrigin', () => {
  it('asks only for statement-level blocks on a non-beta attempt', () => {
    expect(shouldAskStatementOrigin('unreadable', T212)).toBe(true);
    expect(shouldAskStatementOrigin('wrong_broker', T212)).toBe(true);
    expect(shouldAskStatementOrigin('empty', T212)).toBe(true);
  });

  it('does not ask when the year or history is the problem (origin is known)', () => {
    expect(shouldAskStatementOrigin('unsupported_year', T212)).toBe(false);
    expect(shouldAskStatementOrigin('missing_history', T212)).toBe(false);
  });

  it('does not ask on a beta broker attempt (the broker is already named)', () => {
    expect(shouldAskStatementOrigin('unreadable', IBKR)).toBe(false);
    expect(shouldAskStatementOrigin('empty', REVOLUT)).toBe(false);
  });
});
