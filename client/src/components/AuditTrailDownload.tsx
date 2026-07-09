import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FileSpreadsheet, Check } from 'lucide-react';
import {
  generateAuditTrailCsv,
  type TaxCalculationResult,
  type SecurityBreakdown,
  type Transaction,
  type PdfAuditRow,
} from '@shared/index';
import { analytics } from '../lib/analytics';
import { buildAuditTrailCsvLabels } from '../utils/auditCsvLabels';
import { useCountry } from '../contexts/CountryContext';
import { isBeforeEarlyFilingDeadline } from '../utils/earlyFiling';

interface Props {
  result: TaxCalculationResult;
  securities: SecurityBreakdown[];
  transactions: Transaction[];
  /** Per-trade audit rows for the PDF flow (the CSV flow drives the audit from `transactions`). */
  pdfTrades?: PdfAuditRow[];
  /** True when the PDF net gain came from the statement overview total (adds an honesty note). */
  pdfNetFromOverview?: boolean;
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
 * one row per trade (both flows: the CSV flow from its transactions, the PDF flow
 * from the engine's per-trade audit rows, each with its own BNR rate + date),
 * plus a summary that reconciles to the on-screen numbers. The CSV is
 * built ENTIRELY in the browser from the already-computed result; nothing is sent
 * to the server. Like {@link D212Download}, this carries engine output, so the
 * caller renders it only on the paid ResultsPage and only on a clean parse (the
 * #24A warning hard-stop hides it).
 */
export default function AuditTrailDownload({
  result,
  securities,
  transactions,
  pdfTrades,
  pdfNetFromOverview,
  taxYear,
  fileName,
  brokerLabel,
}: Props) {
  const { t } = useTranslation(['results']);
  const { countryConfig } = useCountry();
  const [done, setDone] = useState(false);

  const handleDownload = () => {
    const csv = generateAuditTrailCsv(
      {
        result, securities, transactions, pdfTrades, pdfNetFromOverview, taxYear, fileName, brokerLabel,
        // Forfeit the discount rows once the deadline passes, matching the on-screen
        // total and the D212 XML so the records CSV never over-states the reduction.
        showEarlyFilingDiscount: isBeforeEarlyFilingDeadline(countryConfig?.earlyFilingDeadline),
      },
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
