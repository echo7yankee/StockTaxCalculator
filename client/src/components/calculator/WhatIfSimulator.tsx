import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cassBracketLabelKey } from '../../utils/cassBracket';
import { analytics } from '../../lib/analytics';
import { calculateQuickTax } from '@shared/engine/quickCalculator';
import type { QuickTaxResult } from '@shared/engine/quickCalculator';
import type { CountryTaxConfig } from '@shared/types/country';

interface ScenarioInput {
  capitalGains: number;
  dividends: number;
  withholdingTaxPaid: number;
  otherNonSalaryIncome: number;
}

const EMPTY_SCENARIO: ScenarioInput = {
  capitalGains: 0,
  dividends: 0,
  withholdingTaxPaid: 0,
  otherNonSalaryIncome: 0,
};

type ScenarioKey = 'A' | 'B';

/**
 * Free, client-side "what-if" comparison layered on top of the single
 * calculator. It runs the SAME free `calculateQuickTax` engine for two
 * scenarios and shows the tax difference, with a callout when the two scenarios
 * land in different CASS brackets (the step-function cliff). Everything is
 * derived from `countryConfig` / the engine result, so no tax number is
 * hardcoded here.
 */
export default function WhatIfSimulator({ countryConfig }: { countryConfig: CountryTaxConfig }) {
  const { t } = useTranslation(['calculator', 'common']);
  const [open, setOpen] = useState(false);
  const [scenarioA, setScenarioA] = useState<ScenarioInput>(EMPTY_SCENARIO);
  const [scenarioB, setScenarioB] = useState<ScenarioInput>(EMPTY_SCENARIO);
  const [resultA, setResultA] = useState<QuickTaxResult | null>(null);
  const [resultB, setResultB] = useState<QuickTaxResult | null>(null);
  const [error, setError] = useState('');

  const isAllZero = (s: ScenarioInput) =>
    s.capitalGains === 0 && s.dividends === 0 && s.otherNonSalaryIncome === 0;

  const setScenario = (key: ScenarioKey) => (key === 'A' ? setScenarioA : setScenarioB);

  const updateField = (key: ScenarioKey, field: keyof ScenarioInput, value: string) => {
    const parsed = parseFloat(value.replace(',', '.')) || 0;
    setScenario(key)(prev => ({ ...prev, [field]: parsed }));
    if (error) setError('');
  };

  const handleCompare = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (isAllZero(scenarioA) && isAllZero(scenarioB)) {
      setError(t('noInputError'));
      setResultA(null);
      setResultB(null);
      return;
    }

    setResultA(calculateQuickTax(scenarioA, countryConfig));
    setResultB(calculateQuickTax(scenarioB, countryConfig));
    analytics.calculatorUsed();
  };

  const currency = countryConfig.currency;
  const showResults = resultA !== null && resultB !== null;
  const bracketDiffers = showResults && resultA.bracketLabel !== resultB.bracketLabel;
  const cassLumpDiff = showResults ? resultB.healthContribution - resultA.healthContribution : 0;
  const higherIsB = cassLumpDiff >= 0;

  return (
    <div className="mt-6">
      <button
        type="button"
        onClick={() => setOpen(prev => !prev)}
        aria-expanded={open}
        aria-controls="what-if-panel"
        className="btn-secondary w-full"
      >
        {t('whatIfToggle')}
      </button>

      {open && (
        <div id="what-if-panel" className="card mt-4 space-y-6">
          <div>
            <h2 className="text-xl font-bold mb-1">{t('whatIfHeading')}</h2>
            <p className="text-sm text-gray-600 dark:text-slate-400">{t('whatIfIntro')}</p>
          </div>

          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg" role="alert">
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}

          <form onSubmit={handleCompare} className="space-y-6">
            <div className="grid gap-6 sm:grid-cols-2">
              <ScenarioColumn
                scenarioKey="A"
                heading={t('scenarioA')}
                currency={currency}
                onChange={updateField}
              />
              <ScenarioColumn
                scenarioKey="B"
                heading={t('scenarioB')}
                currency={currency}
                onChange={updateField}
              />
            </div>
            <button type="submit" className="btn-primary w-full">
              {t('compare')}
            </button>
          </form>

          {showResults && (
            <div className="space-y-4">
              <div className="grid grid-cols-4 gap-2 text-sm font-medium text-gray-500 dark:text-slate-400 border-b border-gray-200 dark:border-navy-500 pb-2">
                <span />
                <span className="text-right">{t('scenarioA')}</span>
                <span className="text-right">{t('scenarioB')}</span>
                <span className="text-right">{t('differenceHeader')}</span>
              </div>

              <ComparisonRow
                label={t('capitalGainsTax', { rate: (countryConfig.capitalGainsTaxRate * 100).toFixed(0) })}
                a={resultA.capitalGainsTax}
                b={resultB.capitalGainsTax}
                currency={currency}
              />
              <ComparisonRow
                label={t('dividendTax', { rate: (countryConfig.dividendTaxRate * 100).toFixed(0) })}
                a={resultA.dividendTax}
                b={resultB.dividendTax}
                currency={currency}
              />
              <ComparisonRow
                label={t('healthContribution', { bracket: t(cassBracketLabelKey(resultA.bracketLabel)) })}
                a={resultA.healthContribution}
                b={resultB.healthContribution}
                currency={currency}
              />
              <div className="border-t border-gray-200 dark:border-navy-500 pt-3">
                <ComparisonRow
                  label={t('totalTaxOwed')}
                  a={resultA.totalOwed}
                  b={resultB.totalOwed}
                  currency={currency}
                  emphasizeDelta
                />
              </div>

              {bracketDiffers && (
                <div
                  className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700 rounded-lg"
                  role="note"
                >
                  <p className="text-sm text-amber-800 dark:text-amber-300">
                    {t('cassCliffCallout', {
                      scenario: higherIsB ? t('scenarioB') : t('scenarioA'),
                      other: higherIsB ? t('scenarioA') : t('scenarioB'),
                      bracket: t(cassBracketLabelKey(higherIsB ? resultB.bracketLabel : resultA.bracketLabel)),
                      amount: Math.abs(cassLumpDiff).toFixed(2),
                      currency,
                    })}
                  </p>
                </div>
              )}

              <p className="text-xs text-gray-500 dark:text-slate-400">{t('cassStepExplainer')}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ScenarioColumn({
  scenarioKey,
  heading,
  currency,
  onChange,
}: {
  scenarioKey: ScenarioKey;
  heading: string;
  currency: string;
  onChange: (key: ScenarioKey, field: keyof ScenarioInput, value: string) => void;
}) {
  const { t } = useTranslation('calculator');
  const idFor = (field: string) => `whatif-${scenarioKey.toLowerCase()}-${field}`;

  const fields: { field: keyof ScenarioInput; labelKey: string }[] = [
    { field: 'capitalGains', labelKey: 'netCapitalGains' },
    { field: 'dividends', labelKey: 'grossDividends' },
    { field: 'withholdingTaxPaid', labelKey: 'withholdingTaxPaid' },
    { field: 'otherNonSalaryIncome', labelKey: 'otherNonSalaryIncome' },
  ];

  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-bold mb-1">{heading}</legend>
      {fields.map(({ field, labelKey }) => (
        <div key={field}>
          <label htmlFor={idFor(field)} className="block text-xs font-medium mb-1">
            {t(labelKey, { currency })}
          </label>
          <input
            id={idFor(field)}
            type="text"
            inputMode="decimal"
            className="input"
            placeholder="0"
            onChange={e => onChange(scenarioKey, field, e.target.value)}
            autoComplete="off"
          />
        </div>
      ))}
    </fieldset>
  );
}

function ComparisonRow({
  label,
  a,
  b,
  currency,
  emphasizeDelta,
}: {
  label: string;
  a: number;
  b: number;
  currency: string;
  emphasizeDelta?: boolean;
}) {
  const delta = b - a;
  const sign = delta > 0 ? '+' : '';
  return (
    <div className="grid grid-cols-4 gap-2 text-sm">
      <span className={`text-gray-600 dark:text-slate-400 ${emphasizeDelta ? 'font-bold' : ''}`}>{label}</span>
      <span className="text-right">{a.toFixed(2)} {currency}</span>
      <span className="text-right">{b.toFixed(2)} {currency}</span>
      <span className={`text-right ${emphasizeDelta ? 'font-bold text-lg' : ''}`}>
        {sign}{delta.toFixed(2)} {currency}
      </span>
    </div>
  );
}
