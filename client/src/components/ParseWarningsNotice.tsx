import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Info, MessageCircle } from 'lucide-react';
import { localizeParserWarnings } from '../lib/parserWarningText';
import type { ParserWarning } from '@shared/index';

/**
 * The #24A parse-warning surface, shared by ResultsPage and FilingGuidePage so
 * the two paid surfaces render warnings identically and cannot drift
 * (SUGGESTIONS S11; they previously duplicated this JSX).
 *
 * Two variants, keyed off the SAME predicate both pages use
 * (`hasBlockingParseWarning` in lib/parseEligibility.ts):
 *  - blocking: the red role="alert" hard-stop with the contact CTA. The caller
 *    suppresses the D212 export / filing values alongside it.
 *  - informational: an amber note listing the warnings without suppressing
 *    anything. A warning must never be silent (trust), but an info-severity
 *    warning must not hide what the customer paid for either.
 */
export default function ParseWarningsNotice({
  blocking,
  warnings,
  structuredWarnings,
  fileName,
  testIdPrefix = '',
}: {
  blocking: boolean;
  warnings: string[];
  structuredWarnings: ParserWarning[];
  fileName: string;
  /** Keeps the historical per-page test ids stable ('' on Results, 'filing-' on the Filing Guide). */
  testIdPrefix?: string;
}) {
  const { t } = useTranslation(['results']);
  const navigate = useNavigate();

  if (warnings.length === 0) return null;

  const localized = localizeParserWarnings(warnings, structuredWarnings);

  if (!blocking) {
    return (
      <div
        className="mb-8 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700 rounded-xl"
        data-testid={`${testIdPrefix}parse-info-notice`}
      >
        <div className="flex items-start gap-3">
          <Info className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-amber-800 dark:text-amber-300 mb-1">
              {t('results:parseInfoTitle')}
            </h3>
            <p className="text-sm text-amber-700 dark:text-amber-400 mb-2">
              {t('results:parseInfoBody')}
            </p>
            <ul className="text-xs text-amber-700 dark:text-amber-400 list-disc pl-5 space-y-1">
              {localized.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="mb-8 p-5 bg-red-50 dark:bg-red-900/20 border-2 border-red-400 dark:border-red-600 rounded-xl"
      role="alert"
      data-testid={`${testIdPrefix}parse-warning-banner`}
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className="w-6 h-6 text-red-500 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-red-700 dark:text-red-400 text-base mb-2">
            {t('results:parseWarningTitle')}
          </h3>
          <p className="text-sm text-red-600 dark:text-red-400 mb-3">
            {t('results:parseWarningBody')}
          </p>
          <p className="text-xs font-medium text-red-700 dark:text-red-400 mb-1">
            {t('results:parseWarningListIntro')}
          </p>
          <ul className="text-xs text-red-600 dark:text-red-400 mb-4 list-disc pl-5 space-y-1">
            {localized.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => navigate('/contact', {
              state: {
                topic: 'support',
                subject: 'parseWarning',
                fileName,
                // Canonical English prose (never the localized rendering), so the
                // operator can grep the prefilled report against prod logs.
                warnings,
              },
            })}
            className="btn-primary inline-flex items-center gap-2"
            data-testid={`${testIdPrefix}parse-warning-contact-cta`}
          >
            <MessageCircle className="w-4 h-4" />
            {t('results:parseWarningCta')}
          </button>
        </div>
      </div>
    </div>
  );
}
