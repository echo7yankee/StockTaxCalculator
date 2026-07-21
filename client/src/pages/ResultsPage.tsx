import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, TrendingUp, DollarSign, Heart, Percent, FileText, Save, Check, ClipboardList, LogIn, AlertTriangle, Coins } from 'lucide-react';
import { calculateTaxes, getTaxConfigForYear } from '@shared/index';
import { useUpload } from '../contexts/UploadContext';
import { useCountry } from '../contexts/CountryContext';
import { useAuth } from '../contexts/AuthContext';
import { analytics } from '../lib/analytics';
import { getBrokerMeta } from '../lib/brokers';
import { hasBlockingParseWarning } from '../lib/parseEligibility';
import PageMeta from '../components/common/PageMeta';
import ParseWarningsNotice from '../components/ParseWarningsNotice';
import D212Download from '../components/D212Download';
import AuditTrailDownload from '../components/AuditTrailDownload';
import { taxYearInterpVarsForYear } from '../utils/taxYearVars';
import { isEarlyFilingDiscountAvailable } from '@shared/taxRules/taxYears';
import { cassBracketLabelKey } from '../utils/cassBracket';

export default function ResultsPage() {
  const { t, i18n } = useTranslation(['results', 'common']);
  const navigate = useNavigate();
  const { taxResult, correctedTaxResult, securities, fileName, taxYear, transactions, auditRows, pdfNetFromOverview, parseWarnings, parseStructuredWarnings, broker, carriedPositions, carryForwardYear, setUploadData } = useUpload();
  // #24A hard-stop, aligned with the pre-pay gate (SUGGESTIONS S11): only a
  // BLOCKING warning (fatal severity, a legacy fatal-prose marker, or an
  // engine #24C refusal) suppresses the D212 / audit trail / filing CTA.
  // Info-severity warnings render as a non-blocking note instead -- the
  // pre-pay gate deliberately let those files through to checkout, so hiding
  // the paid output on them re-created the paid-then-blocked shape.
  const hasBlockingWarnings = hasBlockingParseWarning(parseWarnings, parseStructuredWarnings);
  // Beta brokers (parser built to the broker's published format without a real
  // account to validate against) must always carry a verify-before-filing caveat,
  // even on a clean parse (Regression Firewall, 09-backlog 8.6 #5).
  const brokerMeta = getBrokerMeta(broker);
  const isBetaBroker = brokerMeta?.status === 'beta';
  const { countryConfig } = useCountry();
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  // Disclaimer reflects the uploaded statement's tax year (it can be a prior year
  // now that 2023/2024 are engine-supported), so the footnote year matches the
  // results title rather than always naming the current engine year.
  const yearVars = taxYearInterpVarsForYear(i18n.language, taxYear);

  // Dividend foreign-tax credit. Some statements (notably the Revolut Account
  // Statement) carry no withholding line, so the parser reports 0 withholding and
  // the dividend tax is over-stated (full Romanian rate, no foreign-tax credit).
  // When we have dividends, no parsed withholding, and still hold the
  // transactions to recompute from, let the user supply the foreign tax actually
  // withheld; it feeds the engine's existing aggregate credit (art. 131).
  const [whtInput, setWhtInput] = useState('');
  const dividendTxs = transactions.filter((tx) => tx.action === 'dividend');
  const dividendCurrencies = [...new Set(dividendTxs.map((tx) => tx.priceCurrency))];
  const localCurrency = countryConfig?.currency ?? 'RON';
  // A single foreign dividend currency lets the user enter the amount in that
  // currency; we convert at the same blended BNR rate already applied to the
  // dividends (no withholding-rate is assumed). Mixed currencies fall back to RON.
  const singleForeignDivCurrency =
    dividendCurrencies.length === 1 && dividendCurrencies[0] !== localCurrency ? dividendCurrencies[0] : null;
  const dividendLocalSum = dividendTxs.reduce((s, tx) => s + (tx.totalAmountLocal || 0), 0);
  const dividendOriginalSum = dividendTxs.reduce((s, tx) => s + (tx.totalAmountOriginal || 0), 0);
  const whtInputToLocalRate =
    singleForeignDivCurrency && dividendOriginalSum > 0 ? dividendLocalSum / dividendOriginalSum : 1;
  const whtInputCurrency = singleForeignDivCurrency ?? localCurrency;
  const canApplyDividendCredit =
    !!taxResult && taxResult.dividends.grossTotal > 0 &&
    taxResult.dividends.withholdingTaxPaid === 0 && transactions.length > 0;

  const whtOverrideLocal = useMemo(() => {
    if (!canApplyDividendCredit) return undefined;
    const parsed = parseFloat(whtInput.replace(',', '.'));
    if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
    return parsed * whtInputToLocalRate;
  }, [canApplyDividendCredit, whtInput, whtInputToLocalRate]);

  // Re-run the engine with the withholding override so the dividend tax + totals
  // reflect the credit. No override (or no transactions) returns the original
  // result unchanged, so the PDF flow and every clean parse are untouched.
  // Carry-forward opening positions MUST be passed through (same as UploadPage's
  // original computation), otherwise a carried sell recomputes with cost basis 0
  // and the capital gains are over-stated the moment the user enters a credit.
  const displayResult = useMemo(() => {
    if (!taxResult) return null;
    if (whtOverrideLocal == null || !countryConfig) return taxResult;
    const cfg = getTaxConfigForYear(countryConfig, taxYear);
    return calculateTaxes(transactions, cfg, taxYear, whtOverrideLocal, carriedPositions).taxResult;
  }, [taxResult, whtOverrideLocal, countryConfig, taxYear, transactions, carriedPositions]);

  // Persist the withholding-corrected result to context so the Filing Guide (and any
  // other downstream surface) shows the SAME credit-adjusted dividend tax + total the
  // user sees here, never the over-stated un-credited figure. Null when no credit is
  // applied, so the clean parse / PDF flow is untouched and consumers fall back to
  // `taxResult`. Guarded on a real change to avoid a setState loop.
  useEffect(() => {
    const corrected = whtOverrideLocal != null && displayResult !== taxResult ? displayResult : null;
    if (corrected !== correctedTaxResult) {
      setUploadData({ correctedTaxResult: corrected });
    }
  }, [whtOverrideLocal, displayResult, taxResult, correctedTaxResult, setUploadData]);

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
          broker,
          fileName,
          taxResult: displayResult ?? taxResult,
          securities,
        }),
      });

      if (!res.ok) throw new Error('Failed to save');
      setSaved(true);
      analytics.calculationSaved();
    } catch {
      setSaveError(t('results:saveError'));
    } finally {
      setSaving(false);
    }
  }, [displayResult, taxResult, taxYear, countryConfig, fileName, securities, broker, user, navigate, t]);

  if (!taxResult) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-12">
        <h1 className="text-3xl font-bold mb-2">{t('results:title')}</h1>
        <p className="text-gray-600 dark:text-slate-400 mb-8">
          {t('results:emptySubtitle')}
        </p>
        <div className="card text-center py-16">
          <p className="text-gray-500 dark:text-slate-400 text-lg">{t('results:noCalculations')}</p>
          <p className="text-sm text-gray-500 dark:text-slate-400 mt-2">{t('results:noCalculationsDetail')}</p>
          <button onClick={() => navigate('/upload')} className="btn-primary mt-6">
            {t('common:goToUpload')}
          </button>
        </div>
      </div>
    );
  }

  // Past the guard taxResult is non-null, so displayResult is too. `result` is
  // the withholding-adjusted result when the user supplied a credit, else the original.
  const result = displayResult ?? taxResult;
  const sym = countryConfig?.currencySymbol ?? 'RON';
  const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  // The early-filing discount (bonificație) is only a real reduction while the
  // deadline is still ahead. Once it has passed, ANAF forfeits it, so the D212
  // XML declares the full tax (see d212Xml.ts date-gate). Gate every on-screen
  // "after discount" surface on the SAME per-year deadline the XML uses, keyed
  // on the result's tax year (not the wall-clock year), so a late/notificare-wave
  // filer, or a 2025 result reopened in a later year, is never shown a
  // discounted total the declaration no longer claims.
  const showEarlyFilingDiscount =
    result.totals.earlyFilingDiscount > 0 &&
    isEarlyFilingDiscountAvailable(taxYear);

  return (
    <div className="max-w-7xl mx-auto px-4 py-12">
      <PageMeta titleKey="resultsTitle" descriptionKey="resultsDesc" robots="noindex, follow" />
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <button
            onClick={() => navigate('/upload')}
            className="flex items-center gap-1 text-sm text-gray-500 dark:text-slate-400 hover:text-accent dark:hover:text-accent-light mb-2 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> {t('common:backToUpload')}
          </button>
          <h1 className="text-2xl sm:text-3xl font-bold">{t('results:titleWithYear', { year: taxYear })}</h1>
          <p className="text-gray-600 dark:text-slate-400 mt-1 text-sm sm:text-base">
            <FileText className="w-4 h-4 inline mr-1" />
            {fileName}, {transactions.length > 0 ? t('results:transactionsCount', { count: transactions.length }) : t('results:pdfStatement')}
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

      {isBetaBroker && (
        <div
          className="mb-8 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700 rounded-xl"
          data-testid="beta-broker-caveat"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-amber-800 dark:text-amber-300 mb-1">
                {t('results:betaBrokerTitle', { broker: brokerMeta?.label })}
              </h3>
              <p className="text-sm text-amber-700 dark:text-amber-400">
                {t('results:betaBrokerBody', { broker: brokerMeta?.label })}
              </p>
            </div>
          </div>
        </div>
      )}

      <ParseWarningsNotice
        blocking={hasBlockingWarnings}
        warnings={parseWarnings}
        structuredWarnings={parseStructuredWarnings}
        fileName={fileName}
      />

      {!hasBlockingWarnings && (
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
            data-testid="filing-guide-cta"
          >
            <ClipboardList className="w-4 h-4" />
            {t('common:filingGuide')}
          </button>
        </div>
      )}

      {/* D212 declaration generator: the primary "ready to file" action, kept high
          up next to the filing-guide CTA. Suppressed only by a BLOCKING warning
          (the S11-aligned hard-stop). Generates the ANAF v11 XML in the browser. */}
      {!hasBlockingWarnings && (
        <D212Download result={result} securities={securities} taxYear={taxYear} />
      )}

      {/* Audit-trail CSV: the determinism/auditability moat surface (per-trade BNR
          breakdown + summary). Engine output, so paid + non-blocked only, like D212. */}
      {!hasBlockingWarnings && (
        <AuditTrailDownload
          result={result}
          securities={securities}
          transactions={transactions}
          pdfTrades={auditRows}
          pdfNetFromOverview={pdfNetFromOverview}
          taxYear={taxYear}
          fileName={fileName}
          brokerLabel={brokerMeta?.label ?? broker}
        />
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <SummaryCard
          icon={<TrendingUp className="w-6 h-6" />}
          label={t('results:capitalGainsTax')}
          value={`${fmt(result.capitalGains.taxOwed)} ${sym}`}
          detail={t('results:capitalGainsTaxDetail', { netGains: fmt(result.capitalGains.netGains), rate: result.capitalGains.taxRate * 100 })}
          color="green"
          testId="capital-gains-value"
        />
        <SummaryCard
          icon={<DollarSign className="w-6 h-6" />}
          label={t('results:dividendTax')}
          value={`${fmt(result.dividends.taxOwed)} ${sym}`}
          detail={t('results:dividendTaxDetail', { gross: fmt(result.dividends.grossTotal), withholding: fmt(result.dividends.withholdingTaxPaid) })}
          color="blue"
        />
        <SummaryCard
          icon={<Heart className="w-6 h-6" />}
          label={t('results:healthContribution')}
          value={`${fmt(result.healthContribution.amountOwed)} ${sym}`}
          detail={t('results:healthContributionDetail', {
            bracket: t(cassBracketLabelKey(result.healthContribution.thresholdHit)),
            income: fmt(result.healthContribution.totalNonSalaryIncome),
          })}
          color="purple"
        />
        <SummaryCard
          icon={<Percent className="w-6 h-6" />}
          label={t('results:totalTaxOwed')}
          value={`${fmt(result.totals.totalTaxOwed)} ${sym}`}
          detail={showEarlyFilingDiscount ? t('results:totalTaxOwedDetail', { amount: fmt(result.totals.totalAfterDiscount), symbol: sym }) : undefined}
          color="accent"
          highlight
          testId="total-tax-owed-value"
        />
      </div>

      {/* Dividend foreign-tax credit (statements without a withholding line, e.g. Revolut beta) */}
      {canApplyDividendCredit && (
        <div className="card mb-8" data-testid="dividend-wht-credit">
          <div className="flex items-start gap-3">
            <Coins className="w-5 h-5 text-accent dark:text-accent-light shrink-0 mt-1" />
            <div className="flex-1">
              <h3 className="font-semibold mb-1">{t('results:dividendCreditTitle')}</h3>
              <p className="text-sm text-gray-600 dark:text-slate-400 mb-3">{t('results:dividendCreditBody')}</p>
              <label htmlFor="wht-input" className="block text-sm font-medium mb-1">
                {t('results:dividendCreditLabel', { currency: whtInputCurrency })}
              </label>
              <input
                id="wht-input"
                type="number"
                step="0.01"
                min="0"
                inputMode="decimal"
                value={whtInput}
                onChange={(e) => setWhtInput(e.target.value)}
                placeholder="0.00"
                className="input sm:w-48"
                data-testid="dividend-wht-input"
              />
              {whtOverrideLocal != null && whtInputCurrency !== localCurrency && (
                <p className="text-xs text-gray-500 dark:text-slate-400 mt-2" data-testid="dividend-wht-converted">
                  {t('results:dividendCreditConverted', { local: fmt(whtOverrideLocal), symbol: sym })}
                </p>
              )}
              <p className="text-xs text-gray-500 dark:text-slate-400 mt-2">{t('results:dividendCreditHint')}</p>
            </div>
          </div>
        </div>
      )}

      <p className="text-xs text-gray-500 dark:text-slate-400 mb-6 text-right">
        {t('common:taxRulesUpdated', yearVars)}
      </p>

      {/* Capital gains breakdown */}
      <div className="card mb-6">
        <h2 className="text-xl font-semibold mb-4">{t('results:capitalGainsBreakdown')}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-center">
          <Stat label={t('results:totalProceeds')} value={`${fmt(result.capitalGains.totalProceeds)} ${sym}`} />
          <Stat label={t('results:totalCostBasis')} value={`${fmt(result.capitalGains.totalCostBasis)} ${sym}`} />
          <Stat label={t('results:netGains')} value={`${fmt(result.capitalGains.netGains)} ${sym}`} positive />
          <Stat label={t('results:losses')} value={`${fmt(result.capitalGains.losses)} ${sym}`} negative={result.capitalGains.losses > 0} />
        </div>
      </div>

      {/* Early filing discount: only show as an actionable CTA while the deadline is still ahead */}
      {showEarlyFilingDiscount && (
        <div className="mb-6 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl">
          <p className="text-green-700 dark:text-green-400 font-medium">
            {t('results:earlyFilingSave', { amount: fmt(result.totals.earlyFilingDiscount), symbol: sym })}
          </p>
          <p className="text-sm text-green-600 dark:text-green-500 mt-1">
            {t('results:earlyFilingDetail', { earlyDeadline: countryConfig?.earlyFilingDeadline, rate: `${((countryConfig?.earlyFilingDiscountRate ?? 0) * 100)}`, finalDeadline: countryConfig?.finalFilingDeadline })}
          </p>
        </div>
      )}

      {/* Carried prior-year positions (board #3 PR-3). Surfaces which positions
          seeded cost basis from a previous filing, so a carried number is never
          silent. CSV flow only (the PDF flow does not carry); empty otherwise. */}
      {carriedPositions.length > 0 && (
        <div className="card mb-6" data-testid="carried-positions">
          <div className="flex items-start gap-3 mb-4">
            <Coins className="w-5 h-5 text-accent dark:text-accent-light shrink-0 mt-1" />
            <div>
              <h2 className="text-xl font-semibold">{t('results:carriedPositionsTitle')}</h2>
              <p className="text-sm text-gray-600 dark:text-slate-400 mt-1">
                {t('results:carriedPositionsBody', {
                  count: carriedPositions.length,
                  year: carryForwardYear ?? taxYear - 1,
                })}
              </p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-navy-600">
                  <th className="text-left py-2 px-2 font-medium">{t('results:carriedPositionsColSecurity')}</th>
                  <th className="text-right py-2 px-2 font-medium">{t('results:carriedPositionsColShares')}</th>
                  <th className="text-right py-2 px-2 font-medium">{t('results:carriedPositionsColCost')}</th>
                </tr>
              </thead>
              <tbody>
                {carriedPositions.map((p) => (
                  <tr key={p.isin || p.ticker} className="border-b border-gray-100 dark:border-navy-700">
                    <td className="py-2 px-2">
                      <p className="font-medium">{p.ticker || p.isin}</p>
                      {p.securityName && (
                        <p className="text-xs text-gray-500 dark:text-slate-400 truncate max-w-[180px]">{p.securityName}</p>
                      )}
                    </td>
                    <td className="text-right py-2 px-2">{p.shares}</td>
                    <td className="text-right py-2 px-2">{fmt(p.costPerShareLocal)} {sym}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
                    <p className="text-xs text-gray-500 dark:text-slate-400 truncate max-w-[180px]">{sec.securityName}</p>
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
                  <td colSpan={9} className="py-8 text-center text-gray-500 dark:text-slate-400">
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

function SummaryCard({ icon, label, value, detail, color, highlight, testId }: {
  icon: React.ReactNode;
  label: string;
  value: string;
  detail?: string;
  color: string;
  highlight?: boolean;
  testId?: string;
}) {
  const bgMap: Record<string, string> = {
    green: 'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400',
    blue: 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400',
    purple: 'bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400',
    accent: 'bg-accent/10 text-accent dark:text-accent-light',
  };

  return (
    <div className={`card ${highlight ? 'ring-2 ring-accent' : ''}`}>
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center mb-3 ${bgMap[color] ?? bgMap.accent}`}>
        {icon}
      </div>
      <p className="text-sm text-gray-500 dark:text-slate-400">{label}</p>
      <p className="text-2xl font-bold mt-1" data-testid={testId}>{value}</p>
      {detail && <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">{detail}</p>}
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
