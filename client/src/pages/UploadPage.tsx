import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Upload, FileText, AlertTriangle, CheckCircle, X, PartyPopper } from 'lucide-react';
import Papa from 'papaparse';
import {
  parseTrading212Csv,
  parseIbkrCsv,
  parseRevolutStatement,
  mergeParseResults,
  applyKnownStockSplits,
  calculateTaxes,
  parseTrading212AnnualStatement,
  calculateTaxesFromPdf,
  applyBnrRates,
  getTaxConfigForYear,
} from '@shared/index';
import type { RawCsvRow, ParseResult, MergedParseResult, PdfParseResult, CurrencyBnrRates, AppliedSplit } from '@shared/index';
import { extractPdfPageTexts } from '../utils/pdfExtractor';
import { useCountry } from '../contexts/CountryContext';
import { useUpload } from '../contexts/UploadContext';
import { useAuth } from '../contexts/AuthContext';
import { analytics } from '../lib/analytics';
import { reportParseEvent } from '../lib/parseMonitor';
import { CSV_BROKERS, type BrokerId } from '../lib/brokers';
import PageMeta from '../components/common/PageMeta';

type FileType = 'csv' | 'pdf';

/** Coerce a read-excel-file cell (string | number | boolean | Date | null) to a
 *  string, so the Revolut parser sees the same row shape it gets from a CSV parse.
 *  Excel date cells become ISO strings the parser's `new Date()` can read. */
function xlsxCellToString(cell: unknown): string {
  if (cell === null || cell === undefined) return '';
  if (cell instanceof Date) return cell.toISOString();
  return String(cell);
}

interface PreviewData {
  fileName: string;
  fileType: FileType;
  sells: number;
  dividends: number;
  distributions: number;
  warnings: string[];
  year: number;
  // CSV-specific
  buys?: number;
  totalRows?: number;
  skipped?: number;
  years?: number[];
  sourceFileCount?: number;
  duplicatesRemoved?: number;
  appliedSplits?: AppliedSplit[];
  // PDF-specific
  closedResult?: number;
  currency?: string;
}

export default function UploadPage() {
  const { t } = useTranslation('upload');
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { countryConfig } = useCountry();
  const { setUploadData } = useUpload();
  const { user, loading: authLoading } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [showWelcome, setShowWelcome] = useState(() => searchParams.get('welcome') === '1');

  // Paywall: redirect free/unauthenticated users to pricing
  useEffect(() => {
    if (authLoading) return;
    if (!user || user.plan !== 'paid') {
      analytics.paywallSeen();
      navigate('/pricing', { replace: true });
    }
  }, [user, authLoading, navigate]);

  // Post-payment welcome toast: strip the ?welcome=1 query, auto-dismiss after 6s.
  useEffect(() => {
    if (!showWelcome) return;
    if (searchParams.get('welcome') === '1') {
      analytics.paymentCompleted();
      searchParams.delete('welcome');
      setSearchParams(searchParams, { replace: true });
    }
    const timer = setTimeout(() => setShowWelcome(false), 6000);
    return () => clearTimeout(timer);
  }, [showWelcome, searchParams, setSearchParams]);

  const [activeTab, setActiveTab] = useState<FileType>('pdf');
  const [dragOver, setDragOver] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear() - 1);

  const DEFAULT_EXCHANGE_RATE_EUR_RON = 4.97;
  const [exchangeRate, setExchangeRate] = useState<number>(DEFAULT_EXCHANGE_RATE_EUR_RON);
  const [rateLoading, setRateLoading] = useState(false);
  const [rateSource, setRateSource] = useState<string | null>(null);
  // Per-date BNR daily map for the PDF flow (backlog #21). Capital gains convert
  // at each trade's execution-date rate (art. 96); the editable `exchangeRate`
  // (annual average) still governs dividends + the overview-fallback path. Null
  // when the account currency is local or the daily fetch degraded.
  const [pdfDailyRates, setPdfDailyRates] = useState<Record<string, number> | null>(null);

  const [csvRateLoading, setCsvRateLoading] = useState(false);
  const [csvRateStatus, setCsvRateStatus] = useState<string | null>(null);
  // Status kind drives the note color: 'ok' = full BNR (green), 'partial' /
  // 'fallback' = some/all currencies on the broker rate (yellow). Tracked
  // explicitly because every message contains the literal "BNR" so a substring
  // check can't tell success from a degraded conversion (backlog #25).
  const [csvRateStatusKind, setCsvRateStatusKind] = useState<'ok' | 'partial' | 'fallback' | null>(null);
  const [csvHistoryWarning, setCsvHistoryWarning] = useState(false);

  // Store parsed data for calculate step
  const [csvBroker, setCsvBroker] = useState<BrokerId>('trading212');
  const [csvParse, setCsvParse] = useState<MergedParseResult | null>(null); // merged CSV (1+ files)
  const [pdfData, setPdfData] = useState<PdfParseResult | null>(null);

  const fetchBnrRate = useCallback((year: number, currency: string) => {
    if (!countryConfig || currency === countryConfig.currency) return;

    setRateLoading(true);
    setRateSource(null);
    setPdfDailyRates(null);

    // Per ANAF, capital gains convert at the per-trade-date BNR rate (art. 96)
    // and dividends at the annual average (art. 131 alin. 6). Fetch both: the
    // average pre-fills the editable rate (used for dividends + the
    // overview-fallback path), the daily map drives per-trade-date capital-gains
    // conversion. A daily-fetch failure degrades capital gains to the annual
    // average (the prior behavior), so it must not block the average path.
    Promise.all([
      fetch(`/api/exchange-rates/${year}/average?currency=${currency}`),
      fetch(`/api/exchange-rates/${year}/daily?currency=${currency}`),
    ])
      .then(async ([avgRes, dailyRes]) => {
        if (!avgRes.ok) throw new Error('Failed to fetch rate');
        const avgData = await avgRes.json();
        setExchangeRate(avgData.rate);
        if (dailyRes.ok) {
          const dailyData = await dailyRes.json();
          if (dailyData?.rates && Object.keys(dailyData.rates).length > 0) {
            setPdfDailyRates(dailyData.rates);
            setRateSource(`BNR ${year} (per-date + average)`);
            return;
          }
        }
        // Daily rates unavailable: capital gains fall back to the annual average.
        setRateSource(`BNR ${year} average`);
      })
      .catch(() => {
        setRateSource(null);
      })
      .finally(() => setRateLoading(false));
  }, [countryConfig]);

  // Shared CSV preview builder: counts, the single-year missing-history guard,
  // the preview card, and parse telemetry. Fed the MERGED result of one or more
  // CSV files (see mergeParseResults), so the missing-history guard runs over the
  // combined history rather than tripping on a single partial-year export.
  const buildCsvPreview = useCallback((files: File[], parsed: MergedParseResult, appliedSplits: AppliedSplit[] = []) => {
    const buys = parsed.transactions.filter(t => t.action === 'buy').length;
    const sells = parsed.transactions.filter(t => t.action === 'sell').length;
    const dividends = parsed.transactions.filter(t => t.action === 'dividend').length;

    const years = [...new Set(
      parsed.transactions.map(t => new Date(t.transactionDate).getFullYear())
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
    analytics.csvUploaded();
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
      });
      setProcessing(false);
      analytics.pdfUploaded();
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

      // Auto-fetch BNR exchange rate
      if (parsed.overview.currency) {
        fetchBnrRate(parsed.year, parsed.overview.currency);
      }
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
  }, [fetchBnrRate, t]);

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

  const handleTabChange = (tab: FileType) => {
    setActiveTab(tab);
    setError(null);
    setPreview(null);
    setCsvParse(null);
    setPdfData(null);
    setCsvHistoryWarning(false);
  };

  const handleCsvBrokerChange = (broker: BrokerId) => {
    setCsvBroker(broker);
    setError(null);
    setPreview(null);
    setCsvParse(null);
    setCsvHistoryWarning(false);
  };

  // Enrich CSV transactions with BNR rates and run the engine, then stash the
  // result for the results page. Shared by the Trading212 and IBKR CSV paths,
  // which both produce a ParseResult of Transactions; the `broker` is recorded so
  // the results page can show the beta verify-before-filing caveat where needed.
  const finalizeCsv = useCallback(async (parsed: ParseResult, broker: BrokerId, fileName: string) => {
    if (!countryConfig) return;

    // Detect every foreign currency present (not just the dominant one) and
    // fetch BNR rates per currency, so a mixed USD/GBP/EUR statement converts
    // each transaction at its OWN currency's rate (backlog #5). IBKR and merged
    // multi-file exports make mixed-currency statements common.
    const foreignCurrencies = [
      ...new Set(
        parsed.transactions
          .map((tx) => tx.priceCurrency)
          .filter((currency) => currency !== countryConfig.currency),
      ),
    ];

    let enrichedTransactions = parsed.transactions;
    if (foreignCurrencies.length > 0) {
      setCsvRateLoading(true);
      setCsvRateStatus(null);
      setCsvRateStatusKind(null);
      // Fetch BNR rates per currency INDEPENDENTLY (backlog #25): one currency's
      // failure no longer degrades the whole statement. Currencies that fetch
      // convert at their own BNR rate; a currency that fails is left OUT of the
      // map, so applyBnrRates leaves its transactions unconverted and the engine
      // falls back to the broker rate (totalAmountLocal=0 -> totalAmountOriginal
      // * exchangeRateToLocal). The status names which currencies used BNR vs the
      // broker rate so the mixed methodology is never implied as fully exact.
      // (Per ANAF: capital gains use per-date BNR, dividends the annual average.)
      const ratesByCurrency: Record<string, CurrencyBnrRates> = {};
      const okCurrencies: string[] = [];
      const failedCurrencies: string[] = [];
      let totalDates = 0;
      try {
        await Promise.all(
          foreignCurrencies.map(async (currency) => {
            try {
              const [dailyRes, avgRes] = await Promise.all([
                fetch(`/api/exchange-rates/${selectedYear}/daily?currency=${currency}`),
                fetch(`/api/exchange-rates/${selectedYear}/average?currency=${currency}`),
              ]);
              if (!dailyRes.ok) throw new Error(`Failed to fetch BNR rates for ${currency}`);
              const dailyData = await dailyRes.json();
              if (!dailyData?.rates || Object.keys(dailyData.rates).length === 0) {
                throw new Error(`Empty BNR rates for ${currency}`);
              }
              // Annual-avg failure must not kill the daily path; that currency's
              // dividends degrade to per-date instead.
              let annualAvg: number | null = null;
              if (avgRes.ok) {
                try {
                  const avgData = await avgRes.json();
                  if (typeof avgData?.rate === 'number') annualAvg = avgData.rate;
                } catch { /* leave annualAvg as null */ }
              }
              ratesByCurrency[currency] = { daily: dailyData.rates, annualAvg };
              totalDates += dailyData.count ?? 0;
              okCurrencies.push(currency);
            } catch {
              failedCurrencies.push(currency);
            }
          }),
        );
        enrichedTransactions = applyBnrRates(
          parsed.transactions,
          ratesByCurrency,
          countryConfig.currency,
        );
        if (okCurrencies.length === 0) {
          // No currency fetched: full broker-rate fallback (prior behavior).
          setCsvRateStatus(t('bnrRateFallback'));
          setCsvRateStatusKind('fallback');
        } else if (failedCurrencies.length > 0) {
          // Partial: BNR for the currencies that fetched, broker rate for the rest.
          setCsvRateStatus(
            t('bnrRatePartial', { ok: okCurrencies.join(', '), failed: failedCurrencies.join(', ') }),
          );
          setCsvRateStatusKind('partial');
        } else {
          setCsvRateStatus(
            okCurrencies.length === 1
              ? `BNR ${selectedYear} daily rates (${totalDates} dates)`
              : `BNR ${selectedYear} daily rates (${okCurrencies.length} currencies, ${totalDates} dates)`,
          );
          setCsvRateStatusKind('ok');
        }
      } catch {
        setCsvRateStatus(t('bnrRateFallback'));
        setCsvRateStatusKind('fallback');
      } finally {
        setCsvRateLoading(false);
      }
    }

    // Dispatch tax rates by the selected income year (backlog #13).
    const yearConfig = getTaxConfigForYear(countryConfig, selectedYear);
    const { taxResult, securities } = calculateTaxes(enrichedTransactions, yearConfig, selectedYear);

    setUploadData({
      parseResult: parsed,
      parseWarnings: parsed.warnings,
      transactions: enrichedTransactions,
      taxResult,
      securities,
      fileName,
      taxYear: selectedYear,
      broker,
    });
  }, [countryConfig, selectedYear, setUploadData, t]);

  const handleCalculate = useCallback(async () => {
    if (!countryConfig) return;

    if (preview?.fileType === 'pdf' && pdfData) {
      // Convert from account currency to local currency (e.g. USD → RON)
      const needsConversion = preview.currency !== countryConfig.currency;
      const rate = needsConversion ? exchangeRate : 1;

      // Per-date BNR for capital gains (backlog #21, art. 96): supply the daily
      // map only when every sell trade shares the overview currency, i.e. when
      // the engine takes the per-row branch. For mixed-currency / mismatched
      // statements the engine uses overview * annual-rate anyway, so withholding
      // the map keeps that path byte-identical to the prior single-rate behavior.
      const allTradesMatchOverview =
        pdfData.sellTrades.length > 0 &&
        pdfData.sellTrades.every((t) => t.transactionCurrency === pdfData.overview.currency);
      const dailyRates =
        needsConversion && allTradesMatchOverview ? pdfDailyRates ?? undefined : undefined;

      // Dispatch tax rates by the statement's income year (backlog #13). 2025 →
      // current rates; 2026+ falls back to the latest engine-supported year until
      // its rates are signed off (TAX_YEARS[year].engineSupported gate).
      const yearConfig = getTaxConfigForYear(countryConfig, pdfData.year);
      const { taxResult, securities, warnings: engineWarnings } = calculateTaxesFromPdf(pdfData, yearConfig, rate, dailyRates);

      // Engine-emitted warnings (sign + magnitude mismatch) reach the operator
      // through the same channel as parser warnings, but tagged separately so
      // Sentry + DB queries can distinguish parser drift from engine drift.
      if (engineWarnings.length > 0) {
        reportParseEvent({
          fileType: 'pdf',
          outcome: 'warning',
          fileName: preview.fileName,
          warnings: [],
          engineWarnings,
          summary: {
            sells: pdfData.sellTrades.length,
            dividends: pdfData.dividends.length,
            distributions: pdfData.distributions.length,
            year: pdfData.year,
          },
        });
      }

      setUploadData({
        parseResult: null,
        parseWarnings: [...pdfData.warnings, ...engineWarnings],
        transactions: [],
        taxResult,
        securities,
        fileName: preview.fileName,
        taxYear: pdfData.year,
        broker: 'trading212',
      });
    } else if (preview?.fileType === 'csv') {
      if (!csvParse || csvParse.transactions.length === 0) return;
      await finalizeCsv(csvParse, csvBroker, preview.fileName);
    } else {
      return;
    }

    navigate('/results');
  }, [countryConfig, preview, pdfData, csvParse, csvBroker, exchangeRate, pdfDailyRates, setUploadData, navigate, finalizeCsv]);

  const clearUpload = () => {
    setPreview(null);
    setCsvParse(null);
    setPdfData(null);
    setError(null);
    setCsvHistoryWarning(false);
  };

  // Don't render while checking auth — prevents flash
  if (authLoading || !user || user.plan !== 'paid') {
    return null;
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-12">
      <PageMeta titleKey="uploadTitle" descriptionKey="uploadDesc" />
      {/* Post-payment welcome toast */}
      {showWelcome && (
        <div className="mb-6 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg flex items-center gap-3">
          <PartyPopper className="w-6 h-6 text-green-600 dark:text-green-400 shrink-0" />
          <div>
            <p className="font-semibold text-green-800 dark:text-green-300">{t('welcomeTitle', 'Welcome to InvesTax!')}</p>
            <p className="text-sm text-green-700 dark:text-green-400">{t('welcomeMessage', 'Your payment was successful. Upload your Trading212 statement to get started.')}</p>
          </div>
        </div>
      )}

      <h1 className="text-3xl font-bold mb-2">{t('title')}</h1>
      <p className="text-gray-600 dark:text-slate-400 mb-8">
        {t('subtitle')}
      </p>

      {/* PDF / CSV tabs */}
      {!preview && (
        <div className="mb-6">
          <div className="flex border-b border-gray-200 dark:border-navy-600">
            <button
              onClick={() => handleTabChange('pdf')}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'pdf'
                  ? 'border-accent text-accent dark:text-accent-light'
                  : 'border-transparent text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-300'
              }`}
            >
              <FileText className="w-4 h-4" />
              {t('tabPdf')}
              <span className="ml-1 text-xs px-1.5 py-0.5 rounded-full bg-accent/10 text-accent dark:text-accent-light font-medium">
                {t('tabPdfRecommended')}
              </span>
            </button>
            <button
              onClick={() => handleTabChange('csv')}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'csv'
                  ? 'border-accent text-accent dark:text-accent-light'
                  : 'border-transparent text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-300'
              }`}
            >
              <Upload className="w-4 h-4" />
              {t('tabCsv')}
              <span className="ml-1 text-xs px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-navy-600 text-gray-500 dark:text-slate-400 font-medium">
                {t('tabCsvAdvanced')}
              </span>
            </button>
          </div>
        </div>
      )}

      {/* CSV broker selector */}
      {!preview && activeTab === 'csv' && (
        <div className="mb-4">
          <label className="block text-sm font-medium mb-2">{t('csvBrokerLabel')}</label>
          <div className="flex flex-wrap gap-2">
            {CSV_BROKERS.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => handleCsvBrokerChange(b.id)}
                aria-pressed={csvBroker === b.id}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${
                  csvBroker === b.id
                    ? 'border-accent bg-accent/10 text-accent dark:text-accent-light'
                    : 'border-gray-200 dark:border-navy-600 text-gray-600 dark:text-slate-400 hover:border-accent/50'
                }`}
              >
                {b.label}
                {b.status === 'beta' && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 font-semibold uppercase tracking-wide">
                    {t('beta')}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* CSV pre-upload warning (broker-aware) */}
      {!preview && activeTab === 'csv' && (
        <div className="mb-4 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700 rounded-lg">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <p className="text-sm text-amber-700 dark:text-amber-400">
              {csvBroker === 'ibkr'
                ? t('ibkrBetaPreWarning')
                : csvBroker === 'revolut'
                  ? t('revolutBetaPreWarning')
                  : t('csvPreWarning')}
            </p>
          </div>
        </div>
      )}

      {/* Drop zone */}
      {!preview && (
        <div className="card">
          <div
            className={`border-2 border-dashed rounded-xl p-12 text-center transition-colors cursor-pointer ${
              dragOver
                ? 'border-accent bg-accent/5'
                : 'border-gray-300 dark:border-navy-500 hover:border-accent dark:hover:border-accent'
            }`}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            {processing ? (
              <>
                <div className="w-12 h-12 border-4 border-accent border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                <p className="text-lg font-medium">{t('processingFile')}</p>
              </>
            ) : (
              <>
                {activeTab === 'pdf' ? (
                  <FileText className="w-12 h-12 text-accent dark:text-accent-light/60 mx-auto mb-4" />
                ) : (
                  <Upload className="w-12 h-12 text-gray-500 dark:text-slate-400 mx-auto mb-4" />
                )}
                <p className="text-lg font-medium mb-1">
                  {activeTab === 'pdf' ? t('pdfDropHere') : t('csvDropHere')}
                </p>
                <p className="text-sm text-gray-500 dark:text-slate-400">
                  {activeTab === 'pdf' ? t('pdfOrClick') : t('csvOrClick')}
                </p>
                <p className="mt-3 text-xs text-gray-500 dark:text-slate-400">
                  {activeTab === 'pdf'
                    ? t('pdfHint')
                    : csvBroker === 'ibkr'
                      ? t('ibkrCsvHint')
                      : csvBroker === 'revolut'
                        ? t('revolutHint')
                        : t('csvHint')}
                </p>
                {activeTab === 'csv' && (
                  <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">
                    {csvBroker === 'ibkr'
                      ? t('ibkrFullHistoryNote')
                      : csvBroker === 'revolut'
                        ? t('revolutFullHistoryNote')
                        : t('csvFullHistoryNote')}
                  </p>
                )}
                {activeTab === 'csv' && (
                  <p className="mt-1 text-xs text-accent dark:text-accent-light">
                    {t('csvMultiFileHint')}
                  </p>
                )}
              </>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept={activeTab === 'pdf' ? '.pdf' : csvBroker === 'revolut' ? '.xlsx,.csv' : '.csv'}
            multiple={activeTab === 'csv'}
            onChange={handleFileInput}
            className="hidden"
          />
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mt-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-red-700 dark:text-red-400 font-medium">{error}</p>
          </div>
        </div>
      )}

      {/* Preview */}
      {preview && (
        <div className="space-y-4">
          {/* File info card */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <FileText className="w-8 h-8 text-accent dark:text-accent-light" />
                <div>
                  <p className="font-semibold">{preview.fileName}</p>
                  <p className="text-sm text-gray-500 dark:text-slate-400">
                    {preview.fileType === 'pdf'
                      ? t('annualStatement', { year: preview.year })
                      : t('transactionsParsed', { count: preview.totalRows })
                    }
                  </p>
                  {preview.fileType === 'csv' && (preview.sourceFileCount ?? 1) > 1 && (
                    <p className="text-xs text-gray-500 dark:text-slate-400">
                      {t('csvFilesMerged', { count: preview.sourceFileCount })}
                    </p>
                  )}
                </div>
              </div>
              <button
                onClick={clearUpload}
                className="p-2 hover:bg-gray-100 dark:hover:bg-navy-700 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Stats */}
            {preview.fileType === 'pdf' ? (
              <div className="space-y-3">
                {preview.closedResult !== undefined && (
                  <div className="bg-gray-50 dark:bg-navy-700/50 rounded-lg p-3">
                    <p className="text-sm text-gray-500 dark:text-slate-400">{t('closedResultLabel')}</p>
                    <p className="text-2xl font-bold">
                      {preview.closedResult.toLocaleString('en-US', { minimumFractionDigits: 2 })} {preview.currency}
                    </p>
                  </div>
                )}
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-3 text-center">
                    <p className="text-2xl font-bold text-red-600 dark:text-red-400">{preview.sells}</p>
                    <p className="text-xs text-red-700 dark:text-red-500">{t('sellTrades')}</p>
                  </div>
                  <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 text-center">
                    <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{preview.dividends}</p>
                    <p className="text-xs text-blue-700 dark:text-blue-500">{t('dividends')}</p>
                  </div>
                  <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-3 text-center">
                    <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">{preview.distributions}</p>
                    <p className="text-xs text-purple-700 dark:text-purple-500">{t('distributions')}</p>
                  </div>
                </div>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-3 text-center">
                    <p className="text-2xl font-bold text-green-600 dark:text-green-400">{preview.buys}</p>
                    <p className="text-xs text-green-700 dark:text-green-500">{t('buys')}</p>
                  </div>
                  <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-3 text-center">
                    <p className="text-2xl font-bold text-red-600 dark:text-red-400">{preview.sells}</p>
                    <p className="text-xs text-red-700 dark:text-red-500">{t('sells')}</p>
                  </div>
                  <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 text-center">
                    <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{preview.dividends}</p>
                    <p className="text-xs text-blue-700 dark:text-blue-500">{t('dividends')}</p>
                  </div>
                </div>
                {(preview.skipped ?? 0) > 0 && (
                  <p className="text-xs text-gray-500 dark:text-slate-400 mt-3">
                    {t('rowsSkipped', { count: preview.skipped })}
                  </p>
                )}
                {(preview.duplicatesRemoved ?? 0) > 0 && (
                  <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">
                    {t('csvDuplicatesRemoved', { count: preview.duplicatesRemoved })}
                  </p>
                )}
                {(preview.appliedSplits?.length ?? 0) > 0 && (
                  <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">
                    {t('csvSplitsApplied', { splits: preview.appliedSplits!.map((s) => s.label).join(', ') })}
                  </p>
                )}

                {/* Broker-specific CSV note */}
                {csvBroker === 'ibkr' ? (
                  <div className="mt-4 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700 rounded-lg">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">{t('ibkrBetaNoteTitle')}</p>
                        <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">{t('ibkrBetaNoteBody')}</p>
                      </div>
                    </div>
                  </div>
                ) : csvBroker === 'revolut' ? (
                  <div className="mt-4 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700 rounded-lg">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">{t('revolutBetaNoteTitle')}</p>
                        <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">{t('revolutBetaNoteBody')}</p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700 rounded-lg">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">{t('csvSplitWarningTitle')}</p>
                        <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">{t('csvSplitWarningBody')}</p>
                        <p className="text-xs text-amber-700 dark:text-amber-400 mt-1 font-medium">{t('csvSplitWarningAction')}</p>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Warnings */}
          {preview.warnings.length > 0 && (
            <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-xl">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="w-4 h-4 text-yellow-600" />
                <p className="text-sm font-medium text-yellow-700 dark:text-yellow-400">{t('warnings')}</p>
              </div>
              {preview.warnings.map((w, i) => (
                <p key={i} className="text-sm text-yellow-600 dark:text-yellow-500">{w}</p>
              ))}
            </div>
          )}

          {/* Critical: CSV missing historical buys */}
          {csvHistoryWarning && preview?.fileType === 'csv' && (
            <div className="p-5 bg-red-50 dark:bg-red-900/20 border-2 border-red-400 dark:border-red-600 rounded-xl">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-6 h-6 text-red-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-red-700 dark:text-red-400 font-bold text-base mb-2">{t('csvHistoryBlockTitle')}</p>
                  <p className="text-sm text-red-600 dark:text-red-400 mb-3">{t('csvMissingHistoryWarning')}</p>
                  <p className="text-sm text-red-600 dark:text-red-400 font-medium">{t('csvHistoryBlockAction')}</p>
                </div>
              </div>
            </div>
          )}

          {/* Exchange rate (when account currency differs from tax currency) */}
          {preview.fileType === 'pdf' && preview.currency && countryConfig && preview.currency !== countryConfig.currency && (
            <div className="card">
              <label className="block text-sm font-medium mb-1">
                {t('exchangeRateLabel', { from: preview.currency, to: countryConfig.currency })}
              </label>
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex-1">
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={exchangeRate}
                    onChange={(e) => setExchangeRate(parseFloat(e.target.value) || 0)}
                    className="input"
                  />
                </div>
                <div className="text-sm text-gray-500 dark:text-slate-400">
                  {t('exchangeRateDisplay', { from: preview.currency, rate: exchangeRate, to: countryConfig.currency })}
                </div>
              </div>
              {rateLoading && (
                <p className="text-xs text-accent dark:text-accent-light mt-2">{t('fetchingRate')}</p>
              )}
              {rateSource && !rateLoading && (
                <p className="text-xs text-green-600 dark:text-green-400 mt-2">
                  {t('rateAutoFetched', { source: rateSource })}
                </p>
              )}
              {!rateSource && !rateLoading && (
                <p className="text-xs text-gray-500 dark:text-slate-400 mt-2">
                  {t('enterManualRate', { year: preview.year })}
                </p>
              )}
            </div>
          )}

          {/* Year selector and calculate */}
          <div className="card">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">{t('taxYear')}</label>
                {preview.fileType === 'pdf' ? (
                  <p className="text-lg font-bold">{preview.year}</p>
                ) : (
                  <select
                    value={selectedYear}
                    onChange={(e) => setSelectedYear(Number(e.target.value))}
                    className="input w-auto"
                  >
                    {(preview.years ?? []).map(y => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                )}
              </div>
              <button
                onClick={handleCalculate}
                disabled={csvRateLoading || csvHistoryWarning}
                className={`flex items-center justify-center gap-2 text-lg px-6 py-3 w-full sm:w-auto ${csvHistoryWarning ? 'btn-secondary opacity-50 cursor-not-allowed' : 'btn-primary'}`}
              >
                {csvRateLoading ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <CheckCircle className="w-5 h-5" />
                )}
                {csvRateLoading ? t('fetchingBnrRates') : t('calculateTaxes')}
              </button>
            </div>
            {countryConfig && (
              <p className="text-xs text-gray-500 dark:text-slate-400 mt-3">
                {t('usingTaxRules', { country: countryConfig.name, rate: countryConfig.capitalGainsTaxRate * 100 })}
                {' · '}
                {t('taxRulesUpdated')}
              </p>
            )}
            {csvRateStatus && preview?.fileType === 'csv' && (
              <p className={`text-xs mt-1 ${
                csvRateStatusKind === 'ok' ? 'text-green-600 dark:text-green-400' : 'text-yellow-600 dark:text-yellow-400'
              }`}>
                {csvRateStatus}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
