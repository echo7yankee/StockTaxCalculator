import { useState } from 'react';
import { useCountry } from '../../contexts/CountryContext';
import { analytics } from '../../lib/analytics';
import { calculateQuickTax } from '@shared/engine/quickCalculator';
import type { QuickTaxResult } from '@shared/engine/quickCalculator';

/** Canonical product origin. The widget runs on third-party origins, so every
 *  link is absolute and opens a top-level tab (target="_blank"), never inside
 *  the host iframe. */
const SITE = 'https://investax.app';

export type EmbedTheme = 'light' | 'dark';

interface EmbedCalculatorProps {
  /** Visual theme. Defaults to 'light' (the safe choice on most embedding sites);
   *  a dark host can opt in via the `?theme=dark` query param on the iframe src. */
  theme?: EmbedTheme;
}

/** Human label for the matched CASS plafon, keyed by the engine's bracket label. */
const CASS_PLAFON_LABELS: Record<string, string> = {
  none: 'sub primul prag (fără CASS)',
  '6x': '6 salarii minime',
  '12x': '12 salarii minime',
  '24x': '24 de salarii minime',
};

function parseRon(value: string): number {
  const parsed = parseFloat(value.replace(',', '.'));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function formatRon(value: number): string {
  return value.toFixed(2).replace('.', ',');
}

/**
 * Self-contained, embeddable RO investment-tax calculator. This is the
 * distribution surface: it ships inside an <iframe> on third-party sites, so it
 * is deliberately decoupled from the app chrome and from the global theme.
 *
 * Theme is driven by the explicit `theme` prop (NOT the `dark` class, which the
 * ThemeProvider controls from the visitor's localStorage and is unpredictable
 * inside an embed), so every color is an explicit per-theme class with no `dark:`
 * variants. The tax math is the same shared, config-driven `calculateQuickTax`
 * the free /calculator uses, so rates are never hardcoded here (10% for tax year
 * 2025) and stay correct when the engine flips to 2026.
 */
export default function EmbedCalculator({ theme = 'light' }: EmbedCalculatorProps) {
  const { countryConfig } = useCountry();
  const [capitalGains, setCapitalGains] = useState('');
  const [dividends, setDividends] = useState('');
  const [withheld, setWithheld] = useState('');
  const [otherIncome, setOtherIncome] = useState('');
  const [result, setResult] = useState<QuickTaxResult | null>(null);
  const [error, setError] = useState('');

  if (!countryConfig) return null;

  const dark = theme === 'dark';
  const c = {
    text: dark ? 'text-slate-100' : 'text-gray-900',
    muted: dark ? 'text-slate-400' : 'text-gray-500',
    input: dark
      ? 'bg-navy-900 border-navy-600 text-slate-100 placeholder-slate-500 focus:border-accent-light'
      : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400 focus:border-accent',
    divider: dark ? 'border-navy-700' : 'border-gray-200',
    link: dark ? 'text-accent-light' : 'text-accent',
  };
  const inputClass = `w-full rounded-lg border px-3 py-2 text-sm outline-none transition-colors ${c.input}`;
  const cgRate = (countryConfig.capitalGainsTaxRate * 100).toFixed(0);
  const divRate = (countryConfig.dividendTaxRate * 100).toFixed(0);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const input = {
      capitalGains: parseRon(capitalGains),
      dividends: parseRon(dividends),
      withholdingTaxPaid: parseRon(withheld),
      otherNonSalaryIncome: parseRon(otherIncome),
    };
    if (input.capitalGains <= 0 && input.dividends <= 0 && input.otherNonSalaryIncome <= 0) {
      setError('Completează cel puțin un câștig, dividend sau alt venit (în RON).');
      setResult(null);
      return;
    }
    setError('');
    setResult(calculateQuickTax(input, countryConfig));
    analytics.embedCalculatorUsed();
  };

  return (
    <div className={`text-sm ${c.text}`}>
      <a
        href={SITE}
        target="_blank"
        rel="noopener"
        className={`inline-flex items-baseline gap-1.5 font-bold text-base ${c.text} no-underline`}
      >
        InvesTax
        <span className={`text-xs font-normal ${c.muted}`}>Calculator impozit investiții</span>
      </a>

      <form onSubmit={handleSubmit} className="mt-4 space-y-3" noValidate>
        <Field
          id="embed-calc-cg"
          label="Câștig net din titluri (RON)"
          value={capitalGains}
          onChange={setCapitalGains}
          className={inputClass}
        />
        <Field
          id="embed-calc-div"
          label="Dividende brute (RON)"
          value={dividends}
          onChange={setDividends}
          className={inputClass}
        />
        <Field
          id="embed-calc-wht"
          label="Reținere străină la sursă (RON)"
          value={withheld}
          onChange={setWithheld}
          className={inputClass}
        />
        <Field
          id="embed-calc-other"
          label="Alte venituri non-salariale (RON)"
          value={otherIncome}
          onChange={setOtherIncome}
          className={inputClass}
          hint="Chirii, dobânzi etc. Contează pentru pragul CASS."
          hintClass={c.muted}
        />

        {error && (
          <p className="text-xs text-red-500" role="alert">
            {error}
          </p>
        )}

        <button
          type="submit"
          className="w-full rounded-lg bg-accent hover:bg-accent-hover text-white font-medium py-2.5 transition-colors"
        >
          Calculează impozitul
        </button>
      </form>

      {result && (
        <div className={`mt-4 pt-4 border-t space-y-2 ${c.divider}`} role="status" aria-live="polite">
          <Line label={`Impozit câștiguri (${cgRate}%)`} value={result.capitalGainsTax} muted={c.muted} />
          <Line label={`Impozit dividende (${divRate}%)`} value={result.dividendTax} muted={c.muted} />
          <Line
            label={`CASS (${CASS_PLAFON_LABELS[result.bracketLabel] ?? result.bracketLabel})`}
            value={result.healthContribution}
            muted={c.muted}
          />
          <div className={`flex justify-between font-bold text-base border-t pt-2 ${c.divider}`}>
            <span>Total estimat de plată</span>
            <span>{formatRon(result.totalOwed)} RON</span>
          </div>
          <p className={`text-xs pt-1 ${c.muted}`}>
            Estimare orientativă pentru anul fiscal 2025, nu consiliere fiscală.
          </p>
        </div>
      )}

      <div className={`mt-4 pt-3 border-t ${c.divider}`}>
        <a
          href={`${SITE}/verifica-extras`}
          target="_blank"
          rel="noopener"
          className="block w-full text-center rounded-lg border border-accent text-accent hover:bg-accent hover:text-white font-medium py-2 text-sm transition-colors no-underline"
        >
          Verifică-ți extrasul complet pe InvesTax →
        </a>
        <p className={`text-xs text-center mt-2 ${c.muted}`}>
          Câștiguri pe metoda CMP, dividende cu credit fiscal, CASS, din extrasul tău Trading 212 / Revolut / IBKR.{' '}
          <a href={`${SITE}/calculator`} target="_blank" rel="noopener" className={`underline ${c.link}`}>
            Calculator complet
          </a>
        </p>
      </div>
    </div>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  className,
  hint,
  hintClass,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  className: string;
  hint?: string;
  hintClass?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-xs font-medium mb-1">
        {label}
      </label>
      <input
        id={id}
        type="text"
        inputMode="decimal"
        className={className}
        placeholder="0"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="off"
        aria-describedby={hint ? `${id}-hint` : undefined}
      />
      {hint && (
        <p id={`${id}-hint`} className={`text-xs mt-1 ${hintClass ?? ''}`}>
          {hint}
        </p>
      )}
    </div>
  );
}

function Line({ label, value, muted }: { label: string; value: number; muted: string }) {
  return (
    <div className="flex justify-between">
      <span className={muted}>{label}</span>
      <span>{formatRon(value)} RON</span>
    </div>
  );
}
