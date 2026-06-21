import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FileSpreadsheet, Check } from 'lucide-react';
import {
  generateAuditTrailCsv,
  type TaxCalculationResult,
  type SecurityBreakdown,
  type Transaction,
} from '@shared/index';
import { analytics } from '../lib/analytics';
import { buildAuditTrailCsvLabels } from '../utils/auditCsvLabels';

interface Props {
  result: TaxCalculationResult;
  securities: SecurityBreakdown[];
  transactions: Transaction[];
  taxYear: number;
  fileName: string;
  brokerLabel: string;
}

/**
 * Triggers a browser download of `csv` as `fileName`. A UTF-8 BOM is prepended so
 * Excel on Windows reads the Romanian diacritics correctly (without it Excel
 * assumes the legacy code page and shows mojibake).
 */
function downloadCsv(csv: string, fileName: string): void {
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * "Download audit trail (.csv)" action.
 *
 * Surfaces the engine's determinism as a downloadable, ANAF-defensible breakdown:
 * one row per trade (CSV flow, each with its own BNR rate + date) or per security
 * (PDF flow), plus a summary that reconciles to the on-screen numbers. The CSV is
 * built ENTIRELY in the browser from the already-computed result; nothing is sent
 * to the server. Like {@link D212Download}, this carries engine output, so the
 * caller renders it only on the paid ResultsPage and only on a clean parse (the
 * #24A warning hard-stop hides it).
 */
export default function AuditTrailDownload({
  result,
  securities,
  transactions,
  taxYear,
  fileName,
  brokerLabel,
}: Props) {
  const { t } = useTranslation(['results']);
  const [done, setDone] = useState(false);

  const handleDownload = () => {
    const csv = generateAuditTrailCsv(
      { result, securities, transactions, taxYear, fileName, brokerLabel },
      buildAuditTrailCsvLabels(t),
    );
    downloadCsv(csv, `InvesTax-audit-${taxYear}.csv`);
    analytics.auditTrailDownloaded();
    setDone(true);
  };

  return (
    <div className="card mb-8" data-testid="audit-trail-download">
      <div className="flex items-start gap-3">
        <FileSpreadsheet className="w-5 h-5 text-accent dark:text-accent-light shrink-0 mt-1" />
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold mb-1">{t('results:auditCsvTitle')}</h3>
          <p className="text-sm text-gray-600 dark:text-slate-400 mb-3">{t('results:auditCsvBody')}</p>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleDownload}
              className="btn-secondary inline-flex items-center gap-2"
              data-testid="audit-trail-download-button"
            >
              <FileSpreadsheet className="w-4 h-4" />
              {t('results:auditCsvButton')}
            </button>
            {done && (
              <span
                className="inline-flex items-center gap-1 text-sm text-green-600 dark:text-green-400"
                data-testid="audit-trail-success"
                role="status"
              >
                <Check className="w-4 h-4" />
                {t('results:auditCsvSuccess')}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
