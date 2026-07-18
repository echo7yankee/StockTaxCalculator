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
});
