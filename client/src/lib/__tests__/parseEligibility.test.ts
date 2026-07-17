import { describe, it, expect } from 'vitest';
import {
  evaluateParseEligibility,
  type ParseEligibilityInput,
} from '../parseEligibility';
import type { CsvPreviewData, PdfPreviewData } from '../../hooks/useStatementPreview';
import { parseTrading212Csv, type AppliedSplit, type RawCsvRow } from '@shared/index';

/**
 * Unit coverage for the pre-pay parse eligibility predicate (backlog #24B Phase
 * 2, PR-1). Every branch is exercised: a hard error, each fatal-warning reason
 * (wrong broker, unsupported year, missing history, empty), and the
 * benign-warning-still-eligible refinement. The named scenarios (Trading212
 * clean-green, Mihai-style unsupported-year block, benign skipped-rows allow)
 * mirror the real cases in the execution plan.
 *
 * 2025 is the current engine-supported year (isEngineSupportedTaxYear); 2021 is
 * the unsupported year from Mihai's IBKR upload.
 */

function csvPreview(overrides: Partial<CsvPreviewData> = {}): CsvPreviewData {
  return {
    fileType: 'csv',
    fileName: 'transactions.csv',
    warnings: [],
    year: 2025,
    sells: 3,
    dividends: 1,
    distributions: 0,
    buys: 5,
    totalRows: 9,
    skipped: 0,
    years: [2025],
    ...overrides,
  };
}

function pdfPreview(overrides: Partial<PdfPreviewData> = {}): PdfPreviewData {
  return {
    fileType: 'pdf',
    fileName: 'annual-statement.pdf',
    warnings: [],
    year: 2025,
    sells: 4,
    dividends: 2,
    distributions: 0,
    closedResult: 1234.56,
    currency: 'USD',
    brokerMismatch: false,
    ...overrides,
  };
}

function input(overrides: Partial<ParseEligibilityInput> = {}): ParseEligibilityInput {
  return { preview: csvPreview(), error: null, csvHistoryWarning: false, ...overrides };
}

describe('evaluateParseEligibility', () => {
  describe('HARD ERROR -> blocked (unreadable)', () => {
    it('blocks when a parse error was thrown, even if a stale preview lingers', () => {
      const result = evaluateParseEligibility(
        input({ error: 'Failed to read PDF', preview: pdfPreview() }),
      );
      expect(result).toEqual({ eligible: false, blockReason: 'unreadable' });
    });

    it('blocks when there is no preview at all (nothing parsed yet)', () => {
      const result = evaluateParseEligibility(input({ preview: null }));
      expect(result).toEqual({ eligible: false, blockReason: 'unreadable' });
    });
  });

  describe('FATAL WARNING -> blocked', () => {
    it('blocks a PDF broker-mismatch as wrong_broker (a non-Trading212 PDF)', () => {
      const result = evaluateParseEligibility(
        input({ preview: pdfPreview({ brokerMismatch: true, sells: 0, dividends: 0 }) }),
      );
      expect(result).toEqual({ eligible: false, blockReason: 'wrong_broker' });
    });

    it('blocks an unsupported tax year as unsupported_year (Mihai-style 2021)', () => {
      const result = evaluateParseEligibility(
        input({ preview: csvPreview({ year: 2021, years: [2021] }) }),
      );
      expect(result).toEqual({ eligible: false, blockReason: 'unsupported_year' });
    });

    it('blocks a CSV missing-history hard-stop as missing_history', () => {
      const result = evaluateParseEligibility(
        input({ preview: csvPreview(), csvHistoryWarning: true }),
      );
      expect(result).toEqual({ eligible: false, blockReason: 'missing_history' });
    });

    it('does NOT treat csvHistoryWarning as fatal on a PDF preview (CSV-only flag)', () => {
      // The hook only computes csvHistoryWarning on the CSV path; a stray true on
      // a PDF preview must not block an otherwise-eligible PDF.
      const result = evaluateParseEligibility(
        input({ preview: pdfPreview(), csvHistoryWarning: true }),
      );
      expect(result).toEqual({ eligible: true, blockReason: null });
    });

    it('blocks an empty result as empty (zero sells, dividends, distributions)', () => {
      const result = evaluateParseEligibility(
        input({ preview: csvPreview({ sells: 0, dividends: 0, distributions: 0 }) }),
      );
      expect(result).toEqual({ eligible: false, blockReason: 'empty' });
    });

    it('allows a result that has only distributions (still non-empty)', () => {
      const result = evaluateParseEligibility(
        input({ preview: pdfPreview({ sells: 0, dividends: 0, distributions: 2 }) }),
      );
      expect(result).toEqual({ eligible: true, blockReason: null });
    });
  });

  describe('FATAL WARNING -> blocked (unreliable_amounts)', () => {
    // The two under-reporting warnings the shared T212 parser emits (missing
    // Total column, PR #263; unreadable numeric cell, PR #264). A file can be a
    // supported broker + year + non-empty and still carry one, in which case the
    // number understates the declaration and the gate must close (SUGGESTIONS S3;
    // the Mihai paid-then-blocked shape). Prose kept in sync with
    // shared/src/parsers/trading212.ts; the real-parser pin below guards it.
    const MISSING_TOTAL_WARNING =
      'Could not find a total column on 2 row(s). Trading212 names it "Total" or "Total (<currency>)" after your account\'s base currency. Without it the amounts on those rows read as zero, which would under-report your declaration.';
    const UNREADABLE_VALUE_WARNING =
      'Could not read 3 numeric value(s) in this file (e.g. Price / share: "abc"). Trading212 exports plain numbers such as "1505.00". A value we cannot read falls back to a default (zero, or a 1:1 exchange rate), which would misstate your declaration.';

    it('blocks a supported non-empty file with a missing-total warning', () => {
      const result = evaluateParseEligibility(
        input({ preview: csvPreview({ warnings: [MISSING_TOTAL_WARNING] }) }),
      );
      expect(result).toEqual({ eligible: false, blockReason: 'unreliable_amounts' });
    });

    it('blocks a supported non-empty file with an unreadable-value warning', () => {
      const result = evaluateParseEligibility(
        input({ preview: csvPreview({ warnings: [UNREADABLE_VALUE_WARNING] }) }),
      );
      expect(result).toEqual({ eligible: false, blockReason: 'unreliable_amounts' });
    });

    it('blocks a PDF preview carrying an unreliable-amounts warning too (broker-agnostic)', () => {
      const result = evaluateParseEligibility(
        input({ preview: pdfPreview({ warnings: [UNREADABLE_VALUE_WARNING] }) }),
      );
      expect(result).toEqual({ eligible: false, blockReason: 'unreliable_amounts' });
    });

    it('still blocks when the fatal warning sits alongside benign ones', () => {
      const result = evaluateParseEligibility(
        input({
          preview: csvPreview({
            warnings: ['Removed 2 duplicate rows', MISSING_TOTAL_WARNING, 'Applied AAPL 4:1 split'],
          }),
        }),
      );
      expect(result).toEqual({ eligible: false, blockReason: 'unreliable_amounts' });
    });
  });

  describe('reason priority', () => {
    it('reports wrong_broker before unsupported_year on a mismatched PDF with a bad year', () => {
      const result = evaluateParseEligibility(
        input({ preview: pdfPreview({ brokerMismatch: true, year: 2021 }) }),
      );
      expect(result.blockReason).toBe('wrong_broker');
    });

    it('reports unsupported_year before empty when both apply', () => {
      const result = evaluateParseEligibility(
        input({ preview: csvPreview({ year: 2021, sells: 0, dividends: 0, distributions: 0 }) }),
      );
      expect(result.blockReason).toBe('unsupported_year');
    });

    it('reports the structural reason (empty) before unreliable_amounts', () => {
      // A structural block is more specific than "amounts unreliable"; the empty
      // check runs first, so an empty file with an unreadable-value warning still
      // reports empty rather than unreliable_amounts.
      const result = evaluateParseEligibility(
        input({
          preview: csvPreview({
            sells: 0,
            dividends: 0,
            distributions: 0,
            warnings: ['Could not read 1 numeric value(s) in this file (e.g. Total: "x").'],
          }),
        }),
      );
      expect(result.blockReason).toBe('empty');
    });
  });

  describe('ELIGIBLE (gate open)', () => {
    it('allows a clean Trading212 CSV on a supported year (the green case)', () => {
      const result = evaluateParseEligibility(input({ preview: csvPreview() }));
      expect(result).toEqual({ eligible: true, blockReason: null });
    });

    it('allows a clean Trading212 PDF on a supported year', () => {
      const result = evaluateParseEligibility(input({ preview: pdfPreview() }));
      expect(result).toEqual({ eligible: true, blockReason: null });
    });

    it('allows a supported file whose ONLY warnings are benign (skipped rows)', () => {
      // The deliberate refinement: benign warnings on a supported broker + year
      // keep the gate OPEN. The old page verdict blocked any warning.
      const result = evaluateParseEligibility(
        input({
          preview: csvPreview({
            warnings: ['3 rows skipped (unknown action)'],
            skipped: 3,
          }),
        }),
      );
      expect(result).toEqual({ eligible: true, blockReason: null });
    });

    it('allows a supported file with duplicates-removed / splits-applied notes', () => {
      const result = evaluateParseEligibility(
        input({
          preview: csvPreview({
            warnings: ['Removed 2 duplicate rows', 'Applied AAPL 4:1 split'],
            duplicatesRemoved: 2,
            appliedSplits: [
              { label: 'AAPL 4:1', ticker: 'AAPL', ratio: 4, addedShares: 30 } as AppliedSplit,
            ],
          }),
        }),
      );
      expect(result).toEqual({ eligible: true, blockReason: null });
    });

    it('allows a supported file whose interest warning is benign (out of S3 scope)', () => {
      // The interest-income warning means there is SEPARATE income we do not
      // calculate, not that the number we DO compute (gains + dividends) is
      // wrong. It stays benign: the gate must not block a serviceable file over
      // an informational note (only the two under-reporting warnings block).
      const result = evaluateParseEligibility(
        input({
          preview: csvPreview({
            warnings: [
              'Detected 2 interest-income row(s) (e.g. "Interest on cash"). InvesTax does not calculate interest income; it is taxable (venituri din dobanzi) and must be declared separately.',
            ],
          }),
        }),
      );
      expect(result).toEqual({ eligible: true, blockReason: null });
    });
  });

  // Prose-drift pin: feed the REAL shared parser's output through the predicate,
  // so a change to the warning text in shared/src/parsers/trading212.ts that
  // breaks the client's substring match fails HERE rather than silently
  // re-opening the pre-pay gate on an under-reporting file. This is the guard the
  // FRAGILITY note in parseEligibility.ts points to (SUGGESTIONS S3 -> S6).
  describe('real-parser integration pin', () => {
    // A minimal T212 CSV: one clean sell (so the file is non-empty and lands a
    // full preview), plus one row that trips each under-reporting warning.
    const cleanSell: RawCsvRow = {
      Action: 'Market sell',
      Time: '2025-03-10 14:00:00',
      ISIN: 'US0378331005',
      Ticker: 'AAPL',
      Name: 'Apple',
      'No. of shares': '5',
      'Price / share': '180.00',
      'Currency (Price / share)': 'USD',
      'Exchange rate': '1',
      Total: '900.00',
    };
    // An unreadable numeric cell (Price / share is not a number) -> the #264 warning.
    const unreadableRow: RawCsvRow = {
      ...cleanSell,
      Ticker: 'MSFT',
      'No. of shares': '2',
      'Price / share': 'abc',
      Total: '800.00',
    };
    // No Total column at all (nor a Total (<ccy>) variant) -> the #263 warning.
    const missingTotalRow: RawCsvRow = {
      Action: 'Market sell',
      Time: '2025-03-10 14:00:00',
      ISIN: 'US38259P5089',
      Ticker: 'GOOG',
      Name: 'Alphabet',
      'No. of shares': '3',
      'Price / share': '140.00',
      'Currency (Price / share)': 'USD',
      'Exchange rate': '1',
    };

    function previewFromRows(rows: RawCsvRow[]): CsvPreviewData {
      const parsed = parseTrading212Csv(rows);
      const sells = parsed.transactions.filter((t) => t.action === 'sell').length;
      return csvPreview({ warnings: parsed.warnings, sells, dividends: 0, distributions: 0 });
    }

    it('blocks a real parse that emits the missing-total warning', () => {
      const preview = previewFromRows([cleanSell, missingTotalRow]);
      // Sanity: the real parser really did warn (guards a silent no-op pin).
      expect(preview.warnings.length).toBeGreaterThan(0);
      const result = evaluateParseEligibility(input({ preview }));
      expect(result).toEqual({ eligible: false, blockReason: 'unreliable_amounts' });
    });

    it('blocks a real parse that emits the unreadable-value warning', () => {
      const preview = previewFromRows([cleanSell, unreadableRow]);
      expect(preview.warnings.length).toBeGreaterThan(0);
      const result = evaluateParseEligibility(input({ preview }));
      expect(result).toEqual({ eligible: false, blockReason: 'unreliable_amounts' });
    });

    it('keeps a real clean parse eligible (no false positive from the pin)', () => {
      const preview = previewFromRows([cleanSell]);
      const result = evaluateParseEligibility(input({ preview }));
      expect(result).toEqual({ eligible: true, blockReason: null });
    });
  });
});
