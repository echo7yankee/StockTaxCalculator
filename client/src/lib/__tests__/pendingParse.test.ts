import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import type { MergedParseResult, PdfParseResult } from '@shared/index';
import {
  writePendingParse,
  readPendingParse,
  clearPendingParse,
  type PendingParse,
} from '../pendingParse';

const STORAGE_KEY = 'investax.pendingParse';

function makePdfPending(overrides: Partial<PdfParseResult> = {}): PendingParse {
  const pdf: PdfParseResult = {
    overview: { currency: 'USD', closedResult: 5000.55, taxWithheld: 100 } as PdfParseResult['overview'],
    sellTrades: [
      { ticker: 'AAPL', isin: 'US0378331005', executionTime: '2025-06-01' },
    ] as unknown as PdfParseResult['sellTrades'],
    dividends: [{ ticker: 'AAPL' }] as unknown as PdfParseResult['dividends'],
    distributions: [],
    year: 2025,
    warnings: [],
    brokerMismatch: false,
    ...overrides,
  } as PdfParseResult;
  return { fileType: 'pdf', fileName: 'annual-statement-2025.pdf', pdf };
}

function makeCsvPending(): PendingParse {
  const csv: MergedParseResult = {
    transactions: [
      { action: 'sell', ticker: 'AAPL', isin: 'US0378331005', shares: 5, transactionDate: '2025-06-20' },
    ] as unknown as MergedParseResult['transactions'],
    skipped: [],
    warnings: [],
    sourceFileCount: 1,
    duplicatesRemoved: 0,
  } as MergedParseResult;
  return { fileType: 'csv', fileName: 'transactions.csv', broker: 'trading212', selectedYear: 2025, csv };
}

beforeEach(() => {
  window.sessionStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  window.sessionStorage.clear();
});

describe('pendingParse - round trip', () => {
  it('writes then reads back an identical PDF pending parse', () => {
    const pending = makePdfPending();
    expect(writePendingParse(pending)).toBe(true);
    expect(readPendingParse()).toEqual(pending);
  });

  it('writes then reads back an identical CSV pending parse', () => {
    const pending = makeCsvPending();
    expect(writePendingParse(pending)).toBe(true);
    expect(readPendingParse()).toEqual(pending);
  });

  it('preserves the discriminant and every nested parser field verbatim', () => {
    const pending = makePdfPending({ year: 2024, warnings: ['a note'] });
    writePendingParse(pending);
    const read = readPendingParse();
    expect(read?.fileType).toBe('pdf');
    // Byte-identical parser output is the load-bearing constraint: the engine must
    // receive the same structure whether re-uploaded or rehydrated.
    expect(read).toEqual(pending);
  });
});

describe('pendingParse - read guards', () => {
  it('returns null when nothing is stored', () => {
    expect(readPendingParse()).toBeNull();
  });

  it('returns null on corrupt JSON', () => {
    window.sessionStorage.setItem(STORAGE_KEY, '{ not valid json');
    expect(readPendingParse()).toBeNull();
  });

  it('returns null on a version mismatch', () => {
    window.sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: 'v0', payload: makePdfPending() }),
    );
    expect(readPendingParse()).toBeNull();
  });

  it('returns null when the version tag is absent', () => {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ payload: makePdfPending() }));
    expect(readPendingParse()).toBeNull();
  });

  it('returns null when the payload is missing', () => {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 'v1' }));
    expect(readPendingParse()).toBeNull();
  });

  it('returns null when the payload discriminant is unrecognized', () => {
    window.sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: 'v1', payload: { fileType: 'xlsx', fileName: 'x' } }),
    );
    expect(readPendingParse()).toBeNull();
  });
});

describe('pendingParse - size guard', () => {
  it('skips the write (returns false) when the serialized JSON exceeds ~2MB', () => {
    // A CSV with a huge synthetic warning string pushes the blob past the ceiling.
    const pending = makeCsvPending();
    (pending as { csv: MergedParseResult }).csv.warnings = ['x'.repeat(2 * 1024 * 1024 + 10)];
    expect(writePendingParse(pending)).toBe(false);
    // Nothing was persisted, so a later read falls back to null (re-upload path).
    expect(readPendingParse()).toBeNull();
  });

  it('writes a normal-sized parse just under the ceiling', () => {
    expect(writePendingParse(makeCsvPending())).toBe(true);
    expect(readPendingParse()).not.toBeNull();
  });
});

describe('pendingParse - clear', () => {
  it('removes a stored parse so a subsequent read returns null', () => {
    writePendingParse(makePdfPending());
    expect(readPendingParse()).not.toBeNull();
    clearPendingParse();
    expect(readPendingParse()).toBeNull();
  });

  it('is a no-op when nothing is stored', () => {
    expect(() => clearPendingParse()).not.toThrow();
    expect(readPendingParse()).toBeNull();
  });
});

describe('pendingParse - storage-throw resilience', () => {
  it('returns false (not throw) when setItem throws a quota error', () => {
    vi.spyOn(window.sessionStorage, 'setItem').mockImplementation(() => {
      throw new DOMException('QuotaExceededError');
    });
    expect(writePendingParse(makePdfPending())).toBe(false);
  });

  it('returns null (not throw) when getItem throws', () => {
    vi.spyOn(window.sessionStorage, 'getItem').mockImplementation(() => {
      throw new DOMException('SecurityError');
    });
    expect(readPendingParse()).toBeNull();
  });
});
