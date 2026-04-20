import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Upload, FileText, AlertTriangle, CheckCircle, X, PartyPopper } from 'lucide-react';
import Papa from 'papaparse';
import {
  parseTrading212Csv,
  calculateTaxes,
  parseTrading212AnnualStatement,
  calculateTaxesFromPdf,
} from '@shared/index';
import type { RawCsvRow, PdfParseResult, Transaction } from '@shared/index';
import { extractPdfPageTexts } from '../utils/pdfExtractor';
import { useCountry } from '../contexts/CountryContext';
import { useUpload } from '../contexts/UploadContext';
import { useAuth } from '../contexts/AuthContext';
import { analytics } from '../lib/analytics';
import PageMeta from '../components/common/PageMeta';

type FileType = 'csv' | 'pdf';

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
      navigate('/pricing', { replace: true });
    }
  }, [user, authLoading, navigate]);

  // Post-payment welcome toast: strip the ?welcome=1 query, auto-dismiss after 6s.
  useEffect(() => {
    if (!showWelcome) return;
    if (searchParams.get('welcome') === '1') {
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

  const [csvRateLoading, setCsvRateLoading] = useState(false);
  const [csvRateStatus, setCsvRateStatus] = useState<string | null>(null);
  const [csvHistoryWarning, setCsvHistoryWarning] = useState(false);

  // Store parsed data for calculate step
  const [csvRows, setCsvRows] = useState<RawCsvRow[]>([]);
  const [pdfData, setPdfData] = useState<PdfParseResult | null>(null);

  const fetchBnrRate = useCallback((year: number, currency: string) => {
    if (!countryConfig || currency === countryConfig.currency) return;

    setRateLoading(true);
    setRateSource(null);

    fetch(`/api/exchange-rates/${year}/average?currency=${currency}`)
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch rate');
        return res.json();
      })
      .then(data => {
        setExchangeRate(data.rate);
        setRateSource(`BNR ${year} average`);
      })
      .catch(() => {
        setRateSource(null);
      })
      .finally(() => setRateLoading(false));
  }, [countryConfig]);

  const processCsv = useCallback((file: File) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const rows = results.data as RawCsvRow[];
        if (rows.length === 0) {
          setError(t('csvNoData'));
          setProcessing(false);
          return;
        }

        const parsed = parseTrading212Csv(rows);
        setCsvRows(rows);

        const buys = parsed.transactions.filter(t => t.action === 'buy').length;
        const sells = parsed.transactions.filter(t => t.action === 'sell').length;
        const dividends = parsed.transactions.filter(t => t.action === 'dividend').length;

        const years = [...new Set(
          parsed.transactions.map(t => new Date(t.transactionDate).getFullYear())
        )].sort((a, b) => b - a);

        if (years.length > 0) setSelectedYear(years[0]);

        // Detect single-year CSV that may be missing historical buys
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

        setPreview({
          fileName: file.name,
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
        });
        setProcessing(false);
        analytics.csvUploaded();
      },
      error: (err) => {
        setError(t('failedParseCsv', { message: err.message }));
        setProcessing(false);
      },
    });
  }, []);

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

      // Auto-fetch BNR exchange rate
      if (parsed.overview.currency) {
        fetchBnrRate(parsed.year, parsed.overview.currency);
      }
    } catch (err) {
      setError(t('failedParsePdf', { message: err instanceof Error ? err.message : 'Unknown error' }));
      setProcessing(false);
    }
  }, [fetchBnrRate]);

  const processFile = useCallback((file: File) => {
    setError(null);
    setPreview(null);
    setCsvRows([]);
    setPdfData(null);

    const name = file.name.toLowerCase();
    const isCsv = name.endsWith('.csv');
    const isPdf = name.endsWith('.pdf');

    if (!isCsv && !isPdf) {
      setError(t('invalidFileType'));
      return;
    }

    // Validate file matches selected tab
    if (activeTab === 'pdf' && !isPdf) {
      setError(t('invalidFileType'));
      return;
    }
    if (activeTab === 'csv' && !isCsv) {
      setError(t('invalidFileType'));
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setError(t('fileTooLarge'));
      return;
    }

    setProcessing(true);

    if (isCsv) {
      processCsv(file);
    } else {
      processPdf(file);
    }
  }, [processCsv, processPdf, activeTab]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }, [processFile]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  }, [processFile]);

  const handleTabChange = (tab: FileType) => {
    setActiveTab(tab);
    setError(null);
    setPreview(null);
    setCsvRows([]);
    setPdfData(null);
    setCsvHistoryWarning(false);
  };

  function applyBnrRates(transactions: Transaction[], dailyRates: Record<string, number>, localCurrency: string): Transaction[] {
    const rateDates = Object.keys(dailyRates).sort();

    function findRateOnOrBefore(dateStr: string): number | null {
      let lo = 0, hi = rateDates.length - 1, best: string | null = null;
      while (lo <= hi) {
        const mid = Math.floor((lo + hi) / 2);
        if (rateDates[mid] <= dateStr) { best = rateDates[mid]; lo = mid + 1; }
        else hi = mid - 1;
      }
      return best ? dailyRates[best] : null;
    }

    return transactions.map(tx => {
      if (tx.priceCurrency === localCurrency) {
        return { ...tx, exchangeRateToLocal: 1, totalAmountLocal: tx.totalAmountOriginal, withholdingTaxLocal: tx.withholdingTaxOriginal };
      }
      const dateStr = new Date(tx.transactionDate).toISOString().split('T')[0];
      const bnrRate = findRateOnOrBefore(dateStr);
      if (!bnrRate) return tx;
      return {
        ...tx,
        exchangeRateToLocal: bnrRate,
        totalAmountLocal: Math.round(tx.totalAmountOriginal * bnrRate * 100) / 100,
        withholdingTaxLocal: Math.round(tx.withholdingTaxOriginal * bnrRate * 100) / 100,
      };
    });
  }

  const handleCalculate = useCallback(async () => {
    if (!countryConfig) return;

    if (preview?.fileType === 'pdf' && pdfData) {
      // Convert from account currency to local currency (e.g. USD → RON)
      const needsConversion = preview.currency !== countryConfig.currency;
      const rate = needsConversion ? exchangeRate : 1;

      const { taxResult, securities } = calculateTaxesFromPdf(pdfData, countryConfig, rate);

      setUploadData({
        parseResult: null,
        transactions: [],
        taxResult,
        securities,
        fileName: preview.fileName,
        taxYear: pdfData.year,
      });
    } else if (preview?.fileType === 'csv' && csvRows.length > 0) {
      const parsed = parseTrading212Csv(csvRows);

      // Detect foreign currency and fetch BNR per-date rates
      const currencyCount: Record<string, number> = {};
      for (const tx of parsed.transactions) {
        if (tx.priceCurrency !== countryConfig.currency) {
          currencyCount[tx.priceCurrency] = (currencyCount[tx.priceCurrency] || 0) + 1;
        }
      }
      const foreignCurrency = Object.entries(currencyCount).sort((a, b) => b[1] - a[1])[0]?.[0];

      let enrichedTransactions = parsed.transactions;
      if (foreignCurrency) {
        try {
          setCsvRateLoading(true);
          setCsvRateStatus(null);
          const res = await fetch(`/api/exchange-rates/${selectedYear}/daily?currency=${foreignCurrency}`);
          if (!res.ok) throw new Error('Failed to fetch BNR rates');
          const data = await res.json();
          enrichedTransactions = applyBnrRates(parsed.transactions, data.rates, countryConfig.currency);
          setCsvRateStatus(`BNR ${selectedYear} daily rates (${data.count} dates)`);
        } catch {
          setCsvRateStatus(t('bnrRateFallback'));
        } finally {
          setCsvRateLoading(false);
        }
      }

      const { taxResult, securities } = calculateTaxes(enrichedTransactions, countryConfig, selectedYear);

      setUploadData({
        parseResult: parsed,
        transactions: enrichedTransactions,
        taxResult,
        securities,
        fileName: preview.fileName,
        taxYear: selectedYear,
      });
    } else {
      return;
    }

    navigate('/results');
  }, [countryConfig, preview, pdfData, csvRows, selectedYear, exchangeRate, setUploadData, navigate]);

  const clearUpload = () => {
    setPreview(null);
    setCsvRows([]);
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
                  ? 'border-accent text-accent'
                  : 'border-transparent text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-300'
              }`}
            >
              <FileText className="w-4 h-4" />
              {t('tabPdf')}
              <span className="ml-1 text-xs px-1.5 py-0.5 rounded-full bg-accent/10 text-accent font-medium">
                {t('tabPdfRecommended')}
              </span>
            </button>
            <button
              onClick={() => handleTabChange('csv')}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'csv'
                  ? 'border-accent text-accent'
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

      {/* CSV pre-upload warning */}
      {!preview && activeTab === 'csv' && (
        <div className="mb-4 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700 rounded-lg">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <p className="text-sm text-amber-700 dark:text-amber-400">{t('csvPreWarning')}</p>
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
                  <FileText className="w-12 h-12 text-accent/60 mx-auto mb-4" />
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
                  {activeTab === 'pdf' ? t('pdfHint') : t('csvHint')}
                </p>
                {activeTab === 'csv' && (
                  <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">
                    {t('csvFullHistoryNote')}
                  </p>
                )}
              </>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept={activeTab === 'pdf' ? '.pdf' : '.csv'}
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
                <FileText className="w-8 h-8 text-accent" />
                <div>
                  <p className="font-semibold">{preview.fileName}</p>
                  <p className="text-sm text-gray-500 dark:text-slate-400">
                    {preview.fileType === 'pdf'
                      ? t('annualStatement', { year: preview.year })
                      : t('transactionsParsed', { count: preview.totalRows })
                    }
                  </p>
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

                {/* Stock split warning for CSV */}
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
                <p className="text-xs text-accent mt-2">{t('fetchingRate')}</p>
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
                {t('usingTaxRules', { country: countryConfig.name, rate: `${(countryConfig.capitalGainsTaxRate * 100)}%` })}
                {' · '}
                {t('taxRulesUpdated')}
              </p>
            )}
            {csvRateStatus && preview?.fileType === 'csv' && (
              <p className={`text-xs mt-1 ${
                csvRateStatus.includes('BNR') ? 'text-green-600 dark:text-green-400' : 'text-yellow-600 dark:text-yellow-400'
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
