import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Upload, FileText, AlertTriangle, CheckCircle, X, PartyPopper } from 'lucide-react';
import {
  calculateTaxes,
  calculateTaxesFromPdf,
  applyBnrRates,
  getTaxConfigForYear,
  isEngineSupportedTaxYear,
} from '@shared/index';
import type { ParseResult, CurrencyBnrRates, OpeningPosition, PdfParseResult } from '@shared/index';
import { useCountry } from '../contexts/CountryContext';
import { useUpload } from '../contexts/UploadContext';
import { useAuth } from '../contexts/AuthContext';
import { analytics } from '../lib/analytics';
import { reportParseEvent } from '../lib/parseMonitor';
import { CSV_BROKERS, type BrokerId } from '../lib/brokers';
import { readPendingParse, clearPendingParse } from '../lib/pendingParse';
import { useStatementPreview } from '../hooks/useStatementPreview';
import PageMeta from '../components/common/PageMeta';

export default function UploadPage() {
  const { t } = useTranslation('upload');
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { countryConfig } = useCountry();
  const { setUploadData } = useUpload();
  const { user, loading: authLoading } = useAuth();

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
  // Year-round carry-forward note (board #3): set when the engine was seeded with
  // prior-year opening positions, so a changed tax number is never silent. Null
  // when nothing was carried (the byte-identical no-opening-positions path).
  const [carryForwardNote, setCarryForwardNote] = useState<string | null>(null);
  // Carry-forward guard-relax (board #3 PR-3): when the single-year missing-history
  // guard fires, we check whether the user's prior-year opening positions cover
  // every short security's deficit. Fully covered -> the block is relaxed (the
  // carried cost basis is real, not missing). Partially covered / no carry-forward
  // / fetch failure keeps the block (fail safe: never under-declare). The fetched
  // positions are stashed so handleCalculate reuses this single fetch.
  const [carryForwardCoversHistory, setCarryForwardCoversHistory] = useState(false);
  const [openingPositions, setOpeningPositions] = useState<OpeningPosition[] | null>(null);
  // The tax year the coverage effect FETCHED FOR (the requested `selectedYear`),
  // so finalizeCsv can tell whether the stash is reusable for the year it is about
  // to file. Distinct from the response's `data.year` (the PRIOR filing year the
  // positions came from), which the endpoint enforces to be < the requested year
  // and which drives the display note.
  const [openingPositionsRequestedYear, setOpeningPositionsRequestedYear] = useState<number | null>(null);
  const [openingPositionsPriorYear, setOpeningPositionsPriorYear] = useState<number | null>(null);

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

  // Awaitable twin of fetchBnrRate for the post-pay rehydration path (PR-2). It
  // hits the SAME two endpoints and resolves the SAME two values the re-upload
  // path derives (the annual-average rate and the daily map), but returns them so
  // the rehydration can pass them straight into finalizePdf rather than routing
  // through render state. The endpoints, the empty-map guard, and the
  // degrade-to-average-on-daily-failure behavior match fetchBnrRate exactly, so
  // the engine input stays byte-identical to the re-upload path. A local account
  // currency (no conversion) short-circuits to the default rate + null map.
  const fetchPdfBnrRatesForRehydrate = useCallback(async (
    year: number,
    currency: string,
  ): Promise<{ avgRate: number; dailyMap: Record<string, number> | null }> => {
    if (!countryConfig || currency === countryConfig.currency) {
      return { avgRate: DEFAULT_EXCHANGE_RATE_EUR_RON, dailyMap: null };
    }
    const [avgRes, dailyRes] = await Promise.all([
      fetch(`/api/exchange-rates/${year}/average?currency=${currency}`),
      fetch(`/api/exchange-rates/${year}/daily?currency=${currency}`),
    ]);
    if (!avgRes.ok) throw new Error('Failed to fetch rate');
    const avgData = await avgRes.json();
    let dailyMap: Record<string, number> | null = null;
    if (dailyRes.ok) {
      const dailyData = await dailyRes.json();
      if (dailyData?.rates && Object.keys(dailyData.rates).length > 0) {
        dailyMap = dailyData.rates;
      }
    }
    return { avgRate: avgData.rate, dailyMap };
  }, [countryConfig]);

  // Shared parse-to-preview state/handlers (single source of truth, also used by
  // the free pre-paywall checker). The engine call and the results
  // write-and-navigate below stay local to the paid upload flow. The PDF rate
  // fetch is wired in via onPdfParsed so it runs as part of the parse (not from a
  // render effect), preserving the original behavior.
  const {
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
  } = useStatementPreview({
    onPdfParsed: (pdf) => {
      if (pdf.overview.currency) fetchBnrRate(pdf.year, pdf.overview.currency);
    },
  });

  const [showWelcome, setShowWelcome] = useState(() => searchParams.get('welcome') === '1');
  // Capture the post-pay landing intent ONCE at mount. The welcome-toast effect
  // strips ?welcome=1 from the URL, so the rehydration effect below cannot rely on
  // reading it later (it may fire after the strip, once countryConfig loads). The
  // ref freezes the arrival signal so rehydration triggers regardless of ordering.
  const landedFromPaymentRef = useRef(searchParams.get('welcome') === '1');

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

  // Upload-funnel analytics: fire pdf/csv-uploaded once per successful parse.
  // The parse itself lives in the shared hook (which is engine-agnostic), so the
  // upload-specific funnel event fires here, when a fresh preview lands.
  useEffect(() => {
    if (!preview) return;
    if (preview.fileType === 'pdf') analytics.pdfUploaded();
    else analytics.csvUploaded();
  }, [preview]);

  // Carry-forward coverage check (board #3 PR-3). The single-year missing-history
  // guard (useStatementPreview) hard-stops a CSV that sells shares it never bought,
  // because the cost basis would be understated. But carry-forward can now supply
  // those missing historical buys from the user's prior filed year. When the guard
  // fires on a CSV, fetch the prior-year opening positions and check whether they
  // cover EVERY short security's deficit; if so, relax the block. The fetch is
  // stashed so handleCalculate reuses it (one fetch, one result). Best-effort:
  // any failure / partial coverage leaves the block in place (fail safe: never
  // under-declare). This lives in UploadPage, not the shared hook, so the free
  // pre-paywall checker never runs the paid opening-positions fetch.
  useEffect(() => {
    if (!csvHistoryWarning || preview?.fileType !== 'csv' || !csvParse) {
      // Reset when the guard is not active (no CSV, guard cleared, or PDF). The
      // synchronous reset here is the intended "clear derived state" path, not a
      // cascading-render smell; the rule's alternatives (derive during render)
      // don't fit because the coverage result is the product of an async fetch.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCarryForwardCoversHistory(false);
      setOpeningPositions(null);
      setOpeningPositionsRequestedYear(null);
      setOpeningPositionsPriorYear(null);
      return;
    }

    let cancelled = false;
    // The year we are fetching FOR (the requested tax year). Captured up front so
    // both the stash key and the URL use the same value even if selectedYear
    // changes before the async fetch resolves.
    const requestedYear = selectedYear;

    // Per-security deficit: shares sold beyond what was bought in the file. Uses
    // the SAME key convention (isin || ticker) as the engine and the double-count
    // guard, so a carried position is matched to the security it actually covers.
    const sellShares: Record<string, number> = {};
    const buyShares: Record<string, number> = {};
    for (const tx of csvParse.transactions) {
      const key = tx.isin || tx.ticker;
      if (!key) continue;
      if (tx.action === 'sell') sellShares[key] = (sellShares[key] || 0) + tx.shares;
      if (tx.action === 'buy') buyShares[key] = (buyShares[key] || 0) + tx.shares;
    }
    const deficit: Record<string, number> = {};
    for (const key of Object.keys(sellShares)) {
      const short = sellShares[key] - (buyShares[key] || 0);
      if (short > 0.01) deficit[key] = short;
    }

    (async () => {
      let positions: OpeningPosition[] = [];
      let priorYear: number | null = null;
      try {
        const res = await fetch(`/api/uploads/opening-positions?year=${requestedYear}`, {
          credentials: 'include',
        });
        if (res.ok) {
          const data: { year: number | null; positions?: OpeningPosition[] } = await res.json();
          positions = Array.isArray(data.positions) ? data.positions : [];
          priorYear = data.year;
        }
      } catch {
        // Best-effort: on any failure the block stays (positions empty, no coverage).
        positions = [];
        priorYear = null;
      }
      if (cancelled) return;

      // Double-count guard (mirrors finalizeCsv): a carried security whose acquiring
      // BUY is already in the file must not be credited, or the engine would count
      // the shares twice. Only positions surviving this guard can cover a deficit.
      const buyKeys = new Set(
        csvParse.transactions
          .filter((tx) => tx.action === 'buy')
          .map((tx) => tx.isin || tx.ticker),
      );
      const carriedShares: Record<string, number> = {};
      for (const p of positions) {
        const key = p.isin || p.ticker;
        if (!key || buyKeys.has(key)) continue;
        carriedShares[key] = (carriedShares[key] || 0) + p.shares;
      }

      // Covered only when EVERY short security's deficit is met by carried shares.
      const shortKeys = Object.keys(deficit);
      const covered =
        shortKeys.length > 0 &&
        shortKeys.every((k) => (carriedShares[k] || 0) >= deficit[k] - 0.01);

      setOpeningPositions(positions);
      setOpeningPositionsRequestedYear(requestedYear);
      setOpeningPositionsPriorYear(priorYear);
      setCarryForwardCoversHistory(covered);
    })();

    return () => {
      cancelled = true;
    };
  }, [csvHistoryWarning, selectedYear, csvParse, preview?.fileType]);

  // Enrich CSV transactions with BNR rates and run the engine, then stash the
  // result for the results page. Shared by the Trading212 and IBKR CSV paths,
  // which both produce a ParseResult of Transactions; the `broker` is recorded so
  // the results page can show the beta verify-before-filing caveat where needed.
  // `yearOverride` lets the post-pay rehydration (PR-2) run the engine on the year
  // the buyer selected in the checker, instead of the hook's `selectedYear` state
  // (which a same-tick setSelectedYear would not have flushed yet). The re-upload
  // path passes nothing and keeps using `selectedYear`, byte-identical to before.
  const finalizeCsv = useCallback(async (
    parsed: ParseResult,
    broker: BrokerId,
    fileName: string,
    yearOverride?: number,
  ) => {
    if (!countryConfig) return;
    const year = yearOverride ?? selectedYear;

    setCarryForwardNote(null);

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
                fetch(`/api/exchange-rates/${year}/daily?currency=${currency}`),
                fetch(`/api/exchange-rates/${year}/average?currency=${currency}`),
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
              ? `BNR ${year} daily rates (${totalDates} dates)`
              : `BNR ${year} daily rates (${okCurrencies.length} currencies, ${totalDates} dates)`,
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

    // Year-round carry-forward (board #3): seed cost-basis lots from the user's
    // most-recent prior filed year, so a sell of a position opened before this
    // year (whose buys are absent from a year-scoped export) gets its real cost
    // basis instead of 0. Best-effort: a failed/empty fetch leaves the calc
    // byte-identical to the no-opening-positions path, so it must never block.
    //
    // PR-3: the coverage-check effect above may already have fetched the
    // positions for this year (when the missing-history guard fired). Reuse that
    // single result to avoid a second identical request. The reuse key is the
    // REQUESTED tax year (`openingPositionsRequestedYear`), i.e. the year we
    // fetched FOR, not the response's `data.year` (the prior filing year the
    // positions came from, always < the requested year). Fall back to a fresh
    // fetch when the effect never ran (the common no-guard path) or fetched a
    // different year. Either way the double-count guard runs here on the final
    // enriched transactions, so the seeded set is identical to the pre-PR-3 path.
    let positions: OpeningPosition[] = [];
    let priorYear: number | null = null;
    if (openingPositions !== null && openingPositionsRequestedYear === year) {
      positions = openingPositions;
      priorYear = openingPositionsPriorYear;
    } else {
      try {
        const res = await fetch(`/api/uploads/opening-positions?year=${year}`, {
          credentials: 'include',
        });
        if (res.ok) {
          const data: { year: number | null; positions?: OpeningPosition[] } = await res.json();
          positions = Array.isArray(data.positions) ? data.positions : [];
          priorYear = data.year;
        }
      } catch {
        // Carry-forward is best-effort; on any failure fall back to no seeding.
        positions = [];
        priorYear = null;
      }
    }

    let filteredOpeningPositions: OpeningPosition[] = [];
    let carryForwardYear: number | null = null;
    if (positions.length > 0) {
      // Double-count guard: never seed a security whose acquiring BUY is in
      // this file (the engine would then count the shares twice). The buy
      // predicate matches the engine exactly (`t.action === 'buy'`). A carried
      // security that is only SOLD in the file (not bought) is the case we DO
      // seed, so it keeps its real prior-year cost basis.
      const buyKeys = new Set(
        enrichedTransactions
          .filter((tx) => tx.action === 'buy')
          .map((tx) => tx.isin || tx.ticker),
      );
      filteredOpeningPositions = positions.filter((p) => {
        const key = p.isin || p.ticker;
        return !!key && !buyKeys.has(key);
      });
      if (filteredOpeningPositions.length > 0) carryForwardYear = priorYear;
    }

    // Dispatch tax rates by the selected income year (backlog #13).
    const yearConfig = getTaxConfigForYear(countryConfig, year);
    const { taxResult, securities } = calculateTaxes(
      enrichedTransactions,
      yearConfig,
      year,
      undefined,
      filteredOpeningPositions,
    );

    // Trust: never change a user's tax number silently. Surface a short note when
    // positions were actually carried (and survived the double-count guard).
    if (filteredOpeningPositions.length > 0 && carryForwardYear != null) {
      setCarryForwardNote(
        t('carryForwardNote', { count: filteredOpeningPositions.length, year: carryForwardYear }),
      );
    }

    setUploadData({
      parseResult: parsed,
      parseWarnings: parsed.warnings,
      transactions: enrichedTransactions,
      taxResult,
      securities,
      // CSV flow: the per-trade audit is built from `transactions`; clear any PDF
      // audit rows left from a prior upload in the same session.
      auditRows: [],
      pdfNetFromOverview: false,
      fileName,
      taxYear: year,
      broker,
      // Surface the carried positions on Results (board #3 PR-3): which prior-year
      // positions seeded cost basis, and from which filing year.
      carriedPositions: filteredOpeningPositions,
      carryForwardYear: filteredOpeningPositions.length > 0 ? carryForwardYear : null,
    });
  }, [countryConfig, selectedYear, setUploadData, t, openingPositions, openingPositionsRequestedYear, openingPositionsPriorYear]);

  // Run the PDF engine path and stash the result. Shared by the re-upload
  // "Calculate" click and the post-pay rehydration (PR-2), so the engine call is
  // literally the same code in both cases: same `pdfData`, same resolved `rate`
  // and per-date `dailyRates`, same `calculateTaxesFromPdf`. The rehydrated path
  // must produce a byte-identical input, hence a single implementation.
  const finalizePdf = useCallback((
    pdf: PdfParseResult,
    fileName: string,
    rate: number,
    dailyRates: Record<string, number> | undefined,
  ) => {
    if (!countryConfig) return;

    // Dispatch tax rates by the statement's income year (backlog #13). 2025 ->
    // current rates; 2026+ falls back to the latest engine-supported year until
    // its rates are signed off (TAX_YEARS[year].engineSupported gate).
    const yearConfig = getTaxConfigForYear(countryConfig, pdf.year);
    const { taxResult, securities, warnings: engineWarnings, auditRows, netFromOverview } = calculateTaxesFromPdf(pdf, yearConfig, rate, dailyRates);

    // Engine-emitted warnings (sign + magnitude mismatch) reach the operator
    // through the same channel as parser warnings, but tagged separately so
    // the parse-report log + DB queries can distinguish parser drift from engine drift.
    if (engineWarnings.length > 0) {
      reportParseEvent({
        fileType: 'pdf',
        outcome: 'warning',
        fileName,
        warnings: [],
        engineWarnings,
        summary: {
          sells: pdf.sellTrades.length,
          dividends: pdf.dividends.length,
          distributions: pdf.distributions.length,
          year: pdf.year,
        },
      });
    }

    setUploadData({
      parseResult: null,
      parseWarnings: [...pdf.warnings, ...engineWarnings],
      transactions: [],
      taxResult,
      securities,
      auditRows,
      pdfNetFromOverview: netFromOverview,
      fileName,
      taxYear: pdf.year,
      broker: 'trading212',
      // PDF flow never carries prior-year positions; clear any left in context
      // from a CSV carry-forward earlier in the same session.
      carriedPositions: [],
      carryForwardYear: null,
    });
  }, [countryConfig, setUploadData]);

  // Resolve the account-currency conversion rate + the per-date BNR map for a PDF
  // exactly as the re-upload path does: the annual-average rate governs the
  // overview/dividend fallback, and the daily map drives per-trade-date capital
  // gains ONLY when every sell shares the overview currency (backlog #21, art. 96).
  // Extracted so the rehydration path derives the same `dailyRates` gate.
  const resolvePdfRates = useCallback((
    pdf: PdfParseResult,
    avgRate: number,
    dailyMap: Record<string, number> | null,
  ): { rate: number; dailyRates: Record<string, number> | undefined } => {
    if (!countryConfig) return { rate: 1, dailyRates: undefined };
    const needsConversion = pdf.overview.currency !== countryConfig.currency;
    const rate = needsConversion ? avgRate : 1;
    const allTradesMatchOverview =
      pdf.sellTrades.length > 0 &&
      pdf.sellTrades.every((tr) => tr.transactionCurrency === pdf.overview.currency);
    const dailyRates =
      needsConversion && allTradesMatchOverview ? dailyMap ?? undefined : undefined;
    return { rate, dailyRates };
  }, [countryConfig]);

  const handleCalculate = useCallback(async () => {
    if (!countryConfig) return;

    // Defense-in-depth for the year guard (the disabled Calculate button is the
    // primary gate): never run the engine on a year we don't support, so a future
    // refactor that triggers this elsewhere can't produce a wrong-year number.
    const yearForCalc = preview?.fileType === 'pdf' ? preview.year : selectedYear;
    if (preview && !isEngineSupportedTaxYear(yearForCalc)) return;

    if (preview?.fileType === 'pdf' && pdfData) {
      // Defense-in-depth for the rate guard (the disabled Calculate button is the
      // primary gate): never run the engine with a non-positive conversion rate, which
      // would zero out every RON figure. Only relevant when conversion is needed.
      const needsConversion = pdfData.overview.currency !== countryConfig.currency;
      if (needsConversion && !(exchangeRate > 0)) return;
      const { rate, dailyRates } = resolvePdfRates(pdfData, exchangeRate, pdfDailyRates);
      finalizePdf(pdfData, preview.fileName, rate, dailyRates);
    } else if (preview?.fileType === 'csv') {
      if (!csvParse || csvParse.transactions.length === 0) return;
      await finalizeCsv(csvParse, csvBroker, preview.fileName);
    } else {
      return;
    }

    navigate('/results');
  }, [countryConfig, preview, pdfData, csvParse, csvBroker, exchangeRate, pdfDailyRates, selectedYear, navigate, finalizeCsv, finalizePdf, resolvePdfRates]);

  // Post-pay rehydration (backlog #24B Phase 2, PR-2). On /upload?welcome=1, if the
  // buyer parsed their statement pre-pay (PreviewPage stashed it in sessionStorage),
  // rehydrate it and run the EXISTING engine path directly, then land on /results,
  // skipping the drop-zone and the re-upload. The engine call is the same
  // finalizePdf / finalizeCsv the "Calculate" button uses, so the number is
  // identical to the re-upload path (the 28,053 founder case is proven by E2E).
  //
  // Belt and suspenders: a missing / stale / version-mismatch / oversized-skipped
  // pending parse makes readPendingParse return null, so we do nothing and the
  // normal drop-zone flow renders unchanged. An unsupported year is refused the
  // same way the Calculate guard refuses it (no wrong-year number). The key is
  // cleared only after a SUCCESSFUL engine run so a refresh does not re-run it.
  //
  // Concurrency (qa PR #234): `user` (from /api/auth/me), `authLoading`, and
  // `countryConfig` (geo-detection) settle on independent async timelines, so at
  // least one dep typically settles AFTER the first qualifying run. This effect
  // must NOT carry an effect-cleanup that cancels the in-flight run when that
  // happens: doing so aborted the rehydrate before navigate('/results') while the
  // re-run hit the once-latch and bailed. Instead we latch exactly-once only after
  // we have a valid parse to consume, and drive the committed async run to
  // completion irrespective of later benign dep settles. The gates above already
  // guarantee we only commit when paid + ready, and the callbacks captured here
  // are the paid-and-ready versions (countryConfig is truthy), so the closure is
  // the correct one to run with.
  const rehydratedRef = useRef(false);
  useEffect(() => {
    if (rehydratedRef.current) return;
    if (authLoading || !user || user.plan !== 'paid') return;
    if (!countryConfig) return;
    if (!landedFromPaymentRef.current) return;

    const pending = readPendingParse();
    // No valid parse: leave the latch UNSET so a legitimate parse arriving on a
    // later ready render is still honored, and render the normal re-upload flow.
    if (!pending) return;

    // Commit: this run owns the rehydrate and will drive it to completion. Latch
    // now so no dep-settle re-run can double-fire the engine.
    rehydratedRef.current = true;

    void (async () => {
      try {
        if (pending.fileType === 'pdf') {
          const pdf = pending.pdf;
          // Same year guard as Calculate: never run the engine on an unsupported
          // year. Fall through to re-upload (the latch stays set: a wrong-year
          // stored parse should not silently re-run).
          if (!isEngineSupportedTaxYear(pdf.year)) return;
          const { avgRate, dailyMap } = await fetchPdfBnrRatesForRehydrate(
            pdf.year,
            pdf.overview.currency,
          );
          const { rate, dailyRates } = resolvePdfRates(pdf, avgRate, dailyMap);
          finalizePdf(pdf, pending.fileName, rate, dailyRates);
        } else {
          if (!isEngineSupportedTaxYear(pending.selectedYear)) return;
          if (pending.csv.transactions.length === 0) return;
          // Pass the persisted year explicitly so the engine + BNR fetch use the
          // buyer's checker selection, not the hook's default `selectedYear` (a
          // same-tick setSelectedYear would not have flushed). Also sync the UI
          // state for the (brief) render before /results.
          setSelectedYear(pending.selectedYear);
          await finalizeCsv(pending.csv, pending.broker, pending.fileName, pending.selectedYear);
        }
        // Success: this parse has been consumed. Clear so a refresh cannot re-run it.
        clearPendingParse();
        navigate('/results');
      } catch {
        // Any failure (rate fetch, engine) degrades to the normal re-upload flow;
        // the buyer still has their file and can re-drop it. Leave the key so a
        // transient failure can be retried on a manual refresh.
      }
    })();
    // Keyed on the paid+ready gate; the ref makes it fire at most once per mount,
    // and the committed run drives itself to completion (no cancel-on-settle).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user, countryConfig]);

  const clearUpload = () => {
    clearPreview();
    setCsvRateStatus(null);
    setCsvRateStatusKind(null);
    setCarryForwardNote(null);
    setCarryForwardCoversHistory(false);
    setOpeningPositions(null);
    setOpeningPositionsRequestedYear(null);
    setOpeningPositionsPriorYear(null);
  };

  // Don't render while checking auth: prevents flash
  if (authLoading || !user || user.plan !== 'paid') {
    return null;
  }

  // Year-support guard: the engine computes only the years flagged engineSupported
  // (2023-2025 today). A statement whose year is older (the notificare audience can
  // reach back to 2019) or otherwise unsupported would silently fall back to the
  // latest year's rates via getTaxConfigForYear, so block the calculate action and
  // explain instead of producing a wrong-year number. CSV uses the selected year;
  // PDF uses the year detected in the statement.
  const calcYear = preview ? (preview.fileType === 'pdf' ? preview.year : selectedYear) : null;
  const calcYearSupported = calcYear == null || isEngineSupportedTaxYear(calcYear);

  // Missing-history block, relaxed by carry-forward (board #3 PR-3). The guard
  // still fires whenever a single-year CSV sells shares it never bought, but when
  // the user's prior-year opening positions fully cover every short security's
  // deficit, the carried cost basis is real (not missing), so we drop the block
  // and show a positive note instead. Partial / no coverage keeps the hard-stop.
  const historyBlocks = csvHistoryWarning && !carryForwardCoversHistory;

  // PDF exchange-rate guard. When the account currency differs from the tax currency
  // the engine needs a positive conversion rate; clearing the rate input sets it to 0
  // (parseFloat('') || 0), which would run the engine with rate 0 and yield an
  // all-zero RON result. Block Calculate until a real rate is entered.
  const pdfNeedsRate =
    preview?.fileType === 'pdf' && !!countryConfig && !!preview.currency &&
    preview.currency !== countryConfig.currency;
  const pdfRateInvalid = pdfNeedsRate && !(exchangeRate > 0);

  return (
    <div className="max-w-2xl mx-auto px-4 py-12">
      <PageMeta titleKey="uploadTitle" descriptionKey="uploadDesc" robots="noindex, follow" />
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

          {/* Critical: CSV missing historical buys (kept when carry-forward does not cover it) */}
          {historyBlocks && preview?.fileType === 'csv' && (
            <div className="p-5 bg-red-50 dark:bg-red-900/20 border-2 border-red-400 dark:border-red-600 rounded-xl">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-6 h-6 text-red-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-red-700 dark:text-red-400 font-bold text-base mb-2">{t('csvHistoryBlockTitle')}</p>
                  <p className="text-sm text-red-600 dark:text-red-400 mb-3">{t('csvMissingHistoryWarning')}</p>
                  <p className="text-sm text-red-600 dark:text-red-400 font-medium">
                    {csvBroker === 'ibkr'
                      ? t('csvHistoryBlockActionIbkr')
                      : csvBroker === 'revolut'
                        ? t('csvHistoryBlockActionRevolut')
                        : t('csvHistoryBlockAction')}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Carry-forward covers the missing history: the block is relaxed and the
              carried cost basis is announced (no rate/tax-fact claim). */}
          {csvHistoryWarning && carryForwardCoversHistory && preview?.fileType === 'csv' && (
            <div
              className="p-4 bg-accent/5 dark:bg-accent/10 border border-accent/30 rounded-xl"
              data-testid="carry-forward-covers-note"
            >
              <div className="flex items-start gap-3">
                <CheckCircle className="w-5 h-5 text-accent dark:text-accent-light shrink-0 mt-0.5" />
                <p className="text-sm text-gray-700 dark:text-slate-300">
                  {t('carryForwardCoversHistoryNote', {
                    year: selectedYear,
                    priorYear: openingPositionsPriorYear ?? selectedYear - 1,
                  })}
                </p>
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
                disabled={csvRateLoading || historyBlocks || !calcYearSupported || pdfRateInvalid}
                className={`flex items-center justify-center gap-2 text-lg px-6 py-3 w-full sm:w-auto ${historyBlocks || !calcYearSupported || pdfRateInvalid ? 'btn-secondary opacity-50 cursor-not-allowed' : 'btn-primary'}`}
              >
                {csvRateLoading ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <CheckCircle className="w-5 h-5" />
                )}
                {csvRateLoading ? t('fetchingBnrRates') : t('calculateTaxes')}
              </button>
            </div>
            {!calcYearSupported && calcYear != null && (
              <p className="text-sm text-red-600 dark:text-red-400 mt-3" data-testid="year-unsupported-note">
                {t('yearUnsupportedNote', { year: calcYear })}
              </p>
            )}
            {pdfRateInvalid && (
              <p className="text-sm text-red-600 dark:text-red-400 mt-3" data-testid="rate-required-note">
                {t('rateRequiredNote')}
              </p>
            )}
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
            {carryForwardNote && preview?.fileType === 'csv' && (
              <p className="text-xs mt-1 text-accent dark:text-accent-light" data-testid="carry-forward-note">
                {carryForwardNote}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
