import { useCallback, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, FileText, AlertTriangle, CheckCircle, X } from 'lucide-react';
import Papa from 'papaparse';
import {
  parseTrading212Csv,
  calculateTaxes,
  parseTrading212AnnualStatement,
  calculateTaxesFromPdf,
} from '@shared/index';
import type { RawCsvRow, PdfParseResult } from '@shared/index';
import { extractPdfPageTexts } from '../utils/pdfExtractor';
import { useCountry } from '../contexts/CountryContext';
import { useUpload } from '../contexts/UploadContext';

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
  const navigate = useNavigate();
  const { countryConfig } = useCountry();
  const { setUploadData } = useUpload();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [dragOver, setDragOver] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear() - 1);

  const [exchangeRate, setExchangeRate] = useState<number>(4.7);

  // Store parsed data for calculate step
  const [csvRows, setCsvRows] = useState<RawCsvRow[]>([]);
  const [pdfData, setPdfData] = useState<PdfParseResult | null>(null);

  const processCsv = useCallback((file: File) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const rows = results.data as RawCsvRow[];
        if (rows.length === 0) {
          setError('CSV file has no data rows.');
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

        setPreview({
          fileName: file.name,
          fileType: 'csv',
          buys,
          sells,
          dividends,
          distributions: 0,
          totalRows: parsed.transactions.length,
          skipped: parsed.skipped.length,
          warnings: parsed.warnings,
          year: years[0] ?? new Date().getFullYear() - 1,
          years,
        });
        setProcessing(false);
      },
      error: (err) => {
        setError(`Failed to parse CSV: ${err.message}`);
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
    } catch (err) {
      setError(`Failed to parse PDF: ${err instanceof Error ? err.message : 'Unknown error'}`);
      setProcessing(false);
    }
  }, []);

  const processFile = useCallback((file: File) => {
    setError(null);
    setPreview(null);
    setCsvRows([]);
    setPdfData(null);

    const name = file.name.toLowerCase();
    const isCsv = name.endsWith('.csv');
    const isPdf = name.endsWith('.pdf');

    if (!isCsv && !isPdf) {
      setError('Please upload a CSV or PDF file.');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setError('File is too large (max 10MB).');
      return;
    }

    setProcessing(true);

    if (isCsv) {
      processCsv(file);
    } else {
      processPdf(file);
    }
  }, [processCsv, processPdf]);

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

  const handleCalculate = useCallback(() => {
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
      const { taxResult, securities } = calculateTaxes(parsed.transactions, countryConfig, selectedYear);

      setUploadData({
        parseResult: parsed,
        transactions: parsed.transactions,
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
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-12">
      <h1 className="text-3xl font-bold mb-2">Upload Broker Statement</h1>
      <p className="text-gray-600 dark:text-slate-400 mb-8">
        Upload your Trading212 annual statement (PDF) or transaction export (CSV).
      </p>

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
                <p className="text-lg font-medium">Processing file...</p>
              </>
            ) : (
              <>
                <Upload className="w-12 h-12 text-gray-400 dark:text-slate-500 mx-auto mb-4" />
                <p className="text-lg font-medium mb-1">Drop your file here</p>
                <p className="text-sm text-gray-500 dark:text-slate-500">or click to browse</p>
                <div className="mt-4 space-y-1">
                  <p className="text-xs text-gray-400 dark:text-slate-600">
                    Supports: Trading212 Annual Statement (.pdf) or CSV export (.csv)
                  </p>
                </div>
              </>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.pdf"
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
                      ? `Annual Statement ${preview.year}`
                      : `${preview.totalRows} transactions parsed`
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
                    <p className="text-sm text-gray-500 dark:text-slate-400">Closed Result (from statement)</p>
                    <p className="text-2xl font-bold">
                      {preview.closedResult.toLocaleString('en-US', { minimumFractionDigits: 2 })} {preview.currency}
                    </p>
                  </div>
                )}
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-3 text-center">
                    <p className="text-2xl font-bold text-red-600 dark:text-red-400">{preview.sells}</p>
                    <p className="text-xs text-red-700 dark:text-red-500">Sell Trades</p>
                  </div>
                  <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 text-center">
                    <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{preview.dividends}</p>
                    <p className="text-xs text-blue-700 dark:text-blue-500">Dividends</p>
                  </div>
                  <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-3 text-center">
                    <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">{preview.distributions}</p>
                    <p className="text-xs text-purple-700 dark:text-purple-500">Distributions</p>
                  </div>
                </div>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-3 text-center">
                    <p className="text-2xl font-bold text-green-600 dark:text-green-400">{preview.buys}</p>
                    <p className="text-xs text-green-700 dark:text-green-500">Buys</p>
                  </div>
                  <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-3 text-center">
                    <p className="text-2xl font-bold text-red-600 dark:text-red-400">{preview.sells}</p>
                    <p className="text-xs text-red-700 dark:text-red-500">Sells</p>
                  </div>
                  <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 text-center">
                    <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{preview.dividends}</p>
                    <p className="text-xs text-blue-700 dark:text-blue-500">Dividends</p>
                  </div>
                </div>
                {(preview.skipped ?? 0) > 0 && (
                  <p className="text-xs text-gray-500 dark:text-slate-500 mt-3">
                    {preview.skipped} rows skipped (deposits, withdrawals, or unknown actions)
                  </p>
                )}
              </>
            )}
          </div>

          {/* Warnings */}
          {preview.warnings.length > 0 && (
            <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-xl">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="w-4 h-4 text-yellow-600" />
                <p className="text-sm font-medium text-yellow-700 dark:text-yellow-400">Warnings</p>
              </div>
              {preview.warnings.map((w, i) => (
                <p key={i} className="text-sm text-yellow-600 dark:text-yellow-500">{w}</p>
              ))}
            </div>
          )}

          {/* Exchange rate (when account currency differs from tax currency) */}
          {preview.fileType === 'pdf' && preview.currency && countryConfig && preview.currency !== countryConfig.currency && (
            <div className="card">
              <label className="block text-sm font-medium mb-1">
                Exchange Rate ({preview.currency} → {countryConfig.currency})
              </label>
              <div className="flex items-center gap-3">
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
                  1 {preview.currency} = {exchangeRate} {countryConfig.currency}
                </div>
              </div>
              <p className="text-xs text-gray-400 dark:text-slate-500 mt-2">
                Use the average BNR exchange rate for {preview.year}. For exact calculations, use the BNR rate on each transaction date.
              </p>
            </div>
          )}

          {/* Year selector and calculate */}
          <div className="card">
            <div className="flex items-center justify-between">
              <div>
                <label className="block text-sm font-medium mb-1">Tax Year</label>
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
                className="btn-primary flex items-center gap-2 text-lg px-6 py-3"
              >
                <CheckCircle className="w-5 h-5" />
                Calculate Taxes
              </button>
            </div>
            {countryConfig && (
              <p className="text-xs text-gray-500 dark:text-slate-500 mt-3">
                Using {countryConfig.name} tax rules ({(countryConfig.capitalGainsTaxRate * 100)}% capital gains rate)
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
