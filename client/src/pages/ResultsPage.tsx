import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, TrendingUp, DollarSign, Heart, Percent, FileText, Save, Check, ClipboardList, LogIn } from 'lucide-react';
import { useUpload } from '../contexts/UploadContext';
import { useCountry } from '../contexts/CountryContext';
import { useAuth } from '../contexts/AuthContext';

export default function ResultsPage() {
  const { t } = useTranslation(['results', 'common']);
  const navigate = useNavigate();
  const { taxResult, securities, fileName, taxYear, transactions } = useUpload();
  const { countryConfig } = useCountry();
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const handleSave = useCallback(async () => {
    if (!user) {
      navigate('/login', { state: { from: { pathname: '/results' } } });
      return;
    }
    if (!taxResult || !taxYear) return;
    setSaving(true);
    setSaveError(null);

    try {
      const res = await fetch('/api/uploads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          year: taxYear,
          country: countryConfig?.code ?? 'RO',
          broker: 'trading212',
          fileName,
          taxResult,
          securities,
        }),
      });

      if (!res.ok) throw new Error('Failed to save');
      setSaved(true);
    } catch {
      setSaveError(t('results:saveError'));
    } finally {
      setSaving(false);
    }
  }, [taxResult, taxYear, countryConfig, fileName, securities, user, navigate]);

  if (!taxResult) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-12">
        <h1 className="text-3xl font-bold mb-2">{t('results:title')}</h1>
        <p className="text-gray-600 dark:text-slate-400 mb-8">
          {t('results:emptySubtitle')}
        </p>
        <div className="card text-center py-16">
          <p className="text-gray-500 dark:text-slate-500 text-lg">{t('results:noCalculations')}</p>
          <p className="text-sm text-gray-400 dark:text-slate-600 mt-2">{t('results:noCalculationsDetail')}</p>
          <button onClick={() => navigate('/upload')} className="btn-primary mt-6">
            {t('common:goToUpload')}
          </button>
        </div>
      </div>
    );
  }

  const sym = countryConfig?.currencySymbol ?? 'RON';
  const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="max-w-7xl mx-auto px-4 py-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <button
            onClick={() => navigate('/upload')}
            className="flex items-center gap-1 text-sm text-gray-500 dark:text-slate-400 hover:text-accent mb-2 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> {t('common:backToUpload')}
          </button>
          <h1 className="text-2xl sm:text-3xl font-bold">{t('results:titleWithYear', { year: taxYear })}</h1>
          <p className="text-gray-600 dark:text-slate-400 mt-1 text-sm sm:text-base">
            <FileText className="w-4 h-4 inline mr-1" />
            {fileName} — {transactions.length > 0 ? t('results:transactionsCount', { count: transactions.length }) : t('results:pdfStatement')}
          </p>
        </div>
        <div className="flex flex-col items-start sm:items-end gap-1">
          <button
            onClick={handleSave}
            disabled={saving || saved}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
              saved
                ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                : 'btn-primary'
            }`}
          >
            {!user ? (
              <><LogIn className="w-4 h-4" /> {t('results:logInToSave')}</>
            ) : saved ? (
              <><Check className="w-4 h-4" /> {t('results:savedToDashboard')}</>
            ) : saving ? (
              <><Save className="w-4 h-4" /> {t('results:saving')}</>
            ) : (
              <><Save className="w-4 h-4" /> {t('results:saveToDashboard')}</>
            )}
          </button>
          {saveError && <p className="text-xs text-red-500">{saveError}</p>}
        </div>
      </div>

      {/* Filing guide banner */}
      <div className="mb-8 p-4 bg-accent/5 dark:bg-accent/10 border border-accent/20 rounded-xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h3 className="font-semibold">{t('results:readyToFile')}</h3>
          <p className="text-sm text-gray-600 dark:text-slate-400">
            {t('results:readyToFileDetail')}
          </p>
        </div>
        <button
          onClick={() => navigate('/filing-guide')}
          className="btn-primary flex items-center gap-2 whitespace-nowrap self-start sm:self-auto"
        >
          <ClipboardList className="w-4 h-4" />
          {t('common:filingGuide')}
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <SummaryCard
          icon={<TrendingUp className="w-6 h-6" />}
          label={t('results:capitalGainsTax')}
          value={`${fmt(taxResult.capitalGains.taxOwed)} ${sym}`}
          detail={t('results:capitalGainsTaxDetail', { netGains: fmt(taxResult.capitalGains.netGains), rate: `${(taxResult.capitalGains.taxRate * 100)}%` })}
          color="green"
        />
        <SummaryCard
          icon={<DollarSign className="w-6 h-6" />}
          label={t('results:dividendTax')}
          value={`${fmt(taxResult.dividends.taxOwed)} ${sym}`}
          detail={t('results:dividendTaxDetail', { gross: fmt(taxResult.dividends.grossTotal), withholding: fmt(taxResult.dividends.withholdingTaxPaid) })}
          color="blue"
        />
        <SummaryCard
          icon={<Heart className="w-6 h-6" />}
          label={t('results:healthContribution')}
          value={`${fmt(taxResult.healthContribution.amountOwed)} ${sym}`}
          detail={t('results:healthContributionDetail', { bracket: taxResult.healthContribution.thresholdHit, income: fmt(taxResult.healthContribution.totalNonSalaryIncome) })}
          color="purple"
        />
        <SummaryCard
          icon={<Percent className="w-6 h-6" />}
          label={t('results:totalTaxOwed')}
          value={`${fmt(taxResult.totals.totalTaxOwed)} ${sym}`}
          detail={t('results:totalTaxOwedDetail', { amount: fmt(taxResult.totals.totalAfterDiscount), symbol: sym })}
          color="accent"
          highlight
        />
      </div>

      {/* Capital gains breakdown */}
      <div className="card mb-6">
        <h2 className="text-xl font-semibold mb-4">{t('results:capitalGainsBreakdown')}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-center">
          <Stat label={t('results:totalProceeds')} value={`${fmt(taxResult.capitalGains.totalProceeds)} ${sym}`} />
          <Stat label={t('results:totalCostBasis')} value={`${fmt(taxResult.capitalGains.totalCostBasis)} ${sym}`} />
          <Stat label={t('results:netGains')} value={`${fmt(taxResult.capitalGains.netGains)} ${sym}`} positive />
          <Stat label={t('results:losses')} value={`${fmt(taxResult.capitalGains.losses)} ${sym}`} negative={taxResult.capitalGains.losses > 0} />
        </div>
      </div>

      {/* Early filing discount */}
      {taxResult.totals.earlyFilingDiscount > 0 && (
        <div className="mb-6 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl">
          <p className="text-green-700 dark:text-green-400 font-medium">
            {t('results:earlyFilingSave', { amount: fmt(taxResult.totals.earlyFilingDiscount), symbol: sym })}
          </p>
          <p className="text-sm text-green-600 dark:text-green-500 mt-1">
            {t('results:earlyFilingDetail', { earlyDeadline: countryConfig?.earlyFilingDeadline, rate: `${((countryConfig?.earlyFilingDiscountRate ?? 0) * 100)}`, finalDeadline: countryConfig?.finalFilingDeadline })}
          </p>
        </div>
      )}

      {/* Per-security table */}
      <div className="card">
        <h2 className="text-xl font-semibold mb-4">{t('results:perSecurityBreakdown')}</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-navy-600">
                <th className="text-left py-3 px-2 font-medium">{t('results:colSecurity')}</th>
                <th className="text-right py-3 px-2 font-medium">{t('results:colBought')}</th>
                <th className="text-right py-3 px-2 font-medium">{t('results:colSold')}</th>
                <th className="text-right py-3 px-2 font-medium">{t('results:colRemaining')}</th>
                <th className="text-right py-3 px-2 font-medium">{t('results:colAvgCost')}</th>
                <th className="text-right py-3 px-2 font-medium">{t('results:colProceeds')}</th>
                <th className="text-right py-3 px-2 font-medium">{t('results:colCostBasis')}</th>
                <th className="text-right py-3 px-2 font-medium">{t('results:colGainLoss')}</th>
                <th className="text-right py-3 px-2 font-medium">{t('results:colDividends')}</th>
              </tr>
            </thead>
            <tbody>
              {securities.map((sec) => (
                <tr key={sec.isin || sec.ticker} className="border-b border-gray-100 dark:border-navy-700 hover:bg-navy-700/50">
                  <td className="py-3 px-2">
                    <p className="font-medium">{sec.ticker}</p>
                    <p className="text-xs text-gray-500 dark:text-slate-500 truncate max-w-[180px]">{sec.securityName}</p>
                  </td>
                  <td className="text-right py-3 px-2">{sec.totalBoughtShares}</td>
                  <td className="text-right py-3 px-2">{sec.totalSoldShares}</td>
                  <td className="text-right py-3 px-2">{sec.remainingShares}</td>
                  <td className="text-right py-3 px-2">{fmt(sec.weightedAvgCostLocal)}</td>
                  <td className="text-right py-3 px-2">{fmt(sec.totalProceeds)}</td>
                  <td className="text-right py-3 px-2">{fmt(sec.totalCostBasis)}</td>
                  <td className={`text-right py-3 px-2 font-medium ${
                    sec.realizedGainLoss >= 0
                      ? 'text-green-600 dark:text-green-400'
                      : 'text-red-600 dark:text-red-400'
                  }`}>
                    {sec.realizedGainLoss >= 0 ? '+' : ''}{fmt(sec.realizedGainLoss)}
                  </td>
                  <td className="text-right py-3 px-2">{fmt(sec.totalDividends)}</td>
                </tr>
              ))}
              {securities.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-gray-500 dark:text-slate-500">
                    {t('results:noSecurities', { year: taxYear })}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({ icon, label, value, detail, color, highlight }: {
  icon: React.ReactNode;
  label: string;
  value: string;
  detail: string;
  color: string;
  highlight?: boolean;
}) {
  const bgMap: Record<string, string> = {
    green: 'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400',
    blue: 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400',
    purple: 'bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400',
    accent: 'bg-accent/10 text-accent',
  };

  return (
    <div className={`card ${highlight ? 'ring-2 ring-accent' : ''}`}>
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center mb-3 ${bgMap[color] ?? bgMap.accent}`}>
        {icon}
      </div>
      <p className="text-sm text-gray-500 dark:text-slate-400">{label}</p>
      <p className="text-2xl font-bold mt-1">{value}</p>
      <p className="text-xs text-gray-400 dark:text-slate-500 mt-1">{detail}</p>
    </div>
  );
}

function Stat({ label, value, positive, negative }: {
  label: string;
  value: string;
  positive?: boolean;
  negative?: boolean;
}) {
  return (
    <div>
      <p className="text-xs text-gray-500 dark:text-slate-400 mb-1">{label}</p>
      <p className={`text-lg font-semibold ${
        positive ? 'text-green-600 dark:text-green-400' :
        negative ? 'text-red-600 dark:text-red-400' : ''
      }`}>
        {value}
      </p>
    </div>
  );
}
