import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { stashUploadForCheckout, consumeUploadStash, peekUploadStash, clearUploadStash } from '../uploadStash';
import type { TaxCalculationResult, SecurityBreakdown } from '@shared/index';

const STASH_KEY = 'investax_upload_stash_v1';

const taxResult: TaxCalculationResult = {
  taxYearId: '2025',
  capitalGains: { totalProceeds: 100, totalCostBasis: 50, netGains: 50, losses: 0, taxRate: 0.1, taxOwed: 5 },
  dividends: { grossTotal: 10, withholdingTaxPaid: 0, taxOwed: 1 },
  healthContribution: { totalNonSalaryIncome: 60, thresholdHit: '6x', amountOwed: 0 },
  totals: { totalTaxOwed: 6, earlyFilingDiscount: 0, totalAfterDiscount: 6 },
  calculatedAt: new Date('2026-05-25'),
} as TaxCalculationResult;

const securities: SecurityBreakdown[] = [];

beforeEach(() => {
  sessionStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('uploadStash - stash + consume round-trip', () => {
  it('round-trips a full upload payload through sessionStorage', () => {
    stashUploadForCheckout({
      parseResult: null,
      parseWarnings: ['warn one'],
      transactions: [],
      taxResult,
      securities,
      fileName: 'statement.pdf',
      taxYear: 2025,
    });

    const out = consumeUploadStash();
    expect(out).not.toBeNull();
    expect(out!.fileName).toBe('statement.pdf');
    expect(out!.taxYear).toBe(2025);
    expect(out!.parseWarnings).toEqual(['warn one']);
    expect(out!.taxResult).toEqual(JSON.parse(JSON.stringify(taxResult)));
    expect(typeof out!.stashedAt).toBe('number');
  });

  it('clears the stash on consume so the next call returns null', () => {
    stashUploadForCheckout({
      parseResult: null,
      parseWarnings: [],
      transactions: [],
      taxResult,
      securities: [],
      fileName: 'a.pdf',
      taxYear: 2025,
    });

    expect(consumeUploadStash()).not.toBeNull();
    expect(consumeUploadStash()).toBeNull();
  });

  it('returns null when no stash is present', () => {
    expect(consumeUploadStash()).toBeNull();
  });

  it('returns null when the stash payload is not valid JSON', () => {
    sessionStorage.setItem(STASH_KEY, '{not valid json');
    expect(consumeUploadStash()).toBeNull();
  });
});

describe('uploadStash - TTL', () => {
  it('returns null when the stash is older than 1 hour', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-25T12:00:00Z'));

    stashUploadForCheckout({
      parseResult: null,
      parseWarnings: [],
      transactions: [],
      taxResult,
      securities: [],
      fileName: 'a.pdf',
      taxYear: 2025,
    });

    // Fast-forward 61 minutes (1 minute past TTL).
    vi.setSystemTime(new Date('2026-05-25T13:01:00Z'));
    expect(consumeUploadStash()).toBeNull();
  });

  it('returns the stash when within the 1-hour TTL', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-25T12:00:00Z'));

    stashUploadForCheckout({
      parseResult: null,
      parseWarnings: [],
      transactions: [],
      taxResult,
      securities: [],
      fileName: 'a.pdf',
      taxYear: 2025,
    });

    // 30 minutes later, still valid.
    vi.setSystemTime(new Date('2026-05-25T12:30:00Z'));
    expect(consumeUploadStash()).not.toBeNull();
  });

  it('peek removes an expired stash and returns null', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-25T12:00:00Z'));

    stashUploadForCheckout({
      parseResult: null,
      parseWarnings: [],
      transactions: [],
      taxResult,
      securities: [],
      fileName: 'a.pdf',
      taxYear: 2025,
    });

    vi.setSystemTime(new Date('2026-05-25T13:01:00Z'));
    expect(peekUploadStash()).toBeNull();
    expect(sessionStorage.getItem(STASH_KEY)).toBeNull();
  });
});

describe('uploadStash - peek + clear', () => {
  it('peek returns the stash without clearing it', () => {
    stashUploadForCheckout({
      parseResult: null,
      parseWarnings: [],
      transactions: [],
      taxResult,
      securities: [],
      fileName: 'a.pdf',
      taxYear: 2025,
    });

    expect(peekUploadStash()).not.toBeNull();
    // A second consume after peek must still return data.
    expect(consumeUploadStash()).not.toBeNull();
  });

  it('clearUploadStash empties the stash', () => {
    stashUploadForCheckout({
      parseResult: null,
      parseWarnings: [],
      transactions: [],
      taxResult,
      securities: [],
      fileName: 'a.pdf',
      taxYear: 2025,
    });

    clearUploadStash();
    expect(consumeUploadStash()).toBeNull();
  });
});

describe('uploadStash - failure modes', () => {
  it('stash failure does not throw when sessionStorage is unavailable', () => {
    const original = sessionStorage.setItem;
    sessionStorage.setItem = () => {
      throw new Error('QuotaExceededError');
    };
    try {
      expect(() => stashUploadForCheckout({
        parseResult: null,
        parseWarnings: [],
        transactions: [],
        taxResult,
        securities: [],
        fileName: 'a.pdf',
        taxYear: 2025,
      })).not.toThrow();
    } finally {
      sessionStorage.setItem = original;
    }
  });

  it('returns null when stashedAt is missing or non-numeric', () => {
    sessionStorage.setItem(STASH_KEY, JSON.stringify({ fileName: 'x.pdf', stashedAt: 'not-a-number' }));
    expect(consumeUploadStash()).toBeNull();
  });
});
