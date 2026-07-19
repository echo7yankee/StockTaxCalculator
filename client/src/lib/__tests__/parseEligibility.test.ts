import { describe, it, expect } from 'vitest';
import {
  evaluateParseEligibility,
  type ParseEligibilityInput,
} from '../parseEligibility';
import type { CsvPreviewData, PdfPreviewData } from '../../hooks/useStatementPreview';
import {
  parseTrading212Csv,
  parseIbkrCsv,
  parseRevolutStatement,
  mergeParseResults,
  type AppliedSplit,
  type RawCsvRow,
  type ParserWarning,
} from '@shared/index';

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
      return csvPreview({
        warnings: parsed.warnings,
        // Feed the parser's OWN severities through, so these pins exercise the
        // structured path the gate actually takes in the app (SUGGESTIONS S6).
        structuredWarnings: parsed.structuredWarnings,
        sells,
        dividends: 0,
        distributions: 0,
      });
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

  /**
   * SUGGESTIONS S6 phase A: the gate now decides off the parser's own
   * `severity`, not off two hardcoded Trading212 sentences. That is what closes
   * S8 -- a warning from ANY parser that drops or defaults a taxable amount now
   * blocks payment, whatever its prose says.
   */
  describe('structured warning severity (S6)', () => {
    const fatalWarning: ParserWarning = {
      code: 'ibkr_unreadable_row_date',
      severity: 'fatal',
      message: 'Could not read the date "not-a-date" in the Dividends section; that row was skipped.',
    };
    const infoWarning: ParserWarning = {
      code: 'ibkr_non_stock_positions_skipped',
      severity: 'info',
      message: 'Skipped non-stock positions (Forex).',
    };

    it('blocks on a fatal warning whose prose the legacy markers never matched', () => {
      // Proves the point: this message contains neither legacy substring.
      expect(fatalWarning.message.toLowerCase()).not.toContain('find a total column');
      expect(fatalWarning.message.toLowerCase()).not.toContain('numeric value(s) in this file');

      const result = evaluateParseEligibility(
        input({
          preview: csvPreview({
            warnings: [fatalWarning.message],
            structuredWarnings: [fatalWarning],
          }),
        }),
      );
      expect(result).toEqual({ eligible: false, blockReason: 'unreliable_amounts' });
    });

    it('keeps the gate open when every structured warning is informational', () => {
      const result = evaluateParseEligibility(
        input({
          preview: csvPreview({
            warnings: [infoWarning.message],
            structuredWarnings: [infoWarning],
          }),
        }),
      );
      expect(result).toEqual({ eligible: true, blockReason: null });
    });

    it('blocks when a fatal warning sits among informational ones', () => {
      const result = evaluateParseEligibility(
        input({
          preview: csvPreview({
            warnings: [infoWarning.message, fatalWarning.message],
            structuredWarnings: [infoWarning, fatalWarning],
          }),
        }),
      );
      expect(result).toEqual({ eligible: false, blockReason: 'unreliable_amounts' });
    });

    it('trusts severity over prose: an info warning that LOOKS fatal stays eligible', () => {
      // A parser could legitimately mention a total column in a benign note. The
      // severity is the parser's own call, so it wins over the legacy substring.
      const result = evaluateParseEligibility(
        input({
          preview: csvPreview({
            warnings: ['We could not find a total column header, but read the amounts fine.'],
            structuredWarnings: [
              {
                code: 't212_missing_action_column',
                severity: 'info',
                message: 'We could not find a total column header, but read the amounts fine.',
              },
            ],
          }),
        }),
      );
      expect(result).toEqual({ eligible: true, blockReason: null });
    });

    it('blocks fatal prose from a merged sibling with NO structured twin (S13)', () => {
      // qa's PR #266 repro: a prose-only result (a preview persisted before S6
      // shipped) merged with a fresh result that DOES carry structured
      // warnings. The old preview-level either/or took the structured path and
      // never consulted the sibling's fatal prose -> ALLOW where PR #265 gave
      // BLOCK. The fallback is now per warning: twinless prose still hits the
      // legacy markers even when structured warnings exist alongside it.
      const result = evaluateParseEligibility(
        input({
          preview: csvPreview({
            warnings: [
              infoWarning.message,
              'Could not find a total column on 2 row(s).',
            ],
            structuredWarnings: [infoWarning],
          }),
        }),
      );
      expect(result).toEqual({ eligible: false, blockReason: 'unreliable_amounts' });
    });

    it('blocks the S13 shape through the real merge (integration pin)', () => {
      // Same scenario end-to-end: mergeParseResults over a hand-built
      // prose-only fatal result + a real parse whose only warning is info.
      const legacyProseOnly = {
        transactions: [],
        skipped: [],
        warnings: ['Could not find a total column on 2 row(s).'],
      } as unknown as Parameters<typeof mergeParseResults>[0][number];
      const freshWithInfo = parseIbkrCsv([
        ['Trades', 'Header', 'DataDiscriminator', 'Asset Category', 'Currency', 'Symbol', 'Date/Time', 'Quantity', 'T. Price', 'Proceeds'],
        ['Trades', 'Data', 'Order', 'Forex', 'USD', 'EUR.USD', '2025-03-04, 10:00:00', '1000', '1.08', '-1080'],
      ]);
      const merged = mergeParseResults([legacyProseOnly, freshWithInfo]);
      // Sanity: the merge really produced the mixed shape (structured info
      // present, fatal prose twinless).
      expect(merged.structuredWarnings.length).toBeGreaterThan(0);
      expect(merged.structuredWarnings.every((w) => w.severity === 'info')).toBe(true);

      const result = evaluateParseEligibility(
        input({
          preview: csvPreview({
            warnings: merged.warnings,
            structuredWarnings: merged.structuredWarnings,
          }),
        }),
      );
      expect(result).toEqual({ eligible: false, blockReason: 'unreliable_amounts' });
    });

    it('falls back to the legacy prose markers when no structured warnings exist', () => {
      // A preview persisted before S6 shipped, or a hand-built one. It must keep
      // behaving exactly as it did under PR #265 rather than silently opening.
      const result = evaluateParseEligibility(
        input({
          preview: csvPreview({
            warnings: ['Could not find a total column on 2 row(s).'],
            structuredWarnings: [],
          }),
        }),
      );
      expect(result).toEqual({ eligible: false, blockReason: 'unreliable_amounts' });
    });
  });

  /**
   * The S8 case end-to-end, through the REAL IBKR parser: a dividend row whose
   * date we cannot read is dropped, so the declaration under-reports. Before this
   * change the gate opened and the buyer paid for a number missing that income.
   */
  describe('S8 regression: IBKR under-reporting closes the gate', () => {
    function ibkrPreview(rows: string[][]): CsvPreviewData {
      const parsed = parseIbkrCsv(rows);
      return csvPreview({
        warnings: parsed.warnings,
        structuredWarnings: parsed.structuredWarnings,
        // A real statement also has readable rows; the preview counts below stand
        // in for those so the gate is not short-circuited by the `empty` reason.
        sells: 2,
        dividends: 1,
        distributions: 0,
      });
    }

    it('blocks a real IBKR parse that dropped an income row it could not date', () => {
      const preview = ibkrPreview([
        ['Dividends', 'Header', 'Currency', 'Date', 'Description', 'Amount'],
        ['Dividends', 'Data', 'USD', 'not-a-date', 'AAPL (US0378331005) Cash Dividend', '5'],
      ]);
      // Sanity: the real parser really did warn (guards a silent no-op pin).
      expect(preview.warnings.length).toBeGreaterThan(0);

      const result = evaluateParseEligibility(input({ preview }));
      expect(result).toEqual({ eligible: false, blockReason: 'unreliable_amounts' });
    });

    it('keeps a real IBKR parse with only benign warnings eligible', () => {
      const preview = ibkrPreview([
        ['Trades', 'Header', 'DataDiscriminator', 'Asset Category', 'Currency', 'Symbol', 'Date/Time', 'Quantity', 'T. Price', 'Proceeds'],
        ['Trades', 'Data', 'Order', 'Forex', 'USD', 'EUR.USD', '2025-03-04, 10:00:00', '1000', '1.08', '-1080'],
      ]);
      const result = evaluateParseEligibility(input({ preview }));
      expect(result).toEqual({ eligible: true, blockReason: null });
    });
  });

  /**
   * SUGGESTIONS S10 end-to-end, through the REAL parsers: rows dropped whole
   * (an unsupported currency, a never-seen Revolut type) are real taxable
   * income silently removed, so the gate must close. Before this change these
   * warnings were 'info' and the pay CTA stayed open -- the same
   * paid-then-blocked shape S8 closed for unreadable dates.
   */
  describe('S10: whole-row drops close the gate', () => {
    function ibkrPreview(rows: string[][]): CsvPreviewData {
      const parsed = parseIbkrCsv(rows);
      return csvPreview({
        warnings: parsed.warnings,
        structuredWarnings: parsed.structuredWarnings,
        // A real statement also has readable rows; these counts stand in for
        // them so the gate is not short-circuited by the `empty` reason.
        sells: 2,
        dividends: 1,
        distributions: 0,
      });
    }

    function revolutPreview(rows: string[][]): CsvPreviewData {
      const parsed = parseRevolutStatement(rows);
      const sells = parsed.transactions.filter((t) => t.action === 'sell').length;
      return csvPreview({
        warnings: parsed.warnings,
        structuredWarnings: parsed.structuredWarnings,
        sells: Math.max(sells, 1),
        dividends: 0,
        distributions: 0,
      });
    }

    it('blocks a real IBKR parse that dropped a CHF sell row', () => {
      const preview = ibkrPreview([
        ['Trades', 'Header', 'DataDiscriminator', 'Asset Category', 'Currency', 'Symbol', 'Date/Time', 'Quantity', 'T. Price', 'Proceeds', 'Comm/Fee'],
        ['Trades', 'Data', 'Order', 'Stocks', 'CHF', 'NESN', '2025-03-04, 10:00:00', '-10', '100', '1000', '-1'],
      ]);
      // Sanity: the real parser really did warn (guards a silent no-op pin).
      expect(preview.warnings.length).toBeGreaterThan(0);

      const result = evaluateParseEligibility(input({ preview }));
      expect(result).toEqual({ eligible: false, blockReason: 'unreliable_amounts' });
    });

    it('blocks a real Revolut parse that dropped an unsupported-currency row', () => {
      const preview = revolutPreview([
        ['Date', 'Ticker', 'Type', 'Quantity', 'Price per share', 'Total Amount', 'Currency', 'FX Rate'],
        ['2025-03-04T10:00:00.000Z', 'MSFT', 'SELL - MARKET', '1', '$100', '$100', 'USD', '1'],
        ['2025-03-05T10:00:00.000Z', 'NESN', 'SELL - MARKET', '2', '100', '200', 'CHF', '1'],
      ]);
      expect(preview.warnings.length).toBeGreaterThan(0);

      const result = evaluateParseEligibility(input({ preview }));
      expect(result).toEqual({ eligible: false, blockReason: 'unreliable_amounts' });
    });

    it('blocks a real Revolut parse that dropped a never-seen transaction type', () => {
      const preview = revolutPreview([
        ['Date', 'Ticker', 'Type', 'Quantity', 'Price per share', 'Total Amount', 'Currency', 'FX Rate'],
        ['2025-03-04T10:00:00.000Z', 'MSFT', 'SELL - MARKET', '1', '$100', '$100', 'USD', '1'],
        ['2025-03-06T10:00:00.000Z', 'MSFT', 'SPINOFF', '1', '', '$50', 'USD', '1'],
      ]);
      expect(preview.warnings.length).toBeGreaterThan(0);

      const result = evaluateParseEligibility(input({ preview }));
      expect(result).toEqual({ eligible: false, blockReason: 'unreliable_amounts' });
    });

    it('keeps a real Revolut parse with only known non-taxable skips eligible', () => {
      const preview = revolutPreview([
        ['Date', 'Ticker', 'Type', 'Quantity', 'Price per share', 'Total Amount', 'Currency', 'FX Rate'],
        ['2025-03-04T10:00:00.000Z', 'MSFT', 'SELL - MARKET', '1', '$100', '$100', 'USD', '1'],
        ['2025-03-05T10:00:00.000Z', '', 'CASH TOP-UP', '', '', '$500', 'USD', '1'],
      ]);
      const result = evaluateParseEligibility(input({ preview }));
      expect(result).toEqual({ eligible: true, blockReason: null });
    });
  });
});
