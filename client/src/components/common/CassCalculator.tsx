import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Calculator } from 'lucide-react';
import { useCountry } from '../../contexts/CountryContext';

interface CassCalcResult {
  /** Matched bracket label from the tax config: 'none' | '6x' | '12x' | '24x'. */
  label: string;
  /** Threshold base the contribution is computed on (0 below the first plafon). */
  base: number;
  /** CASS owed: the fixed amount for the matched bracket. */
  owed: number;
}

/** Human label for a non-zero CASS plafon, keyed by the config's bracket label. */
const PLAFON_LABELS: Record<string, string> = {
  '6x': '6 salarii minime',
  '12x': '12 salarii minime',
  '24x': '24 de salarii minime',
};

function parseRon(value: string): number {
  const parsed = parseFloat(value.replace(',', '.'));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

/** Whole-RON amount, Romanian style ('.' as thousands separator), e.g. 24300 -> "24.300". */
function formatRon(value: number): string {
  return Math.round(value).toLocaleString('en-US').replace(/,/g, '.');
}

/**
 * CASS-scoped quick calculator embedded in the /ghid/cass-investitii page. The
 * single most-misunderstood part of investor CASS is that the contribution is a
 * FIXED amount per plafon (the 6/12/24 x minimum-wage threshold base), not a
 * percentage of your actual income; this widget makes that concrete. It reads the
 * already-verified health-contribution brackets straight off the geo-detected
 * `countryConfig`, so every threshold + amount is config-driven (2025 values
 * today, auto-updating when the engine flips to 2026) and nothing is hardcoded
 * here. It surfaces ONLY the CASS obligation; the income tax on gains/dividends is
 * separate, so the result routes the user to the full calculator.
 */
export default function CassCalculator() {
  const { countryConfig } = useCountry();
  const [income, setIncome] = useState('');
  const [result, setResult] = useState<CassCalcResult | null>(null);
  const [error, setError] = useState('');

  if (!countryConfig) return null;

  // The first plafon (6 x minimum wage): the 'none' bracket's upper bound.
  const firstThreshold = countryConfig.healthContributionBrackets[0]?.maxIncome ?? 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const total = parseRon(income);
    if (total <= 0) {
      setError('Introdu totalul veniturilor tale non-salariale, în RON.');
      setResult(null);
      return;
    }
    const bracket = countryConfig.healthContributionBrackets.find(
      (b) => total >= b.minIncome && (b.maxIncome === null || total < b.maxIncome),
    );
    setError('');
    // The brackets always cover [0, infinity), so a match is guaranteed; fall back
    // to the no-CASS floor rather than crash if a future config ever leaves a gap.
    setResult(
      bracket
        ? { label: bracket.label, base: bracket.minIncome, owed: bracket.fixedAmount }
        : { label: 'none', base: 0, owed: 0 },
    );
  };

  return (
    <div className="card">
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <div>
          <label htmlFor="cass-calc-income" className="block text-sm font-medium mb-1.5">
            Total venituri non-salariale (RON)
          </label>
          <input
            id="cass-calc-income"
            type="text"
            inputMode="decimal"
            className="input"
            placeholder="0"
            value={income}
            onChange={(e) => setIncome(e.target.value)}
            autoComplete="off"
            aria-describedby="cass-calc-income-hint"
          />
          <p id="cass-calc-income-hint" className="text-xs text-gray-500 dark:text-slate-400 mt-1">
            Adună tot ce ai realizat non-salarial: câștigul net din titluri (pune 0 dacă ai ieșit pe pierdere),
            dividendele brute, dobânzile, chiriile și alte venituri, toate în RON.
          </p>
        </div>

        {error && (
          <p className="text-sm text-red-600 dark:text-red-400" role="alert">
            {error}
          </p>
        )}

        <button type="submit" className="btn-primary w-full inline-flex items-center justify-center gap-2">
          <Calculator className="w-4 h-4" />
          Calculează CASS
        </button>
      </form>

      {result && (
        <div
          className="mt-6 pt-5 border-t border-gray-200 dark:border-navy-700 space-y-2 text-sm"
          role="status"
          aria-live="polite"
          data-testid="cass-calc-result"
        >
          {result.label === 'none' ? (
            <p>
              Ești sub primul prag CASS (6 salarii minime = {formatRon(firstThreshold)} RON).{' '}
              <span className="font-bold">Nu datorezi CASS</span> pe veniturile non-salariale.
            </p>
          ) : (
            <>
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-slate-400">Pragul în care te încadrezi</span>
                <span>{PLAFON_LABELS[result.label] ?? result.label}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-slate-400">Bază de calcul</span>
                <span>{formatRon(result.base)} RON</span>
              </div>
              <div className="flex justify-between font-bold text-base border-t border-gray-200 dark:border-navy-700 pt-2">
                <span>CASS de plată</span>
                <span>{formatRon(result.owed)} RON</span>
              </div>
              <p className="text-xs text-gray-500 dark:text-slate-400 pt-1">
                Suma e fixă pe prag, nu un procent din venitul tău efectiv.
              </p>
            </>
          )}
          <p className="text-xs text-gray-500 dark:text-slate-400 pt-2">
            Acesta este doar CASS. Impozitul pe câștigurile din titluri și pe dividende se calculează separat.{' '}
            <Link to="/calculator" className="text-accent dark:text-accent-light underline hover:no-underline">
              Vezi calculatorul complet
            </Link>
            .
          </p>
        </div>
      )}
    </div>
  );
}
