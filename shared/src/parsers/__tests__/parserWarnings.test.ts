import { describe, it, expect } from 'vitest';
import {
  WARNING_SEVERITY,
  createWarningSink,
  hasFatalWarning,
  type ParserWarningCode,
} from '../parserWarnings.js';
import { parseTrading212Csv } from '../trading212.js';
import { parseIbkrCsv } from '../ibkr.js';
import { parseRevolutStatement } from '../revolut.js';
import { parseTrading212AnnualStatement } from '../trading212Pdf.js';
import { mergeParseResults } from '../mergeParseResults.js';
import type { RawCsvRow } from '../../types/transaction.js';

/**
 * Contract coverage for structured parser warnings (SUGGESTIONS S6 phase A).
 *
 * Two things must hold for the pre-pay gate to be able to trust `severity`:
 *  1. the two warning channels never drift (same messages, same order), and
 *  2. the FATAL set is exactly what we intend -- pinned explicitly here, so
 *     flipping a severity is a deliberate, test-breaking act rather than a
 *     silent change to who can pay.
 *
 * The per-parser cases run the REAL parsers rather than asserting against
 * hand-written warning objects: that is the same "pin it with the real producer"
 * pattern PR #265 used, and it is what makes this suite catch a parser that adds
 * a warning through the old bare-array path.
 */

/**
 * The complete set of warnings that mean the declaration would be UNDER-stated.
 * Each one drops or defaults a real taxable amount while still producing an
 * otherwise-usable preview, so each one must close the pre-pay gate.
 *
 * Adding a code here is a product decision (it stops someone from paying);
 * removing one is a correctness decision (it lets a wrong number through).
 * Neither should happen as a side effect of an unrelated change.
 */
const EXPECTED_FATAL_CODES: ParserWarningCode[] = [
  't212_missing_total_column',
  't212_unreadable_numeric_value',
  'ibkr_unreadable_row_date',
  // S10 (2026-07-19): whole-row drops are under-statement, same failure mode
  // as an unreadable row date. The IBKR/Revolut unsupported-currency pair
  // shares one prose string and MUST stay severity-symmetric (see S13).
  'ibkr_unsupported_currencies_skipped',
  'revolut_unsupported_currencies_skipped',
  'revolut_unrecognised_types_skipped',
];

describe('parser warning severity table', () => {
  it('marks exactly the known under-reporting warnings as fatal', () => {
    const fatal = (Object.keys(WARNING_SEVERITY) as ParserWarningCode[])
      .filter((code) => WARNING_SEVERITY[code] === 'fatal')
      .sort();
    expect(fatal).toEqual([...EXPECTED_FATAL_CODES].sort());
  });

  it('assigns every code a severity (no undefined lookups)', () => {
    for (const [code, severity] of Object.entries(WARNING_SEVERITY)) {
      expect(severity, `missing severity for ${code}`).toMatch(/^(fatal|info)$/);
    }
  });
});

describe('createWarningSink', () => {
  it('keeps prose and structured warnings aligned in content and order', () => {
    const sink = createWarningSink();
    sink.push('t212_csv_empty', 'first');
    sink.push('t212_missing_total_column', 'second');

    expect(sink.warnings).toEqual(['first', 'second']);
    expect(sink.structuredWarnings).toEqual([
      { code: 't212_csv_empty', severity: 'info', message: 'first' },
      { code: 't212_missing_total_column', severity: 'fatal', message: 'second' },
    ]);
  });

  it('resolves severity from the table rather than the call site', () => {
    const sink = createWarningSink();
    sink.push('ibkr_unreadable_row_date', 'x');
    expect(sink.structuredWarnings[0].severity).toBe('fatal');
  });

  // S6 phase B: params carry the raw interpolated values for the i18n render
  // boundary; absent params leave the property off entirely (pre-phase-B shape),
  // so a JSON round-trip of old and new results stays byte-comparable.
  it('stores params when given and omits the property when not', () => {
    const sink = createWarningSink();
    sink.push('t212_unreadable_numeric_value', 'msg', { count: 3, examples: '"$1", "x"' });
    sink.push('t212_csv_empty', 'plain');

    expect(sink.structuredWarnings[0].params).toEqual({ count: 3, examples: '"$1", "x"' });
    expect('params' in sink.structuredWarnings[1]).toBe(false);
  });
});

describe('hasFatalWarning', () => {
  it('is false for an empty list and for info-only warnings', () => {
    expect(hasFatalWarning([])).toBe(false);
    expect(
      hasFatalWarning([{ code: 't212_csv_empty', severity: 'info', message: 'm' }])
    ).toBe(false);
  });

  it('is true when any warning is fatal', () => {
    expect(
      hasFatalWarning([
        { code: 't212_csv_empty', severity: 'info', message: 'a' },
        { code: 't212_missing_total_column', severity: 'fatal', message: 'b' },
      ])
    ).toBe(true);
  });
});

/** A Trading212 CSV row with every column the parser reads, so a test can vary
 *  one field at a time without tripping an unrelated warning. */
function t212Row(overrides: Partial<RawCsvRow> = {}): RawCsvRow {
  return {
    Action: 'Market sell',
    Time: '2025-03-04 10:00:00',
    ISIN: 'US0378331005',
    Ticker: 'AAPL',
    Name: 'Apple Inc.',
    'No. of shares': '10',
    'Price / share': '150.00',
    'Currency (Price / share)': 'USD',
    'Exchange rate': '1',
    Total: '1500.00',
    'Withholding tax': '0',
    ...overrides,
  } as RawCsvRow;
}

describe('real parsers emit structured warnings', () => {
  it('Trading212 CSV: a clean file produces no warnings in either channel', () => {
    const r = parseTrading212Csv([t212Row()]);
    expect(r.warnings).toEqual([]);
    expect(r.structuredWarnings).toEqual([]);
  });

  it('Trading212 CSV: an unreadable numeric value is fatal', () => {
    const r = parseTrading212Csv([t212Row({ Total: '$1,505.00 USD' })]);
    const codes = r.structuredWarnings.map((w) => w.code);
    expect(codes).toContain('t212_unreadable_numeric_value');
    expect(hasFatalWarning(r.structuredWarnings)).toBe(true);
  });

  it('Trading212 CSV: a missing Total column is fatal', () => {
    const row = t212Row();
    delete (row as Record<string, unknown>)['Total'];
    const r = parseTrading212Csv([row]);
    expect(r.structuredWarnings.map((w) => w.code)).toContain('t212_missing_total_column');
    expect(hasFatalWarning(r.structuredWarnings)).toBe(true);
  });

  it('Trading212 CSV: interest income stays benign (deliberate, PR #265)', () => {
    const r = parseTrading212Csv([
      t212Row(),
      t212Row({ Action: 'Interest on cash', Total: '3.21' }),
    ]);
    expect(r.structuredWarnings.map((w) => w.code)).toEqual([
      't212_interest_income_out_of_scope',
    ]);
    expect(hasFatalWarning(r.structuredWarnings)).toBe(false);
  });

  /**
   * SUGGESTIONS S8, the bug this PR exists to fix: IBKR drops a real dividend row
   * when it cannot read the row's date. Before structured severities the pre-pay
   * gate matched two Trading212 sentences, so this warning left the gate OPEN and
   * the buyer paid for a number missing that income.
   */
  it('IBKR: an unreadable row date is fatal (S8 regression)', () => {
    const r = parseIbkrCsv([
      ['Dividends', 'Header', 'Currency', 'Date', 'Description', 'Amount'],
      ['Dividends', 'Data', 'USD', 'not-a-date', 'AAPL (US0378331005) Cash Dividend', '5'],
    ]);

    // The row really is dropped: this is under-reporting, not a cosmetic note.
    expect(r.transactions.filter((t) => t.action === 'dividend')).toHaveLength(0);
    expect(r.structuredWarnings.map((w) => w.code)).toContain('ibkr_unreadable_row_date');
    expect(hasFatalWarning(r.structuredWarnings)).toBe(true);
  });

  /**
   * SUGGESTIONS S10: rows in a currency outside USD/EUR/GBP/RON are dropped
   * whole. If one is a sell or a dividend, that is real taxable income silently
   * removed -- the identical failure mode to an unreadable row date, so it must
   * close the pre-pay gate the same way.
   */
  it('IBKR: an unsupported-currency trade row is dropped and fatal (S10)', () => {
    const r = parseIbkrCsv([
      ['Trades', 'Header', 'DataDiscriminator', 'Asset Category', 'Currency', 'Symbol', 'Date/Time', 'Quantity', 'T. Price', 'Proceeds', 'Comm/Fee'],
      ['Trades', 'Data', 'Order', 'Stocks', 'CHF', 'NESN', '2025-03-04, 10:00:00', '-10', '100', '1000', '-1'],
    ]);

    // The sell really is dropped: this is under-reporting, not a cosmetic note.
    expect(r.transactions).toHaveLength(0);
    expect(r.structuredWarnings.map((w) => w.code)).toContain('ibkr_unsupported_currencies_skipped');
    expect(hasFatalWarning(r.structuredWarnings)).toBe(true);
  });

  it('Revolut: an unsupported-currency row is dropped and fatal (S10)', () => {
    const r = parseRevolutStatement([
      ['Date', 'Ticker', 'Type', 'Quantity', 'Price per share', 'Total Amount', 'Currency', 'FX Rate'],
      ['2025-03-04T10:00:00.000Z', 'NESN', 'SELL - MARKET', '2', '100', '200', 'CHF', '1'],
    ]);

    expect(r.transactions).toHaveLength(0);
    expect(r.structuredWarnings.map((w) => w.code)).toContain('revolut_unsupported_currencies_skipped');
    expect(hasFatalWarning(r.structuredWarnings)).toBe(true);
  });

  it('Revolut: a never-seen transaction type is dropped and fatal (S10)', () => {
    const r = parseRevolutStatement([
      ['Date', 'Ticker', 'Type', 'Quantity', 'Price per share', 'Total Amount', 'Currency', 'FX Rate'],
      ['2025-03-04T10:00:00.000Z', 'MSFT', 'SPINOFF', '1', '', '$50', 'USD', '1'],
    ]);

    expect(r.transactions).toHaveLength(0);
    expect(r.structuredWarnings.map((w) => w.code)).toContain('revolut_unrecognised_types_skipped');
    expect(hasFatalWarning(r.structuredWarnings)).toBe(true);
  });

  it('Revolut: known non-taxable types stay silent, not fatal (ignore != unknown)', () => {
    const r = parseRevolutStatement([
      ['Date', 'Ticker', 'Type', 'Quantity', 'Price per share', 'Total Amount', 'Currency', 'FX Rate'],
      ['2025-03-04T10:00:00.000Z', 'MSFT', 'SELL - MARKET', '1', '$100', '$100', 'USD', '1'],
      ['2025-03-05T10:00:00.000Z', '', 'CASH TOP-UP', '', '', '$500', 'USD', '1'],
      ['2025-03-06T10:00:00.000Z', '', 'CUSTODY FEE', '', '', '$1', 'USD', '1'],
    ]);

    expect(r.transactions).toHaveLength(1);
    expect(r.structuredWarnings).toEqual([]);
  });

  it('IBKR: an empty file warns without being fatal', () => {
    const r = parseIbkrCsv([]);
    expect(r.structuredWarnings.map((w) => w.code)).toEqual(['ibkr_csv_empty']);
    expect(hasFatalWarning(r.structuredWarnings)).toBe(false);
  });

  it('Revolut: a non-statement file warns without being fatal', () => {
    const r = parseRevolutStatement([['Some', 'Unrelated', 'Spreadsheet']]);
    expect(r.structuredWarnings.map((w) => w.code)).toContain(
      'revolut_not_an_account_statement'
    );
    expect(hasFatalWarning(r.structuredWarnings)).toBe(false);
  });

  it('Trading212 PDF: a non-Trading212 document warns without being fatal', () => {
    const r = parseTrading212AnnualStatement(['Interactive Brokers Activity Statement']);
    expect(r.brokerMismatch).toBe(true);
    expect(r.structuredWarnings.map((w) => w.code)).toContain('t212pdf_broker_mismatch');
    expect(hasFatalWarning(r.structuredWarnings)).toBe(false);
  });

  it('every parser keeps its two channels identical', () => {
    const results = [
      parseTrading212Csv([t212Row({ Total: 'nonsense' })]),
      parseIbkrCsv([]),
      parseRevolutStatement([['junk']]),
    ];
    for (const r of results) {
      expect(r.structuredWarnings.map((w) => w.message)).toEqual(r.warnings);
    }
  });
});

describe('mergeParseResults carries structured warnings', () => {
  it('preserves a fatal warning from any single file', () => {
    const clean = parseTrading212Csv([t212Row()]);
    const dirty = parseTrading212Csv([t212Row({ Total: 'nonsense' })]);

    const merged = mergeParseResults([clean, dirty]);

    expect(hasFatalWarning(merged.structuredWarnings)).toBe(true);
    expect(merged.structuredWarnings.map((w) => w.message)).toEqual(merged.warnings);
  });

  it('dedupes identical warnings across files, like the prose channel', () => {
    const a = parseTrading212Csv([t212Row({ Total: 'nonsense' })]);
    const b = parseTrading212Csv([t212Row({ Total: 'nonsense' })]);

    const merged = mergeParseResults([a, b]);

    expect(merged.warnings).toHaveLength(1);
    expect(merged.structuredWarnings).toHaveLength(1);
  });

  it('keeps prose from a result that carries no structured warnings', () => {
    const merged = mergeParseResults([
      { transactions: [], skipped: [], warnings: ['legacy note'], structuredWarnings: [] },
    ]);
    expect(merged.warnings).toEqual(['legacy note']);
    expect(merged.structuredWarnings).toEqual([]);
  });

  it('survives a result whose structuredWarnings field is genuinely ABSENT (S13 pin)', () => {
    // The type requires the field, but a preview persisted before S6 shipped
    // rehydrates as a plain JS object without it. The `?? []` guard must hold
    // for undefined, not just an explicit empty array.
    const legacy = {
      transactions: [],
      skipped: [],
      warnings: ['legacy note'],
    } as unknown as Parameters<typeof mergeParseResults>[0][number];
    const fresh = parseTrading212Csv([t212Row({ Total: 'nonsense' })]);

    const merged = mergeParseResults([legacy, fresh]);

    expect(merged.warnings).toContain('legacy note');
    expect(hasFatalWarning(merged.structuredWarnings)).toBe(true);
  });

  it('keeps BOTH broker codes when two parsers share one prose string (S13)', () => {
    // The IBKR and Revolut unsupported-currency warnings are byte-identical
    // prose with different codes. A message-only dedupe kept only the
    // first-merged broker's entry; the key is now code + message, so a future
    // single-sided severity change cannot be masked by a cross-broker merge.
    const ibkr = parseIbkrCsv([
      ['Trades', 'Header', 'DataDiscriminator', 'Asset Category', 'Currency', 'Symbol', 'Date/Time', 'Quantity', 'T. Price', 'Proceeds', 'Comm/Fee'],
      ['Trades', 'Data', 'Order', 'Stocks', 'CHF', 'NESN', '2025-03-04, 10:00:00', '-10', '100', '1000', '-1'],
    ]);
    const revolut = parseRevolutStatement([
      ['Date', 'Ticker', 'Type', 'Quantity', 'Price per share', 'Total Amount', 'Currency', 'FX Rate'],
      ['2025-03-05T10:00:00.000Z', 'NESN', 'SELL - MARKET', '2', '100', '200', 'CHF', '1'],
    ]);

    const ibkrEntry = ibkr.structuredWarnings.find((w) => w.code === 'ibkr_unsupported_currencies_skipped');
    const revolutEntry = revolut.structuredWarnings.find((w) => w.code === 'revolut_unsupported_currencies_skipped');
    // Sanity: the premise (shared prose, distinct codes) really holds.
    expect(ibkrEntry).toBeDefined();
    expect(revolutEntry).toBeDefined();
    expect(ibkrEntry!.message).toBe(revolutEntry!.message);

    const merged = mergeParseResults([ibkr, revolut]);

    // Prose says the shared sentence once; structured keeps one entry per code.
    expect(merged.warnings.filter((w) => w === ibkrEntry!.message)).toHaveLength(1);
    const mergedCodes = merged.structuredWarnings.map((w) => w.code);
    expect(mergedCodes).toContain('ibkr_unsupported_currencies_skipped');
    expect(mergedCodes).toContain('revolut_unsupported_currencies_skipped');
  });

  it('still dedupes a true duplicate (same code AND message) across files (S13)', () => {
    const a = parseIbkrCsv([
      ['Trades', 'Header', 'DataDiscriminator', 'Asset Category', 'Currency', 'Symbol', 'Date/Time', 'Quantity', 'T. Price', 'Proceeds', 'Comm/Fee'],
      ['Trades', 'Data', 'Order', 'Stocks', 'CHF', 'NESN', '2025-03-04, 10:00:00', '-10', '100', '1000', '-1'],
    ]);
    const b = parseIbkrCsv([
      ['Trades', 'Header', 'DataDiscriminator', 'Asset Category', 'Currency', 'Symbol', 'Date/Time', 'Quantity', 'T. Price', 'Proceeds', 'Comm/Fee'],
      ['Trades', 'Data', 'Order', 'Stocks', 'CHF', 'NOVN', '2025-04-04, 10:00:00', '-5', '80', '400', '-1'],
    ]);

    const merged = mergeParseResults([a, b]);

    expect(
      merged.structuredWarnings.filter((w) => w.code === 'ibkr_unsupported_currencies_skipped'),
    ).toHaveLength(1);
  });
});
