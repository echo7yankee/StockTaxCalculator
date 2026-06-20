import { useEffect, useRef } from 'react';
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
import { getTaxYearConfig } from '@shared/taxRules/taxYears';
import { useStatementPreview } from '../hooks/useStatementPreview';
import { analytics } from '../lib/analytics';
import { CSV_BROKERS, BROKERS, type BrokerId } from '../lib/brokers';
import EmailCapture, { type SubscribeTopic } from '../components/common/EmailCapture';
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

  const {
    fileInputRef,
    activeTab,
    csvBroker,
    dragOver,
    processing,
    error,
    preview,
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

  // The broker this preview belongs to: the PDF tab is Trading212-only, the CSV
  // tab carries the selected broker.
  const previewBroker: BrokerId = preview?.fileType === 'pdf' ? 'trading212' : csvBroker;
  const brokerMeta = BROKERS[previewBroker];

  // Year support comes from the engine-supported flag (the single source of
  // truth, backlog #13). We do NOT hardcode "2025": a missing config or a year
  // whose engine support has not been signed off is treated as unsupported.
  const yearConfig = preview ? getTaxYearConfig(preview.year) : undefined;
  const yearSupported = yearConfig?.engineSupported === true;
  const historyBlocked = csvHistoryWarning && preview?.fileType === 'csv';
  const hasWarnings = (preview?.warnings.length ?? 0) > 0;
  const verdict: Verdict = preview
    ? resolveVerdict({ historyBlocked: !!historyBlocked, hasWarnings, yearSupported })
    : 'green';

  // Clean + supported -> show the unlock CTA. Otherwise the lead-capture path.
  const canUnlock = verdict === 'green';

  // Fire the clean/blocked outcome once per landed preview.
  useEffect(() => {
    if (!preview) return;
    if (verdict === 'green') analytics.previewClean();
    else analytics.previewBlocked();
    // verdict is derived from preview; keying on preview fires once per parse.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preview]);

  // Which waitlist (if any) fits an unsupported case: a beta broker -> its
  // graduation list; a prior-year file (2023/2024) -> the prior-year lane. Other
  // unsupported years are not on the roadmap, so no list is offered (contact only).
  const priorYear = preview ? preview.year === 2023 || preview.year === 2024 : false;
  const waitlistTopic: SubscribeTopic | null = !canUnlock
    ? priorYear
      ? 'prior_years'
      : previewBroker === 'ibkr'
        ? 'broker_ibkr'
        : previewBroker === 'revolut'
          ? 'broker_revolut'
          : null
    : null;

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
          ...(historyBlocked ? [t('csvMissingHistoryWarning')] : []),
          ...(!yearSupported ? [t('previewContactYearLine', { year: preview?.year })] : []),
          ...(brokerMeta.status === 'beta' ? [t('previewContactBrokerLine', { broker: brokerMeta.label })] : []),
        ],
      },
    });
  };

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
                onClick={clearPreview}
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

          {/* Parser warnings */}
          {hasWarnings && (
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

          {/* Critical: CSV missing historical buys (the hard-stop) */}
          {historyBlocked && (
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

          {/* Support verdict (the bit UploadPage lacks): broker status + year support */}
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
                  : priorYear
                    ? t('previewYearPrior', { year: preview.year })
                    : t('previewYearUnsupported', { year: preview.year })}
              </span>
            </div>
          </div>

          {/* CTA: unlock (clean + supported) OR lead capture (warnings / unsupported) */}
          {canUnlock ? (
            <div className="card bg-accent/5 dark:bg-accent/10 border border-accent/20">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <h2 className="font-semibold text-lg">{t('previewUnlockTitle')}</h2>
                  <p className="text-sm text-gray-600 dark:text-slate-400">{t('previewUnlockBody')}</p>
                </div>
                <button
                  onClick={() => navigate('/pricing')}
                  className="btn-primary flex items-center justify-center gap-2 whitespace-nowrap self-start sm:self-auto"
                  data-testid="preview-unlock-cta"
                >
                  <Lock className="w-5 h-5" />
                  {t('previewUnlockCta')}
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
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
              </div>

              {/* When a fitting waitlist exists (beta broker or prior year), offer it. */}
              {waitlistTopic && (
                <EmailCapture
                  topic={waitlistTopic}
                  source="preview-checker"
                  variant="broker"
                  heading={t('previewWaitlistHeading')}
                  description={t('previewWaitlistBody')}
                  headingLevel={2}
                />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
