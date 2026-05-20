/**
 * Maps the engine's CASS health-contribution bracket discriminator to its
 * i18n key in the `common` namespace. The discriminators (`none`, `6x`, `12x`,
 * `24x`) come from `healthContributionBrackets` in shared/src/taxRules — they
 * are internal tokens, not display text, so both the calculator and the
 * results page route them through this lookup before rendering.
 */
const BRACKET_LABEL_KEYS: Record<string, string> = {
  none: 'common:bracketNone',
  '6x': 'common:bracket6x',
  '12x': 'common:bracket12x',
  '24x': 'common:bracket24x',
};

export function cassBracketLabelKey(discriminator: string): string {
  return BRACKET_LABEL_KEYS[discriminator] ?? 'common:bracketNone';
}
