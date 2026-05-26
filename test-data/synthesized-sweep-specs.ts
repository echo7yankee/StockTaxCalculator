/**
 * Spec lists for the synthesized CI sweep tests (PR 6 A.2).
 *
 * Both the parser sweep (`shared/src/parsers/__tests__/trading212Pdf.synthesized.test.ts`)
 * and the engine sweep (`shared/src/engine/__tests__/pdfTaxCalculator.synthesized.test.ts`)
 * iterate over the same spec set. Keeping the list in one place prevents drift:
 * a regression hidden by mismatched coverage between parser and engine would
 * defeat the point of the sweep.
 *
 * Sizing target (from `pdf-robustness-execution-plan.md` PR 6 A.2): 200-500
 * combinations, full sweep under 60s. Current size: ~210 main + ~10 edge cases
 * + 4 year-detection samples.
 *
 * Dimensions covered in the main cartesian:
 *   - 5 account shapes (single Invest, +CFD, +Crypto, +ISA, +CFD+Crypto)
 *   - 7 language-currency combos (RON only pairs with `language: 'ro'` per the
 *     synthesizer's localized strings; en+RON is not a real-world T212 shape)
 *   - 3 volume profiles (small / normal / heavy)
 *   - 2 ligature states (false / true)
 *
 * Year stays fixed at 2025 in the main cartesian to keep size manageable; a
 * separate `yearSpecs` list covers the 2023-2026 range using default values
 * for the other dimensions.
 */

import {
  defaultSpec,
  type T212AccountType,
  type T212Currency,
  type T212Language,
  type T212SynthSpec,
} from './synthesize-t212-pages.js';

export interface NamedSpec {
  name: string;
  spec: T212SynthSpec;
}

const accountShapes: T212AccountType[][] = [
  ['Invest'],
  ['Invest', 'CFD'],
  ['Invest', 'Crypto'],
  ['Invest', 'ISA'],
  ['Invest', 'CFD', 'Crypto'],
];

const langCurrencyCombos: Array<{ language: T212Language; baseCurrency: T212Currency }> = [
  { language: 'en', baseCurrency: 'USD' },
  { language: 'en', baseCurrency: 'EUR' },
  { language: 'en', baseCurrency: 'GBP' },
  { language: 'ro', baseCurrency: 'USD' },
  { language: 'ro', baseCurrency: 'EUR' },
  { language: 'ro', baseCurrency: 'GBP' },
  { language: 'ro', baseCurrency: 'RON' },
];

interface VolumeProfile {
  label: string;
  sellTradeCount: number;
  dividendCount: number;
  distributionCount: number;
}

const volumeProfiles: VolumeProfile[] = [
  { label: 'small', sellTradeCount: 1, dividendCount: 1, distributionCount: 0 },
  { label: 'normal', sellTradeCount: 5, dividendCount: 3, distributionCount: 1 },
  { label: 'heavy', sellTradeCount: 25, dividendCount: 10, distributionCount: 5 },
];

const ligatureStates = [false, true] as const;

function buildMainCartesian(): NamedSpec[] {
  const out: NamedSpec[] = [];
  for (const accounts of accountShapes) {
    for (const { language, baseCurrency } of langCurrencyCombos) {
      for (const vol of volumeProfiles) {
        for (const ligatureBroken of ligatureStates) {
          const acctLabel = accounts.join('+');
          const ligLabel = ligatureBroken ? 'lig' : 'noLig';
          const name = `${language} ${baseCurrency} ${acctLabel} ${vol.label} ${ligLabel}`;
          out.push({
            name,
            spec: defaultSpec({
              accounts,
              language,
              baseCurrency,
              year: 2025,
              sellTradeCount: vol.sellTradeCount,
              dividendCount: vol.dividendCount,
              distributionCount: vol.distributionCount,
              ligatureBroken,
            }),
          });
        }
      }
    }
  }
  return out;
}

export const mainCartesian: NamedSpec[] = buildMainCartesian();

/**
 * Year detection coverage. Main cartesian holds year at 2025 to keep size
 * manageable; this list exercises the 2023-2026 range with default values
 * for the other dimensions.
 */
export const yearSpecs: NamedSpec[] = [2023, 2024, 2025, 2026].map((year) => ({
  name: `year ${year}`,
  spec: defaultSpec({ year }),
}));

/**
 * Hand-picked edge cases the main cartesian skips:
 *   - only-sells (zero dividends, no "missing dividend section" warning)
 *   - only-divs (zero sells, parser emits "No sell trades section found")
 *   - very large volume (100 sells / 50 divs / 20 distributions)
 *
 * The only-divs cases produce a parser warning by design; engine sweep
 * asserts the engine still produces a stable result in that case.
 */
export const edgeCaseSpecs: NamedSpec[] = [
  {
    name: 'only-sells en USD (no divs)',
    spec: defaultSpec({ sellTradeCount: 5, dividendCount: 0, distributionCount: 0 }),
  },
  {
    name: 'only-sells ro RON (no divs)',
    spec: defaultSpec({
      language: 'ro',
      baseCurrency: 'RON',
      sellTradeCount: 5,
      dividendCount: 0,
      distributionCount: 0,
    }),
  },
  {
    name: 'only-divs en USD (no sells; parser warns)',
    spec: defaultSpec({ sellTradeCount: 0, dividendCount: 5, distributionCount: 0 }),
  },
  {
    name: 'only-divs ro RON (no sells; parser warns)',
    spec: defaultSpec({
      language: 'ro',
      baseCurrency: 'RON',
      sellTradeCount: 0,
      dividendCount: 5,
      distributionCount: 0,
    }),
  },
  {
    name: 'large volume 100/50/20 en USD',
    spec: defaultSpec({ sellTradeCount: 100, dividendCount: 50, distributionCount: 20 }),
  },
  {
    name: 'large volume 100/50/20 ro RON',
    spec: defaultSpec({
      language: 'ro',
      baseCurrency: 'RON',
      sellTradeCount: 100,
      dividendCount: 50,
      distributionCount: 20,
    }),
  },
];
