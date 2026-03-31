import { useNavigate } from 'react-router-dom';
import { ArrowLeft, TrendingUp, TrendingDown, DollarSign, Heart, Percent, FileText } from 'lucide-react';
import { useUpload } from '../contexts/UploadContext';
import { useCountry } from '../contexts/CountryContext';

export default function ResultsPage() {
  const navigate = useNavigate();
  const { taxResult, securities, fileName, taxYear, transactions } = useUpload();
  const { countryConfig } = useCountry();

  if (!taxResult) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-12">
        <h1 className="text-3xl font-bold mb-2">Tax Results</h1>
        <p className="text-gray-600 dark:text-slate-400 mb-8">
          Upload a CSV first to see your tax calculation results.
        </p>
        <div className="card text-center py-16">
          <p className="text-gray-500 dark:text-slate-500 text-lg">No calculations yet.</p>
          <p className="text-sm text-gray-400 dark:text-slate-600 mt-2">Upload your broker CSV to get started.</p>
          <button onClick={() => navigate('/upload')} className="btn-primary mt-6">
            Go to Upload
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
      <div className="flex items-center justify-between mb-8">
        <div>
          <button
            onClick={() => navigate('/upload')}
            className="flex items-center gap-1 text-sm text-gray-500 dark:text-slate-400 hover:text-accent mb-2 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Upload
          </button>
          <h1 className="text-3xl font-bold">Tax Results — {taxYear}</h1>
          <p className="text-gray-600 dark:text-slate-400 mt-1">
            <FileText className="w-4 h-4 inline mr-1" />
            {fileName} — {transactions.length} transactions
          </p>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <SummaryCard
          icon={<TrendingUp className="w-6 h-6" />}
          label="Capital Gains Tax"
          value={`${fmt(taxResult.capitalGains.taxOwed)} ${sym}`}
          detail={`${fmt(taxResult.capitalGains.netGains)} net gains @ ${(taxResult.capitalGains.taxRate * 100)}%`}
          color="green"
        />
        <SummaryCard
          icon={<DollarSign className="w-6 h-6" />}
          label="Dividend Tax"
          value={`${fmt(taxResult.dividends.taxOwed)} ${sym}`}
          detail={`${fmt(taxResult.dividends.grossTotal)} gross — ${fmt(taxResult.dividends.withholdingTaxPaid)} withholding`}
          color="blue"
        />
        <SummaryCard
          icon={<Heart className="w-6 h-6" />}
          label="Health Contribution (CASS)"
          value={`${fmt(taxResult.healthContribution.amountOwed)} ${sym}`}
          detail={`Bracket: ${taxResult.healthContribution.thresholdHit} (${fmt(taxResult.healthContribution.totalNonSalaryIncome)} income)`}
          color="purple"
        />
        <SummaryCard
          icon={<Percent className="w-6 h-6" />}
          label="Total Tax Owed"
          value={`${fmt(taxResult.totals.totalTaxOwed)} ${sym}`}
          detail={`After early filing discount: ${fmt(taxResult.totals.totalAfterDiscount)} ${sym}`}
          color="accent"
          highlight
        />
      </div>

      {/* Capital gains breakdown */}
      <div className="card mb-6">
        <h2 className="text-xl font-semibold mb-4">Capital Gains Breakdown</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
          <Stat label="Total Proceeds" value={`${fmt(taxResult.capitalGains.totalProceeds)} ${sym}`} />
          <Stat label="Total Cost Basis" value={`${fmt(taxResult.capitalGains.totalCostBasis)} ${sym}`} />
          <Stat label="Net Gains" value={`${fmt(taxResult.capitalGains.netGains)} ${sym}`} positive />
          <Stat label="Losses" value={`${fmt(taxResult.capitalGains.losses)} ${sym}`} negative={taxResult.capitalGains.losses > 0} />
        </div>
      </div>

      {/* Early filing discount */}
      {taxResult.totals.earlyFilingDiscount > 0 && (
        <div className="mb-6 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl">
          <p className="text-green-700 dark:text-green-400 font-medium">
            File early to save {fmt(taxResult.totals.earlyFilingDiscount)} {sym}!
          </p>
          <p className="text-sm text-green-600 dark:text-green-500 mt-1">
            Submit by {countryConfig?.earlyFilingDeadline} for a {((countryConfig?.earlyFilingDiscountRate ?? 0) * 100)}% discount.
            Final deadline: {countryConfig?.finalFilingDeadline}.
          </p>
        </div>
      )}

      {/* Per-security table */}
      <div className="card">
        <h2 className="text-xl font-semibold mb-4">Per-Security Breakdown</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-navy-600">
                <th className="text-left py-3 px-2 font-medium">Security</th>
                <th className="text-right py-3 px-2 font-medium">Bought</th>
                <th className="text-right py-3 px-2 font-medium">Sold</th>
                <th className="text-right py-3 px-2 font-medium">Remaining</th>
                <th className="text-right py-3 px-2 font-medium">Avg Cost</th>
                <th className="text-right py-3 px-2 font-medium">Proceeds</th>
                <th className="text-right py-3 px-2 font-medium">Cost Basis</th>
                <th className="text-right py-3 px-2 font-medium">Gain/Loss</th>
                <th className="text-right py-3 px-2 font-medium">Dividends</th>
              </tr>
            </thead>
            <tbody>
              {securities.map((sec) => (
                <tr key={sec.isin || sec.ticker} className="border-b border-gray-100 dark:border-navy-700 hover:bg-gray-50 dark:hover:bg-navy-750">
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
                    No securities with activity in {taxYear}.
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
