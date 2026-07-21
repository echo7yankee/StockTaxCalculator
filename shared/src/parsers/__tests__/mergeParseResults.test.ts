import { describe, it, expect } from 'vitest';
import { mergeParseResults } from '../mergeParseResults.js';
import { createWarningSink } from '../parserWarnings.js';
import { parseIbkrCsv } from '../ibkr.js';
import { parseRevolutStatement } from '../revolut.js';
import type { ParseResult, SkippedRow } from '../trading212.js';
import type { Transaction } from '../../types/transaction.js';

function tx(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 'x',
    csvUploadId: '',
    taxYearId: '',
    action: 'buy',
    transactionDate: new Date('2025-01-15'),
    isin: 'US0378331005',
    ticker: 'AAPL',
    securityName: 'Apple',
    shares: 10,
    pricePerShare: 100,
    priceCurrency: 'USD',
    totalAmountOriginal: 1000,
    exchangeRateToLocal: 1,
    totalAmountLocal: 0,
    withholdingTaxOriginal: 0,
    withholdingTaxCurrency: 'USD',
    withholdingTaxLocal: 0,
    brokerTransactionId: '',
    ...overrides,
  };
}

function result(
  transactions: Transaction[],
  warnings: string[] = [],
  skipped: SkippedRow[] = [],
): ParseResult {
  return { transactions, skipped, warnings, structuredWarnings: [] };
}

describe('mergeParseResults', () => {
  it('returns an empty result for no input files', () => {
    const merged = mergeParseResults([]);
    expect(merged.transactions).toEqual([]);
    expect(merged.skipped).toEqual([]);
    expect(merged.warnings).toEqual([]);
    expect(merged.sourceFileCount).toBe(0);
    expect(merged.duplicatesRemoved).toBe(0);
  });

  it('passes a single file through unchanged (sourceFileCount 1, no duplicates)', () => {
    const r = result(
      [tx({ ticker: 'AAPL' }), tx({ ticker: 'MSFT', isin: 'US5949181045' })],
      ['heads up'],
      [{ rowIndex: 3, reason: 'deposit', rawAction: 'Deposit' }],
    );
    const merged = mergeParseResults([r]);
    expect(merged.transactions).toHaveLength(2);
    expect(merged.warnings).toEqual(['heads up']);
    expect(merged.skipped).toHaveLength(1);
    expect(merged.sourceFileCount).toBe(1);
    expect(merged.duplicatesRemoved).toBe(0);
  });

  it('concatenates transactions from non-overlapping files', () => {
    const a = result([tx({ ticker: 'AAPL', transactionDate: new Date('2023-05-01') })]);
    const b = result([tx({ ticker: 'AAPL', action: 'sell', transactionDate: new Date('2025-06-01') })]);
    const merged = mergeParseResults([a, b]);
    expect(merged.transactions).toHaveLength(2);
    expect(merged.sourceFileCount).toBe(2);
    expect(merged.duplicatesRemoved).toBe(0);
    expect(merged.transactions.map((t) => t.action)).toEqual(['buy', 'sell']);
  });

  it('de-duplicates an exact-match transaction present in two overlapping files', () => {
    const shared = tx({ ticker: 'AAPL', transactionDate: new Date('2025-03-10'), shares: 7, totalAmountOriginal: 700 });
    const unique = tx({ ticker: 'KO', isin: 'US1912161007', transactionDate: new Date('2025-04-01') });
    const a = result([shared]);
    const b = result([{ ...shared }, unique]);
    const merged = mergeParseResults([a, b]);
    expect(merged.transactions).toHaveLength(2);
    expect(merged.duplicatesRemoved).toBe(1);
    // The first occurrence is kept; the duplicate is dropped, the new one added.
    expect(merged.transactions.map((t) => t.ticker)).toEqual(['AAPL', 'KO']);
  });

  it('collapses a file uploaded twice to a single copy', () => {
    const r = result([
      tx({ ticker: 'AAPL', transactionDate: new Date('2025-01-02') }),
      tx({ ticker: 'AAPL', action: 'sell', transactionDate: new Date('2025-09-02'), shares: 4, totalAmountOriginal: 800 }),
    ]);
    const merged = mergeParseResults([r, { ...r, transactions: [...r.transactions] }]);
    expect(merged.transactions).toHaveLength(2);
    expect(merged.duplicatesRemoved).toBe(2);
  });

  it('keys de-duplication on semantic fields, not the synthetic per-file id', () => {
    const a = result([tx({ id: 'file-a-0' })]);
    const b = result([tx({ id: 'file-b-0' })]);
    const merged = mergeParseResults([a, b]);
    expect(merged.transactions).toHaveLength(1);
    expect(merged.duplicatesRemoved).toBe(1);
  });

  it('does NOT merge two genuinely distinct trades that share security and date', () => {
    // Same security, same instant, but different share counts and amounts:
    // two real partial fills, not a double-count.
    const a = result([tx({ shares: 3, totalAmountOriginal: 300 })]);
    const b = result([tx({ shares: 5, totalAmountOriginal: 500 })]);
    const merged = mergeParseResults([a, b]);
    expect(merged.transactions).toHaveLength(2);
    expect(merged.duplicatesRemoved).toBe(0);
  });

  it('de-duplicates identical warning strings but keeps distinct ones', () => {
    const a = result([], ['Skipped non-stock positions (Forex).', 'File A only']);
    const b = result([], ['Skipped non-stock positions (Forex).', 'File B only']);
    const merged = mergeParseResults([a, b]);
    expect(merged.warnings).toEqual([
      'Skipped non-stock positions (Forex).',
      'File A only',
      'File B only',
    ]);
  });

  it('concatenates skipped rows from every file as-is', () => {
    const a = result([], [], [{ rowIndex: 1, reason: 'deposit', rawAction: 'Deposit' }]);
    const b = result([], [], [{ rowIndex: 2, reason: 'withdrawal', rawAction: 'Withdrawal' }]);
    const merged = mergeParseResults([a, b]);
    expect(merged.skipped).toHaveLength(2);
  });

  it('treats buy and sell of the same security/date/amount as distinct', () => {
    const a = result([tx({ action: 'buy' })]);
    const b = result([tx({ action: 'sell' })]);
    const merged = mergeParseResults([a, b]);
    expect(merged.transactions).toHaveLength(2);
    expect(merged.duplicatesRemoved).toBe(0);
  });

  it('keeps all THREE codes of the shared no-transactions prose across a merge (S15)', () => {
    // "No transactions could be parsed from this file." is one byte-identical
    // template shared by t212 / ibkr / revolut -- the same hazard class as the
    // unsupported-currency pair pinned below: if one broker's severity ever
    // diverged, a message-only dedupe would keep whichever twin merged first
    // and could mask the fatal one. This pins that every code survives the
    // code+message dedupe. IBKR and Revolut produce the warning through the
    // REAL parsers (a recognised statement that yields no rows); the T212
    // branch is defensive-only today (every T212 row lands in transactions or
    // skipped, and an empty file returns early with its own code), so its
    // entry goes through the real sink instead.
    const NO_TRANSACTIONS = 'No transactions could be parsed from this file.';
    const ibkr = parseIbkrCsv([
      ['Trades', 'Header', 'DataDiscriminator', 'Asset Category', 'Currency', 'Symbol', 'Date/Time', 'Quantity', 'T. Price', 'Proceeds', 'Comm/Fee'],
    ]);
    const revolut = parseRevolutStatement([
      ['Date', 'Ticker', 'Type', 'Quantity', 'Price per share', 'Total Amount', 'Currency', 'FX Rate'],
    ]);
    const t212Sink = createWarningSink();
    t212Sink.push('t212_no_transactions_parsed', NO_TRANSACTIONS);
    const t212: ParseResult = {
      transactions: [],
      skipped: [],
      warnings: t212Sink.warnings,
      structuredWarnings: t212Sink.structuredWarnings,
    };

    // Premise guard: the two real parsers really emit the shared sentence, so
    // the pin cannot rot into a no-op if their empty-statement handling changes.
    expect(ibkr.structuredWarnings.map((w) => w.code)).toContain('ibkr_no_transactions_parsed');
    expect(revolut.structuredWarnings.map((w) => w.code)).toContain('revolut_no_transactions_parsed');
    for (const r of [ibkr, revolut, t212]) {
      expect(r.warnings).toContain(NO_TRANSACTIONS);
    }

    const merged = mergeParseResults([t212, ibkr, revolut]);

    // Prose says the shared sentence once; structured keeps one entry per code.
    expect(merged.warnings.filter((w) => w === NO_TRANSACTIONS)).toHaveLength(1);
    const codes = merged.structuredWarnings.map((w) => w.code);
    expect(codes).toContain('t212_no_transactions_parsed');
    expect(codes).toContain('ibkr_no_transactions_parsed');
    expect(codes).toContain('revolut_no_transactions_parsed');
  });
});
