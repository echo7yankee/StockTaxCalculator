import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Upload, Calculator, FileText, Trash2, ClipboardList, LogIn, Loader2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useUpload } from '../contexts/UploadContext';
import type { TaxCalculationResult, SecurityBreakdown } from '@shared/types/tax';

interface SavedTaxYear {
  id: string;
  year: number;
  country: string;
  totalTaxOwed: number | null;
  capitalGainsTax: number | null;
  dividendTaxOwed: number | null;
  cassOwed: number | null;
  earlyFilingDiscount: number | null;
  calculatedAt: string | null;
  fileName: string | null;
  broker: string | null;
}

export default function Dashboard() {
  const { user, loading: authLoading } = useAuth();
  const { setUploadData } = useUpload();
  const navigate = useNavigate();
  const [taxYears, setTaxYears] = useState<SavedTaxYear[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    fetch('/api/tax-years', { credentials: 'include' })
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch');
        return res.json();
      })
      .then(data => setTaxYears(data))
      .catch(() => setError('Could not load saved calculations. Is the server running?'))
      .finally(() => setLoading(false));
  }, [user]);

  const handleRowClick = async (ty: SavedTaxYear) => {
    setLoadingId(ty.id);
    try {
      const res = await fetch(`/api/tax-years/${ty.id}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load');
      const data = await res.json();
      const calc = data.calculation;
      if (!calc) throw new Error('No calculation data');

      const taxResult: TaxCalculationResult = {
        taxYearId: data.id,
        capitalGains: {
          totalProceeds: calc.totalCapitalGains ?? 0,
          totalCostBasis: (calc.totalCapitalGains ?? 0) - (calc.netCapitalGains ?? 0),
          netGains: calc.netCapitalGains ?? 0,
          losses: calc.totalCapitalLosses ?? 0,
          taxRate: 0.10,
          taxOwed: calc.capitalGainsTax ?? 0,
        },
        dividends: {
          grossTotal: calc.totalDividendsGross ?? 0,
          withholdingTaxPaid: calc.totalWithholdingTax ?? 0,
          taxOwed: calc.dividendTaxOwed ?? 0,
        },
        healthContribution: {
          totalNonSalaryIncome: calc.totalNonSalaryIncome ?? 0,
          thresholdHit: calc.cassThresholdHit ?? 'none',
          amountOwed: calc.cassOwed ?? 0,
        },
        totals: {
          totalTaxOwed: calc.totalTaxOwed ?? 0,
          earlyFilingDiscount: calc.earlyFilingDiscount ?? 0,
          totalAfterDiscount: (calc.totalTaxOwed ?? 0) - (calc.earlyFilingDiscount ?? 0),
        },
        calculatedAt: new Date(calc.calculatedAt),
      };

      const securities: SecurityBreakdown[] = (calc.securities ?? []).map((sec: any) => ({
        isin: sec.isin ?? '',
        ticker: sec.ticker ?? '',
        securityName: sec.securityName ?? '',
        totalBoughtShares: sec.totalBoughtShares ?? 0,
        totalSoldShares: sec.totalSoldShares ?? 0,
        remainingShares: sec.remainingShares ?? 0,
        weightedAvgCostLocal: sec.weightedAvgCost ?? 0,
        totalProceeds: sec.totalProceeds ?? 0,
        totalCostBasis: sec.totalCostBasis ?? 0,
        realizedGainLoss: sec.realizedGainLoss ?? 0,
        totalDividends: sec.totalDividends ?? 0,
        totalWithholdingTax: sec.totalWithholdingTax ?? 0,
      }));

      setUploadData({
        taxResult,
        securities,
        taxYear: data.year,
        fileName: data.csvUploads?.[0]?.filename ?? '',
        transactions: [],
      });

      navigate('/results');
    } catch {
      setError('Failed to load calculation.');
    } finally {
      setLoadingId(null);
    }
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    try {
      const res = await fetch(`/api/tax-years/${id}`, { method: 'DELETE', credentials: 'include' });
      if (!res.ok) throw new Error('Delete failed');
      setTaxYears(prev => prev.filter(ty => ty.id !== id));
    } catch {
      // silently fail
    }
  };

  const fmt = (n: number | null) =>
    n != null ? n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-';

  return (
    <div className="max-w-7xl mx-auto px-4 py-12">
      <h1 className="text-3xl font-bold mb-2">Dashboard</h1>
      <p className="text-gray-600 dark:text-slate-400 mb-8">
        Manage your tax years and calculations.
      </p>

      {/* Quick actions */}
      <div className="grid md:grid-cols-3 gap-6 mb-10">
        <Link to="/upload" className="card hover:border-accent transition-colors group">
          <Upload className="w-8 h-8 text-accent mb-3" />
          <h3 className="text-lg font-semibold mb-1 group-hover:text-accent transition-colors">Upload Statement</h3>
          <p className="text-sm text-gray-600 dark:text-slate-400">Import PDF or CSV from your broker</p>
        </Link>

        <Link to="/calculator" className="card hover:border-accent transition-colors group">
          <Calculator className="w-8 h-8 text-accent mb-3" />
          <h3 className="text-lg font-semibold mb-1 group-hover:text-accent transition-colors">Quick Calculator</h3>
          <p className="text-sm text-gray-600 dark:text-slate-400">Estimate taxes manually</p>
        </Link>

        <Link to="/filing-guide" className="card hover:border-accent transition-colors group">
          <ClipboardList className="w-8 h-8 text-accent mb-3" />
          <h3 className="text-lg font-semibold mb-1 group-hover:text-accent transition-colors">Filing Guide</h3>
          <p className="text-sm text-gray-600 dark:text-slate-400">Step-by-step tax form filing helper</p>
        </Link>
      </div>

      {/* Saved calculations */}
      <div className="card">
        <h2 className="text-xl font-semibold mb-4">Saved Calculations</h2>

        {/* Not logged in — soft prompt */}
        {!authLoading && !user && (
          <div className="py-12 text-center">
            <LogIn className="w-10 h-10 text-gray-300 dark:text-slate-600 mx-auto mb-3" />
            <p className="text-gray-500 dark:text-slate-500 text-lg">Log in to see saved calculations</p>
            <p className="text-sm text-gray-400 dark:text-slate-600 mt-1">
              Your calculations are saved to your account so you can access them anytime.
            </p>
            <div className="flex gap-3 justify-center mt-6">
              <Link to="/login" className="btn-primary">Log in</Link>
              <Link to="/signup" className="btn-secondary">Sign up</Link>
            </div>
          </div>
        )}

        {/* Logged in — loading */}
        {user && loading && (
          <div className="py-12 text-center">
            <div className="w-8 h-8 border-4 border-accent border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-gray-500 dark:text-slate-500">Loading...</p>
          </div>
        )}

        {/* Logged in — error */}
        {user && error && !loading && (
          <p className="py-8 text-center text-red-500">{error}</p>
        )}

        {/* Logged in — empty */}
        {user && !loading && !error && taxYears.length === 0 && (
          <div className="py-12 text-center">
            <FileText className="w-10 h-10 text-gray-300 dark:text-slate-600 mx-auto mb-3" />
            <p className="text-gray-500 dark:text-slate-500">No saved calculations yet.</p>
            <p className="text-sm text-gray-400 dark:text-slate-600 mt-1">
              Upload a statement and save the results to see them here.
            </p>
          </div>
        )}

        {/* Logged in — data */}
        {user && !loading && taxYears.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-navy-600">
                  <th className="text-left py-3 px-2 font-medium">Year</th>
                  <th className="text-left py-3 px-2 font-medium">File</th>
                  <th className="text-right py-3 px-2 font-medium">Capital Gains Tax</th>
                  <th className="text-right py-3 px-2 font-medium">Dividend Tax</th>
                  <th className="text-right py-3 px-2 font-medium">CASS</th>
                  <th className="text-right py-3 px-2 font-medium">Total Tax</th>
                  <th className="text-right py-3 px-2 font-medium">Calculated</th>
                  <th className="text-right py-3 px-2 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {taxYears.map(ty => (
                  <tr
                    key={ty.id}
                    onClick={() => handleRowClick(ty)}
                    className="border-b border-gray-100 dark:border-navy-700 hover:bg-navy-700/50 cursor-pointer transition-colors"
                  >
                    <td className="py-3 px-2 font-bold text-lg">
                      {loadingId === ty.id ? <Loader2 className="w-5 h-5 animate-spin text-accent" /> : ty.year}
                    </td>
                    <td className="py-3 px-2">
                      <p className="text-gray-600 dark:text-slate-400 truncate max-w-[180px]">{ty.fileName || '-'}</p>
                    </td>
                    <td className="text-right py-3 px-2">{fmt(ty.capitalGainsTax)}</td>
                    <td className="text-right py-3 px-2">{fmt(ty.dividendTaxOwed)}</td>
                    <td className="text-right py-3 px-2">{fmt(ty.cassOwed)}</td>
                    <td className="text-right py-3 px-2 font-bold text-accent">{fmt(ty.totalTaxOwed)}</td>
                    <td className="text-right py-3 px-2 text-gray-500 dark:text-slate-500 text-xs">
                      {ty.calculatedAt ? new Date(ty.calculatedAt).toLocaleDateString() : '-'}
                    </td>
                    <td className="text-right py-3 px-2">
                      <button
                        onClick={(e) => handleDelete(e, ty.id)}
                        className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
