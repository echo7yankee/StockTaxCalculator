import { describe, it, expect } from 'vitest';
import {
  evaluateParseEligibility,
  type ParseEligibilityInput,
} from '../parseEligibility';
import type { CsvPreviewData, PdfPreviewData } from '../../hooks/useStatementPreview';
import type { AppliedSplit } from '@shared/index';

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
  });
});
