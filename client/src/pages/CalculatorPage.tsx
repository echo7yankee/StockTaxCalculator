import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCountry } from '../contexts/CountryContext';
import PageMeta from '../components/common/PageMeta';
import { analytics } from '../lib/analytics';
import { calculateQuickTax } from '@shared/engine/quickCalculator';
import type { QuickTaxResult } from '@shared/engine/quickCalculator';
import type { ManualCalculatorInput } from '@shared/types/tax';

export default function CalculatorPage() {
  const { t } = useTranslation(['calculator', 'common']);
  const { countryConfig } = useCountry();
  const [input, setInput] = useState<ManualCalculatorInput>({
    capitalGains: 0,
    dividends: 0,
    withholdingTaxPaid: 0,
    otherNonSalaryIncome: 0,
    country: 'RO',
  });
  const [result, setResult] = useState<QuickTaxResult | null>(null);
  const [error, setError] = useState('');

  if (!countryConfig) return <div className="p-8 text-center">{t('countryNotSupported')}</div>;

  const handleCalculate = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const hasInput = input.capitalGains !== 0 || input.dividends !== 0 || input.otherNonSalaryIncome !== 0;
    if (!hasInput) {
      setError(t('noInputError'));
      return;
    }

    setResult(calculateQuickTax(input, countryConfig));
    analytics.calculatorUsed();
  };

  const updateField = (field: keyof ManualCalculatorInput, value: string) => {
    const parsed = value.replace(',', '.');
    setInput(prev => ({ ...prev, [field]: parseFloat(parsed) || 0 }));
    if (error) setError('');
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-12">
      <PageMeta titleKey="calculatorTitle" descriptionKey="calculatorDesc" />
      <h1 className="text-3xl font-bold mb-2">{t('title')}</h1>
      <p className="text-gray-600 dark:text-slate-400 mb-8">
        {t('subtitle')}
      </p>

      <p className="text-xs text-gray-500 dark:text-slate-400 mb-6">
        {t('common:taxRulesUpdated')}
      </p>

      {error && (
        <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg" role="alert">
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}

      <form onSubmit={handleCalculate} className="card space-y-5">
        <div>
          <label htmlFor="calc-capital-gains" className="block text-sm font-medium mb-1.5">{t('netCapitalGains', { currency: countryConfig.currency })}</label>
          <input
            id="calc-capital-gains"
            type="text"
            inputMode="decimal"
            className="input"
            placeholder="0"
            onChange={e => updateField('capitalGains', e.target.value)}
            autoComplete="off"
          />
        </div>
        <div>
          <label htmlFor="calc-dividends" className="block text-sm font-medium mb-1.5">{t('grossDividends', { currency: countryConfig.currency })}</label>
          <input
            id="calc-dividends"
            type="text"
            inputMode="decimal"
            className="input"
            placeholder="0"
            onChange={e => updateField('dividends', e.target.value)}
            autoComplete="off"
          />
        </div>
        <div>
          <label htmlFor="calc-withholding" className="block text-sm font-medium mb-1.5">{t('withholdingTaxPaid', { currency: countryConfig.currency })}</label>
          <input
            id="calc-withholding"
            type="text"
            inputMode="decimal"
            className="input"
            placeholder="0"
            onChange={e => updateField('withholdingTaxPaid', e.target.value)}
            autoComplete="off"
          />
        </div>
        <div>
          <label htmlFor="calc-other-income" className="block text-sm font-medium mb-1.5">{t('otherNonSalaryIncome', { currency: countryConfig.currency })}</label>
          <input
            id="calc-other-income"
            type="text"
            inputMode="decimal"
            className="input"
            placeholder="0"
            onChange={e => updateField('otherNonSalaryIncome', e.target.value)}
            autoComplete="off"
            aria-describedby="calc-other-income-hint"
          />
          <p id="calc-other-income-hint" className="text-xs text-gray-500 dark:text-slate-400 mt-1">{t('otherIncomeHint')}</p>
        </div>
        <button type="submit" className="btn-primary w-full text-lg py-3">
          {t('calculate')}
        </button>
      </form>

      {result && (
        <div className="card mt-8 space-y-4">
          <h2 className="text-xl font-bold">{t('results')}</h2>
          <div className="space-y-3">
            <Row label={t('capitalGainsTax', { rate: `${(countryConfig.capitalGainsTaxRate * 100).toFixed(0)}%` })} amount={result.capitalGainsTax} currency={countryConfig.currency} />
            <Row label={t('dividendTax', { rate: `${(countryConfig.dividendTaxRate * 100).toFixed(0)}%` })} amount={result.dividendTax} currency={countryConfig.currency} />
            <Row label={t('healthContribution', { bracket: result.bracketLabel })} amount={result.healthContribution} currency={countryConfig.currency} />
            <div className="border-t border-gray-200 dark:border-navy-500 pt-3">
              <Row label={t('totalTaxOwed')} amount={result.totalOwed} currency={countryConfig.currency} bold />
            </div>
            <div className="text-sm text-green-600 dark:text-green-400">
              {t('earlyFilingDiscount', { deadline: countryConfig.earlyFilingDeadline, amount: result.earlyFilingDiscount.toFixed(2), currency: countryConfig.currency, rate: (countryConfig.earlyFilingDiscountRate * 100).toFixed(0) })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, amount, currency, bold }: { label: string; amount: number; currency: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? 'font-bold text-lg' : ''}`}>
      <span className="text-gray-600 dark:text-slate-400">{label}</span>
      <span>{amount.toFixed(2)} {currency}</span>
    </div>
  );
}
