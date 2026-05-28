import { getCurrentTaxYearConfig } from '@shared/taxRules/taxYears';

/**
 * Interpolation variables for year-dynamic user-facing copy.
 *
 * Reads the current engine-supported tax year config (see
 * `shared/src/taxRules/taxYears.ts`) so copy keyed on `{{taxYear}}` /
 * `{{filingDeadline}}` flips automatically once a new tax year becomes
 * engine-supported, with no per-string edits. Today the config resolves to
 * the 2025 entry via the `engineSupported` fallback, so the rendered output is
 * byte-identical to the previously hardcoded copy. Backlog item #17.
 */
export function taxYearInterpVars(language: string): { taxYear: number; filingDeadline: string } {
  const config = getCurrentTaxYearConfig();
  const isRo = language.startsWith('ro');
  return {
    taxYear: config.taxYear,
    filingDeadline: isRo ? config.filingDeadlineRo : config.filingDeadlineEn,
  };
}
