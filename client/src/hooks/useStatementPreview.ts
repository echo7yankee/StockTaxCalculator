import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Papa from 'papaparse';
import {
  parseTrading212Csv,
  parseIbkrCsv,
  parseRevolutStatement,
  mergeParseResults,
  applyKnownStockSplits,
  parseTrading212AnnualStatement,
} from '@shared/index';
import type { RawCsvRow, MergedParseResult, PdfParseResult, AppliedSplit } from '@shared/index';
import { extractPdfPageTexts } from '../utils/pdfExtractor';
import { reportParseEvent } from '../lib/parseMonitor';
import type { BrokerId } from '../lib/brokers';

/**
 * Shared parse-to-preview hook. Single source of truth for reading a broker
 * statement (PDF or CSV), running the EXISTING pure shared parsers, and building
 * the preview card data. Consumed by both UploadPage (the paid engine path) and
 * PreviewPage (the free pre-paywall checker, backlog #24B).
 *
 * It contains PARSER output only: file/row counts, parser warnings, the
 * single-year missing-history hard-stop, skipped rows, and applied known splits.
 * It deliberately knows nothing about the tax engine, BNR exchange rates, the
 * UploadContext, or navigation. The engine call, rate fetch, and results
 * write-and-navigate stay in UploadPage so the free checker (which imports this
 * hook) can never reach engine output. Keeping one parser path here is what the
 * #24B spec's DO-NOT ("extract a shared hook so they can't drift") requires.
 */

export type FileType = 'csv' | 'pdf';

/** Fields common to both statement kinds. */
interface PreviewBase {
  fileName: string;
  warnings: string[];
  year: number;
  sells: number;
  dividends: number;
  distributions: number;
}

/** A parsed CSV statement (Trading212 / IBKR / Revolut). */
export interface CsvPreviewData extends PreviewBase {
  fileType: 'csv';
  buys: number;
  totalRows: number;
  skipped: number;
  years: number[];
  sourceFileCount?: number;
  duplicatesRemoved?: number;
  appliedSplits?: AppliedSplit[];
}

/** A parsed Trading212 annual statement PDF. */
export interface PdfPreviewData extends PreviewBase {
  fileType: 'pdf';
  closedResult: number;
  currency: string;
  /** True when the uploaded PDF is NOT a Trading212 statement (e.g. an IBKR
   *  Activity Statement PDF). The free checker redirects to the CSV export. */
  brokerMismatch: boolean;
}

/**
 * Discriminated on `fileType`, so PDF-only fields (closedResult, currency,
 * brokerMismatch) and CSV-only fields (buys, totalRows, ...) are type-safe per
 * kind rather than all-optional. A consumer must narrow on `fileType` before
 * touching a kind-specific field.
 */
export type PreviewData = CsvPreviewData | PdfPreviewData;

/** Coerce a read-excel-file cell (string | number | boolean | Date | null) to a
 *  string, so the Revolut parser sees the same row shape it gets from a CSV parse.
 *  Excel date cells become ISO strings the parser's `new Date()` can read. */
function xlsxCellToString(cell: unknown): string {
  if (cell === null || cell === undefined) return '';
  if (cell instanceof Date) return cell.toISOString();
  return String(cell);
}

export interface UseStatementPreviewOptions {
  /** Called right after a PDF statement parses (before the next render), so the
   *  paid upload flow can kick off its BNR rate fetch as part of the parse rather
   *  than from a render effect. The free checker omits it (no rate fetch). */
  onPdfParsed?: (pdf: PdfParseResult) => void;
}

export interface UseStatementPreviewResult {
  fileInputRef: React.RefObject<HTMLInputElement>;
  activeTab: FileType;
  csvBroker: BrokerId;
  dragOver: boolean;
  processing: boolean;
  error: string | null;
  preview: PreviewData | null;
  selectedYear: number;
  csvParse: MergedParseResult | null;
  pdfData: PdfParseResult | null;
  csvHistoryWarning: boolean;
  setSelectedYear: (year: number) => void;
  setDragOver: (over: boolean) => void;
  handleTabChange: (tab: FileType) => void;
  handleCsvBrokerChange: (broker: BrokerId) => void;
  handleDrop: (e: React.DragEvent) => void;
  handleFileInput: (e: React.ChangeEvent<HTMLInputElement>) => void;
  clearPreview: () => void;
}

export function useStatementPreview(options: UseStatementPreviewOptions = {}): UseStatementPreviewResult {
  const { onPdfParsed } = options;
  const { t } = useTranslation('upload');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Keep the latest onPdfParsed in a ref so processPdf can call it without taking
  // it as a dependency (the caller passes a fresh closure each render; depending
  // on it would rebuild the whole parse pipeline every render). The ref is synced
  // in an effect, not during render (react-hooks/refs).
  const onPdfParsedRef = useRef(onPdfParsed);
  useEffect(() => {
    onPdfParsedRef.current = onPdfParsed;
  }, [onPdfParsed]);

  const [activeTab, setActiveTab] = useState<FileType>('pdf');
  const [dragOver, setDragOver] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear() - 1);
  const [csvHistoryWarning, setCsvHistoryWarning] = useState(false);

  const [csvBroker, setCsvBroker] = useState<BrokerId>('trading212');
  const [csvParse, setCsvParse] = useState<MergedParseResult | null>(null); // merged CSV (1+ files)
  const [pdfData, setPdfData] = useState<PdfParseResult | null>(null);

  // Shared CSV preview builder: counts, the single-year missing-history guard,
  // the preview card, and parse telemetry. Fed the MERGED result of one or more
  // CSV files (see mergeParseResults), so the missing-history guard runs over the
  // combined history rather than tripping on a single partial-year export.
  const buildCsvPreview = useCallback((files: File[], parsed: MergedParseResult, appliedSplits: AppliedSplit[] = []) => {
    const buys = parsed.transactions.filter(tx => tx.action === 'buy').length;
    const sells = parsed.transactions.filter(tx => tx.action === 'sell').length;
    const dividends = parsed.transactions.filter(tx => tx.action === 'dividend').length;

    const years = [...new Set(
      parsed.transactions.map(tx => new Date(tx.transactionDate).getFullYear())
    )].sort((a, b) => b - a);

    if (years.length > 0) setSelectedYear(years[0]);

    // Detect a single-year export that may be missing historical buys (cost basis
    // would be wrong). Applies to any broker's CSV, not just Trading212. Merging
    // multiple files is the intended fix: the guard now sees the combined set.
    const warnings = [...parsed.warnings];
    let historyWarning = false;
    if (years.length === 1) {
      const sellShares: Record<string, number> = {};
      const buyShares: Record<string, number> = {};
      for (const tx of parsed.transactions) {
        const key = tx.isin || tx.ticker;
        if (tx.action === 'sell') sellShares[key] = (sellShares[key] || 0) + tx.shares;
        if (tx.action === 'buy') buyShares[key] = (buyShares[key] || 0) + tx.shares;
      }
      historyWarning = Object.keys(sellShares).some(k => sellShares[k] > (buyShares[k] || 0) + 0.01);
    }
    setCsvHistoryWarning(historyWarning);

    const label = files.length === 1 ? files[0].name : t('csvMultiFileLabel', { count: files.length });

    setPreview({
      fileName: label,
      fileType: 'csv',
      buys,
      sells,
      dividends,
      distributions: 0,
      totalRows: parsed.transactions.length,
      skipped: parsed.skipped.length,
      warnings,
      year: years[0] ?? new Date().getFullYear() - 1,
      years,
      sourceFileCount: parsed.sourceFileCount,
      duplicatesRemoved: parsed.duplicatesRemoved,
      appliedSplits,
    });
    setProcessing(false);
    reportParseEvent({
      fileType: 'csv',
      outcome: warnings.length > 0 || historyWarning ? 'warning' : 'success',
      fileName: label,
      warnings: historyWarning
        ? [...warnings, 'Sells exceed buys for at least one security; CSV may be missing historical buy transactions']
        : warnings,
      summary: {
        buys,
        sells,
        dividends,
        skipped: parsed.skipped.length,
        totalRows: parsed.transactions.length,
        year: years[0],
      },
    });
  }, [t]);

  const reportCsvNoData = useCallback((file: File) => {
    setError(t('csvNoData'));
    setProcessing(false);
    reportParseEvent({ fileType: 'csv', outcome: 'error', fileName: file.name, errorMessage: 'CSV contains no data rows' });
  }, [t]);

  const reportCsvError = useCallback((file: File, message: string) => {
    setError(t('failedParseCsv', { message }));
    setProcessing(false);
    reportParseEvent({ fileType: 'csv', outcome: 'error', fileName: file.name, errorMessage: message });
  }, [t]);

  // Read one broker export into the raw rows its parser expects.
  //  - Trading212: one flat header-keyed table (Papa header:true -> RawCsvRow[]).
  //  - IBKR: multi-section statement (Papa header:false -> string[][]).
  //  - Revolut: an Excel Account Statement, read via a lazy-loaded xlsx reader into
  //    string[][] (kept off the initial bundle); a converted .csv is also accepted
  //    and parsed header:false like IBKR.
  const readBrokerFile = useCallback(
    (file: File, broker: BrokerId): Promise<unknown[]> => {
      if (broker === 'revolut' && file.name.toLowerCase().endsWith('.xlsx')) {
        return import('read-excel-file/browser').then(async ({ default: readXlsxFile }) => {
          // read-excel-file returns rows of cells at runtime; its `Sheet` type is
          // awkward to index, so coerce through unknown to a plain 2D array.
          const rows = (await readXlsxFile(file)) as unknown as unknown[][];
          return rows.map((row) => row.map((cell) => xlsxCellToString(cell)));
        });
      }
      return new Promise((resolve, reject) => {
        Papa.parse(file, {
          header: broker === 'trading212',
          skipEmptyLines: true,
          complete: (results) => resolve(results.data as unknown[]),
          error: (err) => reject(err),
        });
      });
    },
    [],
  );

  // Read + parse every selected CSV file with the chosen broker's parser, then
  // merge into one ParseResult so the engine sees the combined cost-basis history
  // (backlog #1, multi-file CSV). Empty files contribute nothing; if every file
  // is empty we surface the same no-data error as the single-file path.
  const processCsvFiles = useCallback(
    async (files: File[], broker: BrokerId) => {
      try {
        const rawPerFile = await Promise.all(files.map((f) => readBrokerFile(f, broker)));
        const totalRawRows = rawPerFile.reduce((sum, rows) => sum + rows.length, 0);
        if (totalRawRows === 0) { reportCsvNoData(files[0]); return; }

        const perFileResults = rawPerFile
          .filter((rows) => rows.length > 0)
          .map((rows) => {
            if (broker === 'ibkr') return parseIbkrCsv(rows as string[][]);
            if (broker === 'revolut') return parseRevolutStatement(rows as string[][]);
            return parseTrading212Csv(rows as RawCsvRow[]);
          });
        const merged = mergeParseResults(perFileResults);
        // Trading212 CSV carries no split events, so repair cost basis for any
        // position held across a known forward split. Revolut and IBKR report
        // their own splits, so they must not consume the table (double-count).
        const { transactions, appliedSplits, warnings } =
          broker === 'trading212'
            ? applyKnownStockSplits(merged.transactions)
            : { transactions: merged.transactions, appliedSplits: [] as AppliedSplit[], warnings: [] as string[] };
        const adjusted: MergedParseResult = {
          ...merged,
          transactions,
          warnings: [...merged.warnings, ...warnings],
        };
        setCsvParse(adjusted);
        buildCsvPreview(files, adjusted, appliedSplits);
      } catch (err) {
        reportCsvError(files[0], err instanceof Error ? err.message : 'Unknown error');
      }
    },
    [readBrokerFile, buildCsvPreview, reportCsvNoData, reportCsvError],
  );

  const processPdf = useCallback(async (file: File) => {
    try {
      const pageTexts = await extractPdfPageTexts(file);
      const parsed = parseTrading212AnnualStatement(pageTexts);
      setPdfData(parsed);
      setSelectedYear(parsed.year);

      setPreview({
        fileName: file.name,
        fileType: 'pdf',
        sells: parsed.sellTrades.length,
        dividends: parsed.dividends.length,
        distributions: parsed.distributions.length,
        warnings: parsed.warnings,
        year: parsed.year,
        closedResult: parsed.overview.closedResult,
        currency: parsed.overview.currency,
        brokerMismatch: parsed.brokerMismatch ?? false,
      });
      setProcessing(false);
      reportParseEvent({
        fileType: 'pdf',
        outcome: parsed.warnings.length > 0 ? 'warning' : 'success',
        fileName: file.name,
        warnings: parsed.warnings,
        summary: {
          sells: parsed.sellTrades.length,
          dividends: parsed.dividends.length,
          distributions: parsed.distributions.length,
          pages: pageTexts.length,
          year: parsed.year,
        },
      });

      // Let the paid flow react to the parse (e.g. fetch the BNR rate). The free
      // checker passes no callback, so this is a no-op there.
      onPdfParsedRef.current?.(parsed);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(t('failedParsePdf', { message }));
      setProcessing(false);
      reportParseEvent({
        fileType: 'pdf',
        outcome: 'error',
        fileName: file.name,
        errorMessage: message,
      });
    }
  }, [t]);

  // Extension + tab-match + size validation for one file.
  const validateFile = useCallback((file: File): string | null => {
    const name = file.name.toLowerCase();
    const isPdf = name.endsWith('.pdf');
    const isCsv = name.endsWith('.csv');
    const isXlsx = name.endsWith('.xlsx');
    if (activeTab === 'pdf') {
      if (!isPdf) return t('invalidFileType');
    } else {
      // CSV/spreadsheet tab: Revolut exports Excel (.xlsx); a converted .csv is
      // also accepted. Other brokers are .csv only.
      const accepted = csvBroker === 'revolut' ? isXlsx || isCsv : isCsv;
      if (!accepted) return t('invalidFileType');
    }
    if (file.size > 10 * 1024 * 1024) return t('fileTooLarge');
    return null;
  }, [activeTab, csvBroker, t]);

  // Entry point for both the file input and drag-drop. PDF stays single-file (one
  // annual statement); CSV accepts multiple files and merges them.
  const processFiles = useCallback((files: File[]) => {
    setError(null);
    setPreview(null);
    setCsvParse(null);
    setPdfData(null);
    if (files.length === 0) return;

    if (activeTab === 'pdf') {
      const file = files[0];
      const validationError = validateFile(file);
      if (validationError) { setError(validationError); return; }
      setProcessing(true);
      processPdf(file);
    } else {
      for (const file of files) {
        const validationError = validateFile(file);
        if (validationError) { setError(validationError); return; }
      }
      setProcessing(true);
      processCsvFiles(files, csvBroker);
    }
  }, [activeTab, csvBroker, validateFile, processPdf, processCsvFiles]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) processFiles(files);
  }, [processFiles]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length > 0) processFiles(files);
  }, [processFiles]);

  const handleTabChange = useCallback((tab: FileType) => {
    setActiveTab(tab);
    setError(null);
    setPreview(null);
    setCsvParse(null);
    setPdfData(null);
    setCsvHistoryWarning(false);
  }, []);

  const handleCsvBrokerChange = useCallback((broker: BrokerId) => {
    setCsvBroker(broker);
    setError(null);
    setPreview(null);
    setCsvParse(null);
    setCsvHistoryWarning(false);
  }, []);

  const clearPreview = useCallback(() => {
    setPreview(null);
    setCsvParse(null);
    setPdfData(null);
    setError(null);
    setCsvHistoryWarning(false);
  }, []);

  return {
    fileInputRef,
    activeTab,
    csvBroker,
    dragOver,
    processing,
    error,
    preview,
    selectedYear,
    csvParse,
    pdfData,
    csvHistoryWarning,
    setSelectedYear,
    setDragOver,
    handleTabChange,
    handleCsvBrokerChange,
    handleDrop,
    handleFileInput,
    clearPreview,
  };
}
