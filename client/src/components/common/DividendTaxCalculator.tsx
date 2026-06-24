import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Calculator } from 'lucide-react';
import { useCountry } from '../../contexts/CountryContext';
import { calculateQuickTax } from '@shared/engine/quickCalculator';

interface DividendCalcResult {
  grossTax: number;
  credit: number;
  owed: number;
}

function parseRon(value: string): number {
  const parsed = parseFloat(value.replace(',', '.'));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function formatRon(value: number): string {
  return value.toFixed(2).replace('.', ',');
}

/**
 * Dividend-scoped quick calculator embedded in the /ghid/dividende-broker-strain
 * page. Reuses the shared, already-verified `calculateQuickTax` dividend path and
 * the geo-detected `countryConfig`, so the rate is config-driven (10% for tax year
 * 2025) and never hardcoded here, so it auto-updates when the engine flips to 2026.
 * Surfaces ONLY the dividend obligation; CASS depends on total non-salary income,
 * so the result routes the user to the full calculator for that.
 */
export default function DividendTaxCalculator() {
  const { countryConfig } = useCountry();
  const [gross, setGross] = useState('');
  const [withheld, setWithheld] = useState('');
  const [result, setResult] = useState<DividendCalcResult | null>(null);
  const [error, setError] = useState('');

  if (!countryConfig) return null;

  const ratePct = (countryConfig.dividendTaxRate * 100).toFixed(0);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const grossRon = parseRon(gross);
    if (grossRon <= 0) {
      setError('Introdu suma brută a dividendelor, în RON.');
      setResult(null);
      return;
    }
    const withheldRon = parseRon(withheld);
    const quick = calculateQuickTax(
      { capitalGains: 0, dividends: grossRon, withholdingTaxPaid: withheldRon, otherNonSalaryIncome: 0 },
      countryConfig,
    );
    const grossTax = grossRon * countryConfig.dividendTaxRate;
    setError('');
    setResult({ grossTax, credit: Math.min(withheldRon, grossTax), owed: quick.dividendTax });
  };

  return (
    <div className="card">
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <div>
          <label htmlFor="div-calc-gross" className="block text-sm font-medium mb-1.5">
            Dividend brut (RON)
          </label>
          <input
            id="div-calc-gross"
            type="text"
            inputMode="decimal"
            className="input"
            placeholder="0"
            value={gross}
            onChange={(e) => setGross(e.target.value)}
            autoComplete="off"
            aria-describedby="div-calc-gross-hint"
          />
          <p id="div-calc-gross-hint" className="text-xs text-gray-500 dark:text-slate-400 mt-1">
            Suma brută totală, convertită în RON la cursul mediu anual BNR (Codul Fiscal art. 131 alin. 6).
          </p>
        </div>

        <div>
          <label htmlFor="div-calc-withheld" className="block text-sm font-medium mb-1.5">
            Reținere străină (RON)
          </label>
          <input
            id="div-calc-withheld"
            type="text"
            inputMode="decimal"
            className="input"
            placeholder="0"
            value={withheld}
            onChange={(e) => setWithheld(e.target.value)}
            autoComplete="off"
            aria-describedby="div-calc-withheld-hint"
          />
          <p id="div-calc-withheld-hint" className="text-xs text-gray-500 dark:text-slate-400 mt-1">
            Cât ți-a reținut deja brokerul la sursă, în RON la același curs. Lasă 0 dacă nu s-a reținut nimic.
          </p>
        </div>

        {error && (
          <p className="text-sm text-red-600 dark:text-red-400" role="alert">
            {error}
          </p>
        )}

        <button type="submit" className="btn-primary w-full inline-flex items-center justify-center gap-2">
          <Calculator className="w-4 h-4" />
          Calculează impozitul
        </button>
      </form>

      {result && (
        <div
          className="mt-6 pt-5 border-t border-gray-200 dark:border-navy-700 space-y-2 text-sm"
          role="status"
          aria-live="polite"
        >
          <div className="flex justify-between">
            <span className="text-gray-600 dark:text-slate-400">Impozit RO pe brut ({ratePct}%)</span>
            <span>{formatRon(result.grossTax)} RON</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600 dark:text-slate-400">Credit pentru reținerea străină</span>
            {/* No leading minus when the credit rounds to zero (avoids a misleading "-0,00 RON"
                in the common no-foreign-withholding case, e.g. UK / Irish-domiciled ETFs). */}
            <span>{Math.round(result.credit * 100) > 0 ? '-' : ''}{formatRon(result.credit)} RON</span>
          </div>
          <div className="flex justify-between font-bold text-base border-t border-gray-200 dark:border-navy-700 pt-2">
            <span>De plătit în România</span>
            <span>{formatRon(result.owed)} RON</span>
          </div>
          <p className="text-xs text-gray-500 dark:text-slate-400 pt-2">
            Acesta este doar impozitul pe dividende. CASS (contribuția de sănătate) se calculează separat, pe totalul
            veniturilor tale non-salariale.{' '}
            <Link to="/calculator" className="text-accent dark:text-accent-light underline hover:no-underline">
              Vezi calculatorul complet cu CASS
            </Link>
            .
          </p>
        </div>
      )}
    </div>
  );
}
