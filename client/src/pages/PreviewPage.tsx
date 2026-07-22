import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Upload,
  FileText,
  AlertTriangle,
  CheckCircle,
  X,
  Lock,
  MessageCircle,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import { isEngineSupportedTaxYear } from '@shared/taxRules/taxYears';
import { useStatementPreview } from '../hooks/useStatementPreview';
import { useAuth } from '../contexts/AuthContext';
import { evaluateParseEligibility } from '../lib/parseEligibility';
import {
  resolveBlockedCapture,
  shouldAskStatementOrigin,
  STATEMENT_ORIGINS,
  type StatementOrigin,
} from '../lib/blockedCapture';
import { writePendingParse, markParseVerified } from '../lib/pendingParse';
import { analytics } from '../lib/analytics';
import { CSV_BROKERS, BROKERS, type BrokerId } from '../lib/brokers';
import { localizeParserWarnings } from '../lib/parserWarningText';
import EmailCapture from '../components/common/EmailCapture';
import PageMeta from '../components/common/PageMeta';

/**
 * Free pre-paywall parse checker (backlog #24B, Phase 1). A standalone PUBLIC
 * route (no paywall, no auth) where anyone can drop a statement and see whether
 * we can READ it before paying. The 3rd paying customer paid in 47 seconds and
 * hit a dead-end because the paywall sits in front of the parse; this surface
 * lets that user learn the answer first.
 *
 * MOAT BOUNDARY (load-bearing, spec Section 2 + DO-NOT Section 4): this page
 * shows PARSER output only (file counts, parser warnings, the missing-history
 * hard-stop, and a broker/year support verdict). It renders ZERO engine output.
 * It must NEVER import or call calculateTaxes / calculateTaxesFromPdf, and no
 * capital-gains / tax / CASS / total / D212 figure may appear. The tax numbers
 * are the moat and stay paid. The parse here comes from the shared
 * useStatementPreview hook, which is itself engine-agnostic by construction.
 */

type Verdict = 'green' | 'amber' | 'red';

/** Resolve the overall support verdict from the parse state. Red wins (a
 *  missing-history hard-stop means we cannot produce a correct number even after
 *  pay); then amber for parser warnings or an unsupported broker/year; green when
 *  the file is clean and we support the broker and the detected year. */
function resolveVerdict(opts: {
  historyBlocked: boolean;
  hasWarnings: boolean;
  yearSupported: boolean;
}): Verdict {
  if (opts.historyBlocked) return 'red';
  if (opts.hasWarnings || !opts.yearSupported) return 'amber';
  return 'green';
}

export default function PreviewPage() {
  const { t } = useTranslation('upload');
  const navigate = useNavigate();
  const { user } = useAuth();

  const {
    fileInputRef,
    activeTab,
    csvBroker,
    dragOver,
    processing,
    error,
    errorKind,
    preview,
    selectedYear,
    csvParse,
    pdfData,
    csvHistoryWarning,
    setDragOver,
    handleTabChange,
    handleCsvBrokerChange,
    handleDrop,
    handleFileInput,
    clearPreview,
  } = useStatementPreview();

  // Fire preview_started once when processing kicks off (a check has begun). The
  // ref guards against the effect re-firing on unrelated re-renders within the
  // same processing run.
  const startedRef = useRef(false);
  useEffect(() => {
    if (processing && !startedRef.current) {
      startedRef.current = true;
      analytics.previewStarted();
    }
    if (!processing) startedRef.current = false;
  }, [processing]);

  // The broker this ATTEMPT belongs to: the PDF tab is Trading212-only, the CSV
  // tab carries the selected broker. When no preview landed (an unreadable file),
  // the active tab still tells us which path the visitor tried.
  const previewBroker: BrokerId =
    (preview ? preview.fileType : activeTab) === 'pdf' ? 'trading212' : csvBroker;
  const brokerMeta = BROKERS[previewBroker];

  // Optional self-identified statement origin on the blocked state (PR-4). Feeds
  // the lead-capture list choice (a crypto origin joins the crypto-interest list).
  // Reset in the upload/clear handlers below, so a pick made for one file never
  // leaks into the next file's capture.
  const [statementOrigin, setStatementOrigin] = useState<StatementOrigin | null>(null);

  const onDrop = (e: React.DragEvent) => {
    setStatementOrigin(null);
    handleDrop(e);
  };
  const onFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    setStatementOrigin(null);
    handleFileInput(e);
  };
  const onClearPreview = () => {
    setStatementOrigin(null);
    clearPreview();
  };

  // Year support comes from the engine-supported flag (the single source of
  // truth, backlog #13). We do NOT hardcode "2025": a missing config or a year
  // whose engine support has not been signed off is treated as unsupported. The
  // prior-year flip made 2023/2024 supported, so they now resolve green here.
  const yearSupported = preview ? isEngineSupportedTaxYear(preview.year) : false;
  const historyBlocked = csvHistoryWarning && preview?.fileType === 'csv';
  const hasWarnings = (preview?.warnings.length ?? 0) > 0;
  // The uploaded PDF is not a Trading212 statement (e.g. an Interactive Brokers
  // PDF). Show a dedicated localized redirect to the CSV export instead of the
  // raw English "no sell trades / defaulted year" parser warning.
  const pdfBrokerMismatch = preview?.fileType === 'pdf' && preview.brokerMismatch;

  // The pre-pay gate decision is the single source of truth for whether the
  // unlock CTA shows (backlog #24B Phase 2). It BLOCKS on a hard error, a fatal
  // warning (unsupported year, missing-history, PDF broker-mismatch, empty
  // result) and OPENS on a supported broker + year even when benign warnings
  // (skipped rows, splits, duplicates, mixed-currency notes) are present. This
  // is the deliberate refinement over the old verdict === 'green' gate, which
  // wrongly routed benign warnings to lead-capture.
  const eligibility = evaluateParseEligibility({ preview, error, csvHistoryWarning });
  const canUnlock = eligibility.eligible;

  // The verdict card's colour still reflects parse health at a glance: green when
  // the gate is open, red for the missing-history hard-stop, amber for the other
  // blocked cases and for benign warnings. It is presentational only; the gate
  // above owns the unlock decision.
  const verdict: Verdict = preview
    ? canUnlock
      ? 'green'
      : resolveVerdict({ historyBlocked: !!historyBlocked, hasWarnings, yearSupported })
    : 'green';

  // Fire the gate outcome once per landed parse OUTCOME: a preview (parsed) or
  // an error (unreadable). gate_blocked carries the block reason (as a
  // reason-suffixed event name; see analytics.ts). Keying on error too is what
  // makes `gate_blocked_unreadable` actually record: an unreadable file never
  // produces a preview, so the old preview-only keying skipped it.
  // A pre-parse validation rejection (wrong extension / over the size cap, e.g.
  // a Binance .xlsx) records as `rejected_file` instead of `unreadable`, so the
  // unreadable histogram counts real parse crashes only. The blocked STATE is
  // identical either way (same capture path); only the event name splits.
  // We keep the legacy previewClean/previewBlocked events so existing funnel
  // dashboards do not lose coverage while the gate metrics ramp.
  useEffect(() => {
    if (!preview && !error) return;
    if (eligibility.eligible) {
      analytics.gateEligible();
      analytics.previewClean();
    } else {
      analytics.gateBlocked(
        eligibility.blockReason === 'unreadable' && errorKind === 'validation'
          ? 'rejected_file'
          : eligibility.blockReason,
      );
      analytics.previewBlocked();
    }
    // eligibility/errorKind are derived from (or set alongside) preview/error;
    // keying on the preview/error pair fires once per landed outcome (the hook
    // nulls both before each new attempt, so a re-upload re-fires exactly once).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preview, error]);

  // Bring the CTA section into view once a parse outcome lands (S9): with the
  // cookie banner up, the verdict used to render with its pay/contact CTA
  // beneath the fixed overlay. The html scroll-padding-bottom rule (the
  // banner's published height) keeps the scroll target clear of the overlay,
  // and block:'nearest' makes this a no-op when the CTA is already fully
  // visible. Default (instant) behavior on purpose: smooth scrolls are
  // animation-frame driven and get silently dropped in headless/automation
  // browsers, which is exactly where the E2E contract for this runs.
  const ctaSectionRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!preview && !error) return;
    ctaSectionRef.current?.scrollIntoView({ block: 'nearest' });
  }, [preview, error]);

  // Which waitlist a blocked visitor can join (PR-4: every block reason except
  // the user-actionable missing-history one gets a capture path). The mapping
  // lives in lib/blockedCapture.ts: beta brokers keep their graduation list,
  // unsupported years go to a year list, unreadable/mismatched/empty statements
  // go to the statement-support list (or the crypto-interest list when the
  // visitor self-identifies a crypto origin below).
  const blocked = !canUnlock && (preview !== null || error !== null);
  const blockedCapture = blocked
    ? resolveBlockedCapture({
        reason: eligibility.blockReason ?? 'unreadable',
        broker: brokerMeta,
        year: preview?.year ?? null,
        origin: statementOrigin,
      })
    : null;
  const showOriginAsk =
    blocked && shouldAskStatementOrigin(eligibility.blockReason ?? 'unreadable', brokerMeta);

  // The green unlock path (backlog #24B Phase 2, PR-2 + PR-3). First stash the
  // PARSED result in sessionStorage so /upload?welcome=1 can rehydrate it and run the
  // engine once, skipping the re-upload. This holds parser output only (never the raw
  // File, never any engine figure); the moat stays paid. A failed write (oversized /
  // no storage) is a no-op here: the buyer still proceeds and re-uploads post-pay.
  //
  // PR-3 wires the carry-through to purchase, branching on auth state so the parse
  // survives the trip and the buyer never dead-ends:
  //  - paid user: they already own access, so go straight to /upload?welcome=1 and let
  //    the PR-2 rehydration run the engine on the parse we just stashed (no charge).
  //  - logged-in free user: to /pricing, where the Buy click proceeds (the gate token
  //    is now set) into checkout.
  //  - anonymous: to signup with redirect=/pricing, so after creating an account they
  //    land back on pricing and complete the purchase. The stashed parse persists
  //    across the same-tab auth + Stripe round-trip (sessionStorage).
  const goToUnlock = () => {
    if (canUnlock && preview) {
      let stashed = false;
      if (preview.fileType === 'pdf' && pdfData) {
        stashed = writePendingParse({ fileType: 'pdf', fileName: preview.fileName, pdf: pdfData });
      } else if (preview.fileType === 'csv' && csvParse) {
        stashed = writePendingParse({
          fileType: 'csv',
          fileName: preview.fileName,
          broker: csvBroker,
          selectedYear,
          csv: csvParse,
        });
      }
      // If the full stash was skipped (oversized parse / storage throw) the buyer must
      // still be able to buy: record a tiny gate marker so the pricing parse-gate stays
      // open. Otherwise an oversized parse writes nothing, /pricing bounces the buyer
      // back to the checker, the re-parse fails the same write, and checkout is never
      // reachable. The full stash (when it succeeds) already opens the gate on its own.
      if (!stashed) markParseVerified();
    }
    if (user?.plan === 'paid') {
      navigate('/upload?welcome=1');
    } else if (user) {
      navigate('/pricing');
    } else {
      navigate('/signup?redirect=/pricing');
    }
  };

  const goToContact = () => {
    // Pre-fill the contact form exactly like the #24A results banner does, so an
    // unsupported broker/year turns into a captured lead rather than a dead-end.
    navigate('/contact', {
      state: {
        topic: 'support',
        subject: 'parseWarning',
        fileName: preview?.fileName,
        warnings: [
          ...(preview?.warnings ?? []),
          ...(error ? [error] : []),
          ...(historyBlocked ? [t('csvMissingHistoryWarning')] : []),
          ...(preview && !yearSupported
            ? [t('previewContactYearLine', { year: preview.year })]
            : []),
          ...(brokerMeta.status === 'beta' ? [t('previewContactBrokerLine', { broker: brokerMeta.label })] : []),
        ],
      },
    });
  };

  // Shared blocked-state CTA block (contact + optional origin select + the
  // waitlist capture). Rendered both under a landed-but-blocked preview and
  // under a bare parse error (the unreadable case, which has no preview card).
  const originLabel = (origin: StatementOrigin): string => {
    switch (origin) {
      case 'binance':
        return 'Binance';
      case 'coinbase':
        return 'Coinbase';
      case 'kraken':
        return 'Kraken';
      case 'crypto_other':
        return t('previewOriginCryptoOther');
      case 'etoro':
        return 'eToro';
      case 'broker_other':
        return t('previewOriginBrokerOther');
    }
  };

  const blockedCtaSection = (
    <div className="space-y-4" ref={ctaSectionRef}>
      <div className="card">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="font-semibold text-lg">{t('previewBlockedTitle')}</h2>
            <p className="text-sm text-gray-600 dark:text-slate-400">{t('previewBlockedBody')}</p>
          </div>
          <button
            onClick={goToContact}
            className="btn-primary flex items-center justify-center gap-2 whitespace-nowrap self-start sm:self-auto"
            data-testid="preview-contact-cta"
          >
            <MessageCircle className="w-5 h-5" />
            {t('previewBlockedCta')}
          </button>
        </div>

        {/* Optional origin self-identification: only for statement-level blocks
            where we cannot tell which broker/exchange the file came from. A
            crypto pick routes the capture below to the crypto-interest list
            (board #6 demand instrumentation, not crypto support). */}
        {showOriginAsk && (
          <div className="mt-4 pt-4 border-t border-gray-200 dark:border-navy-600">
            <label htmlFor="statement-origin" className="block text-sm font-medium mb-2">
              {t('previewOriginLabel')}
            </label>
            <select
              id="statement-origin"
              className="input"
              value={statementOrigin ?? ''}
              onChange={(e) =>
                setStatementOrigin(e.target.value === '' ? null : (e.target.value as StatementOrigin))
              }
              data-testid="preview-origin-select"
            >
              <option value="">{t('previewOriginNone')}</option>
              {STATEMENT_ORIGINS.map((o) => (
                <option key={o} value={o}>
                  {originLabel(o)}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Every capturable block reason gets a waitlist (PR-4); missing-history
          deliberately gets none (the fix is re-exporting with full history). */}
      {blockedCapture && (
        <EmailCapture
          topic={blockedCapture.topic}
          source={blockedCapture.source}
          variant="broker"
          heading={t('previewWaitlistHeading')}
          description={t('previewWaitlistBody')}
          headingLevel={2}
        />
      )}
    </div>
  );

  return (
    <div className="max-w-2xl mx-auto px-4 py-12">
      <PageMeta titleKey="previewTitle" descriptionKey="previewDesc" robots="noindex, follow" />

      <h1 className="text-3xl font-bold mb-2">{t('previewHeading')}</h1>
      <p className="text-gray-600 dark:text-slate-400 mb-8">{t('previewSubtitle')}</p>

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
            role="button"
            tabIndex={0}
            aria-label={t('uploadZoneAria')}
            className={`border-2 border-dashed rounded-xl p-12 text-center transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 dark:focus-visible:ring-offset-navy-800 ${
              dragOver
                ? 'border-accent bg-accent/5'
                : 'border-gray-300 dark:border-navy-500 hover:border-accent dark:hover:border-accent'
            }`}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                fileInputRef.current?.click();
              }
            }}
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
            onChange={onFileInput}
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

      {/* Unreadable file (a parse error produces no preview card): still offer
          the contact + lead-capture path, so the visitor whose file we could
          not read becomes a demand signal instead of a bounce (PR-4; this is
          where a Binance/crypto statement typically lands). */}
      {error && !preview && <div className="mt-4">{blockedCtaSection}</div>}

      {/* Preview (parse health only, never engine output) */}
      {preview && (
        <div className="space-y-4" data-testid="preview-result">
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
                      : t('transactionsParsed', { count: preview.totalRows })}
                  </p>
                  {preview.fileType === 'csv' && (preview.sourceFileCount ?? 1) > 1 && (
                    <p className="text-xs text-gray-500 dark:text-slate-400">
                      {t('csvFilesMerged', { count: preview.sourceFileCount })}
                    </p>
                  )}
                </div>
              </div>
              <button
                onClick={onClearPreview}
                className="p-2 hover:bg-gray-100 dark:hover:bg-navy-700 rounded-lg transition-colors"
                aria-label={t('previewClear')}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Counts (parser output). Deliberately NO closed-result / engine value. */}
            {preview.fileType === 'pdf' ? (
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
              </>
            )}
          </div>

          {/* Broker mismatch: the PDF is not a Trading212 statement (e.g. IBKR).
              Lead with a clear localized redirect to the CSV export instead of
              the raw English parser warning. */}
          {pdfBrokerMismatch && (
            <div className="p-5 bg-amber-50 dark:bg-amber-900/20 border-2 border-amber-400 dark:border-amber-600 rounded-xl" data-testid="pdf-broker-mismatch">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-6 h-6 text-amber-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-amber-800 dark:text-amber-300 font-bold text-base mb-2">{t('pdfBrokerMismatchTitle')}</p>
                  <p className="text-sm text-amber-700 dark:text-amber-400">{t('pdfBrokerMismatchBody')}</p>
                </div>
              </div>
            </div>
          )}

          {/* Parser warnings (suppressed on a broker mismatch: the callout above
              already carries the only warning in a clearer, localized form). */}
          {hasWarnings && !pdfBrokerMismatch && (
            <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-xl">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="w-4 h-4 text-yellow-600" />
                <p className="text-sm font-medium text-yellow-700 dark:text-yellow-400">{t('warnings')}</p>
              </div>
              {localizeParserWarnings(preview.warnings, preview.structuredWarnings).map((w, i) => (
                <p key={i} className="text-sm text-yellow-600 dark:text-yellow-500">{w}</p>
              ))}
            </div>
          )}

          {/* Critical: CSV missing historical buys (the hard-stop) */}
          {historyBlocked && (
            <div className="p-5 bg-red-50 dark:bg-red-900/20 border-2 border-red-400 dark:border-red-600 rounded-xl">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-6 h-6 text-red-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-red-700 dark:text-red-400 font-bold text-base mb-2">{t('csvHistoryBlockTitle')}</p>
                  <p className="text-sm text-red-600 dark:text-red-400 mb-3">{t('csvMissingHistoryWarning')}</p>
                  <p className="text-sm text-red-600 dark:text-red-400 font-medium">
                    {previewBroker === 'ibkr'
                      ? t('csvHistoryBlockActionIbkr')
                      : previewBroker === 'revolut'
                        ? t('csvHistoryBlockActionRevolut')
                        : t('csvHistoryBlockAction')}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Support verdict (the bit UploadPage lacks): broker status + year
              support. Hidden on a broker mismatch, where a "Trading 212: trusted"
              line would be misleading for a non-T212 PDF (the callout above is the
              verdict for that case). */}
          {!pdfBrokerMismatch && (
          <div
            className={`card border ${
              verdict === 'green'
                ? 'border-green-300 dark:border-green-700'
                : verdict === 'amber'
                  ? 'border-amber-300 dark:border-amber-700'
                  : 'border-red-300 dark:border-red-700'
            }`}
            data-testid="support-verdict"
          >
            <div className="flex items-start gap-3 mb-4">
              {verdict === 'green' ? (
                <ShieldCheck className="w-6 h-6 text-green-600 dark:text-green-400 shrink-0 mt-0.5" />
              ) : verdict === 'amber' ? (
                <AlertTriangle className="w-6 h-6 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              ) : (
                <XCircle className="w-6 h-6 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
              )}
              <div>
                <p
                  className={`font-semibold ${
                    verdict === 'green'
                      ? 'text-green-700 dark:text-green-400'
                      : verdict === 'amber'
                        ? 'text-amber-700 dark:text-amber-400'
                        : 'text-red-700 dark:text-red-400'
                  }`}
                >
                  {verdict === 'green'
                    ? t('previewVerdictGreen')
                    : verdict === 'amber'
                      ? t('previewVerdictAmber')
                      : t('previewVerdictRed')}
                </p>
              </div>
            </div>

            {/* Broker line */}
            <div className="flex items-center gap-2 text-sm mb-2">
              {brokerMeta.status === 'trusted' ? (
                <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
              )}
              <span className="text-gray-700 dark:text-slate-300">
                {brokerMeta.status === 'trusted'
                  ? t('previewBrokerTrusted', { broker: brokerMeta.label })
                  : t('previewBrokerBeta', { broker: brokerMeta.label })}
              </span>
            </div>

            {/* Year line: we compute the supported year; for others we say so. */}
            <div className="flex items-center gap-2 text-sm">
              {yearSupported ? (
                <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400 shrink-0" />
              ) : (
                <XCircle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0" />
              )}
              <span className="text-gray-700 dark:text-slate-300">
                {yearSupported
                  ? t('previewYearSupported', { year: preview.year })
                  : t('previewYearUnsupported', { year: preview.year })}
              </span>
            </div>
          </div>
          )}

          {/* CTA: unlock (clean + supported) OR lead capture (warnings / unsupported) */}
          {canUnlock ? (
            <div
              className="card bg-accent/5 dark:bg-accent/10 border border-accent/20"
              ref={ctaSectionRef}
            >
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <h2 className="font-semibold text-lg">{t('previewUnlockTitle')}</h2>
                  <p className="text-sm text-gray-600 dark:text-slate-400">{t('previewUnlockBody')}</p>
                </div>
                <button
                  onClick={goToUnlock}
                  className="btn-primary flex items-center justify-center gap-2 whitespace-nowrap self-start sm:self-auto"
                  data-testid="preview-unlock-cta"
                >
                  <Lock className="w-5 h-5" />
                  {t('previewUnlockCta')}
                </button>
              </div>
            </div>
          ) : (
            blockedCtaSection
          )}
        </div>
      )}
    </div>
  );
}
