import {
  getCurrentTaxYearConfig,
  getTaxYearConfig,
  getLatestEngineSupportedConfig,
} from '@shared/taxRules/taxYears';

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

/**
 * Like {@link taxYearInterpVars} but pinned to a specific income year, for surfaces
 * tied to one statement (e.g. a results page for an uploaded 2024 statement). The
 * disclaimer then names the statement's year instead of the current engine year,
 * which matters most for the prior-year (notificare) audience: a 2024 result that
 * footnotes "valabil pentru anul fiscal 2025" reads as if the tool does not know
 * what year it computed. Falls back to the latest engine-supported config for an
 * unknown year (results only ever exist for supported years, so this is defensive).
 */
export function taxYearInterpVarsForYear(
  language: string,
  year: number | undefined,
): { taxYear: number; filingDeadline: string } {
  const config = (year != null ? getTaxYearConfig(year) : undefined) ?? getLatestEngineSupportedConfig();
  const isRo = language.startsWith('ro');
  return {
    taxYear: config.taxYear,
    filingDeadline: isRo ? config.filingDeadlineRo : config.filingDeadlineEn,
  };
}
