import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCountry } from '../contexts/CountryContext';
import { calculateQuickTax } from '@shared/engine/quickCalculator';
import type { QuickTaxResult } from '@shared/engine/quickCalculator';
import type { ManualCalculatorInput } from '@shared/types/tax';

export default function CalculatorPage() {
  const { t } = useTranslation('calculator');
  const { countryConfig } = useCountry();
  const [input, setInput] = useState<ManualCalculatorInput>({
    capitalGains: 0,
    dividends: 0,
    withholdingTaxPaid: 0,
    otherNonSalaryIncome: 0,
    country: 'RO',
  });
  const [result, setResult] = useState<QuickTaxResult | null>(null);

  if (!countryConfig) return <div className="p-8 text-center">{t('countryNotSupported')}</div>;

  const handleCalculate = () => {
    setResult(calculateQuickTax(input, countryConfig));
  };

  const updateField = (field: keyof ManualCalculatorInput, value: string) => {
    setInput(prev => ({ ...prev, [field]: parseFloat(value) || 0 }));
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-12">
      <h1 className="text-3xl font-bold mb-2">{t('title')}</h1>
      <p className="text-gray-600 dark:text-slate-400 mb-8">
        {t('subtitle')}
      </p>

      <div className="card space-y-5">
        <div>
          <label className="block text-sm font-medium mb-1.5">{t('netCapitalGains', { currency: countryConfig.currency })}</label>
          <input type="number" className="input" placeholder="0" onChange={e => updateField('capitalGains', e.target.value)} />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1.5">{t('grossDividends', { currency: countryConfig.currency })}</label>
          <input type="number" className="input" placeholder="0" onChange={e => updateField('dividends', e.target.value)} />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1.5">{t('withholdingTaxPaid', { currency: countryConfig.currency })}</label>
          <input type="number" className="input" placeholder="0" onChange={e => updateField('withholdingTaxPaid', e.target.value)} />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1.5">{t('otherNonSalaryIncome', { currency: countryConfig.currency })}</label>
          <input type="number" className="input" placeholder="0" onChange={e => updateField('otherNonSalaryIncome', e.target.value)} />
          <p className="text-xs text-gray-500 dark:text-slate-500 mt-1">{t('otherIncomeHint')}</p>
        </div>
        <button onClick={handleCalculate} className="btn-primary w-full text-lg py-3">
          {t('calculate')}
        </button>
      </div>

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
