import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Copy, CheckCircle, ClipboardList, Download } from 'lucide-react';
import { useUpload } from '../contexts/UploadContext';
import { useCountry } from '../contexts/CountryContext';
import { d212Sections, formatD212Summary } from '@shared/taxRules/d212Fields';
import type { D212Field } from '@shared/taxRules/d212Fields';
import type { TaxCalculationResult } from '@shared/types/tax';

// Romania-specific filing context — steps are now i18n-driven

export default function FilingGuidePage() {
  const { t } = useTranslation(['filing', 'common', 'd212']);
  const navigate = useNavigate();
  const { taxResult, taxYear } = useUpload();
  const { countryConfig } = useCountry();
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [allCopied, setAllCopied] = useState(false);

  if (!taxResult) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12">
        <h1 className="text-3xl font-bold mb-2">{t('filing:title')}</h1>
        <p className="text-gray-600 dark:text-slate-400 mb-8">
          {t('filing:emptySubtitle')}
        </p>
        <div className="card text-center py-16">
          <ClipboardList className="w-12 h-12 text-gray-300 dark:text-slate-600 mx-auto mb-4" />
          <p className="text-gray-500 dark:text-slate-500 text-lg">{t('filing:noDataAvailable')}</p>
          <div className="flex gap-3 justify-center mt-6">
            <button onClick={() => navigate('/upload')} className="btn-primary">
              {t('common:uploadStatement')}
            </button>
            <button onClick={() => navigate('/dashboard')} className="btn-secondary">
              {t('common:viewDashboard')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const isRomania = (countryConfig?.code ?? 'RO') === 'RO';
  const sym = countryConfig?.currencySymbol ?? 'RON';
  const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const copyValue = async (field: D212Field) => {
    const value = fmt(field.getValue(taxResult));
    await navigator.clipboard.writeText(value);
    setCopiedId(field.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const copyAll = async () => {
    const text = formatD212Summary(taxResult);
    await navigator.clipboard.writeText(text);
    setAllCopied(true);
    setTimeout(() => setAllCopied(false), 2000);
  };

  const pageTitle = isRomania ? t('filing:titleRomania', { year: taxYear }) : t('filing:titleGeneric', { year: taxYear });
  const subtitle = isRomania
    ? t('filing:subtitleRomania', { portal: 'ANAF SPV', form: 'Declarația Unică (D212)' })
    : t('filing:subtitleGeneric');

  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <button
            onClick={() => navigate('/results')}
            className="flex items-center gap-1 text-sm text-gray-500 dark:text-slate-400 hover:text-accent mb-2 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> {t('common:backToResults')}
          </button>
          <h1 className="text-3xl font-bold">{pageTitle}</h1>
          <p className="text-gray-600 dark:text-slate-400 mt-1">{subtitle}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={copyAll} className="btn-secondary flex items-center gap-2">
            {allCopied ? <CheckCircle className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
            {allCopied ? t('filing:copied') : t('filing:copyAll')}
          </button>
          <button
            onClick={() => {
              import('../utils/pdfExport').then(({ generateTaxSummaryPdf }) => {
                generateTaxSummaryPdf(taxResult, taxYear, sym);
              });
            }}
            className="btn-primary flex items-center gap-2"
          >
            <Download className="w-4 h-4" />
            {t('filing:downloadPdf')}
          </button>
        </div>
      </div>

      {/* How to use — Romania-specific steps */}
      {isRomania && (
        <div className="mb-8 p-4 bg-accent/5 dark:bg-accent/10 border border-accent/20 rounded-xl">
          <h3 className="font-semibold text-accent mb-2">{t('filing:howToUse')}</h3>
          <ol className="text-sm text-gray-600 dark:text-slate-400 space-y-1 list-decimal list-inside">
            <li>{t('filing:stepLogin')}<strong>{t('filing:stepLoginBold')}</strong>{t('filing:stepLoginSuffix')}</li>
            <li>{t('filing:stepOpenForm')}<strong>{t('filing:stepOpenFormBold')}</strong>{t('filing:stepOpenFormSuffix', { year: taxYear })}</li>
            <li>{t('filing:stepNavigate')}</li>
            <li>{t('filing:stepCopyPaste')}</li>
          </ol>
        </div>
      )}

      {/* Filing sections */}
      <div className="space-y-6">
        {d212Sections.map((section) => (
          <FilingSectionCard
            key={section.id}
            sectionId={section.id}
            sectionLabel={section.fields[0]?.section ?? ''}
            fields={section.fields}
            taxResult={taxResult}
            sym={sym}
            fmt={fmt}
            copiedId={copiedId}
            onCopy={copyValue}
            t={t}
          />
        ))}
      </div>

      {/* Totals */}
      <div className="card mt-6">
        <h2 className="text-xl font-semibold mb-4">{t('filing:summary')}</h2>
        <div className="space-y-3">
          <TotalRow label={t('filing:totalTaxOwed')} value={`${fmt(taxResult.totals.totalTaxOwed)} ${sym}`} bold />
          {taxResult.totals.earlyFilingDiscount > 0 && (
            <>
              <TotalRow
                label={t('filing:earlyFilingDiscount', { rate: `${((countryConfig?.earlyFilingDiscountRate ?? 0) * 100)}` })}
                value={`-${fmt(taxResult.totals.earlyFilingDiscount)} ${sym}`}
                className="text-green-600 dark:text-green-400"
              />
              <TotalRow
                label={t('filing:totalAfterDiscount')}
                value={`${fmt(taxResult.totals.totalAfterDiscount)} ${sym}`}
                bold
                className="text-accent"
              />
            </>
          )}
        </div>
        <p className="text-xs text-gray-400 dark:text-slate-600 mt-4">
          {t('filing:filingDeadline', { finalDeadline: countryConfig?.finalFilingDeadline, earlyDeadline: countryConfig?.earlyFilingDeadline })}
        </p>
      </div>
    </div>
  );
}

function FilingSectionCard({
  sectionId, sectionLabel, fields, taxResult, sym, fmt, copiedId, onCopy, t,
}: {
  sectionId: string;
  sectionLabel: string;
  fields: D212Field[];
  taxResult: TaxCalculationResult;
  sym: string;
  fmt: (n: number) => string;
  copiedId: string | null;
  onCopy: (field: D212Field) => void;
  t: (key: string, options?: Record<string, unknown>) => string;
}) {
  return (
    <div className="card">
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-mono bg-accent/10 text-accent px-2 py-0.5 rounded">
              {sectionLabel}
            </span>
            <h2 className="text-lg font-semibold">{t(`d212:section_${sectionId}_title`)}</h2>
          </div>
          <p className="text-sm text-gray-500 dark:text-slate-500 italic">{t(`d212:section_${sectionId}_localTitle`)}</p>
          <p className="text-xs text-gray-400 dark:text-slate-600 mt-1">{t(`d212:section_${sectionId}_desc`)}</p>
        </div>
      </div>

      <div className="space-y-2">
        {fields.map((field) => {
          const value = field.getValue(taxResult);
          const isCopied = copiedId === field.id;
          return (
            <div
              key={field.id}
              className="flex items-center justify-between py-3 px-4 bg-navy-700/30 dark:bg-navy-750 rounded-lg group"
            >
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm">{t(`d212:${field.id}`)}</p>
                <p className="text-xs text-gray-500 dark:text-slate-500">{t(`d212:${field.id}_desc`)}</p>
              </div>
              <div className="flex items-center gap-3 ml-4">
                <span className="text-lg font-bold font-mono tabular-nums">
                  {fmt(value)} <span className="text-sm font-normal text-gray-400 dark:text-slate-500">{sym}</span>
                </span>
                <button
                  onClick={() => onCopy(field)}
                  className={`p-2 rounded-lg transition-colors ${
                    isCopied
                      ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400'
                      : 'text-gray-400 hover:text-accent hover:bg-accent/10'
                  }`}
                  title={isCopied ? t('filing:copied') : t(`d212:${field.id}`)}
                >
                  {isCopied ? <CheckCircle className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TotalRow({ label, value, bold, className }: {
  label: string;
  value: string;
  bold?: boolean;
  className?: string;
}) {
  return (
    <div className={`flex items-center justify-between py-2 ${className ?? ''}`}>
      <span className={`text-sm ${bold ? 'font-semibold' : 'text-gray-600 dark:text-slate-400'}`}>{label}</span>
      <span className={`font-mono tabular-nums ${bold ? 'text-xl font-bold' : 'text-lg font-medium'}`}>{value}</span>
    </div>
  );
}
