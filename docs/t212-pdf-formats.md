# Trading 212 PDF Format Taxonomy

Trading 212 Annual Statement PDFs come in several shapes depending on the user's
jurisdiction, account configuration, language, and the issuing T212 entity at
the time of generation. The parser at `shared/src/parsers/trading212Pdf.ts`
needs to handle each shape; this document tracks what we have personally seen
in committed fixtures, what the synthetic generator at
`test-data/synthesize-t212-pages.ts` produces, what the CI sweep at
`test-data/synthesized-sweep-specs.ts` exercises on every PR, and what is
theorized but not yet observed.

Two paying customers (Paul Adam 2026-05-19, Florin Pop 2026-05-24) hit
format-specific parser bugs back-to-back. The fixtures + sweep listed below are
the prevention layer: each PR that touches the parser or engine runs them
end-to-end in CI, so future format drift gets caught before a paying customer
hits it.

## Reader's map

- **Section "Committed shapes"** (below): the 4 shapes we have personally seen
  and committed regression fixtures for. The right entry point if you are
  triaging a customer-reported parse bug. Each shape lists the fixture path
  and the parser implications.
- **Section "Per-dimension reference"**: every dimension T212 actually varies
  along, with coverage status per dimension (committed fixture / synthesizer /
  sweep / theorized only). The right entry point if you are about to touch the
  parser and want to know what coverage backs your change.
- **Section "Sweep coverage in CI"**: which dimensions get cartesian coverage on
  every PR, where the spec list lives, how to extend it.
- **Section "When / How to add a new shape"**: the runbook for committing a
  fixture from a customer-reported parse failure or a newly observed format.

## Committed shapes

### Shape 1: Pre-Cyprus single-account USD

- Footer: "Trading 212 UK Ltd."
- One Trading 212 Invest overview block on page 1, vertical layout.
- Sell-trades table has explicit `CURRENCY` and `TRANSACTION CURRENCY` columns.
- Currencies appear as standalone column values (`USD`), not embedded inline.
- Profit and Loss overview fields parse correctly (no ligature breaks).
- Language: English.
- Reference fixture: `test-data/fixtures/annual-statement-2025-pages.json`
  (Dragos's actual 2025 statement, the canonical 28,053 lei regression case).
- Coverage: `shared/src/engine/__tests__/pdfIntegration.test.ts`.

### Shape 2: Romanian-localized single-account RON

- Footer can be either UK or Cyprus.
- One Trading 212 Invest overview block on page 1, vertical layout.
- All labels in Romanian (`Rezultat închis`, `Profit`, `Pierdere`,
  `Dividende brute`, `Taxe reținute`, etc.).
- Sell trades use `Acțiune` as the instrument type and `TIP` as the column
  header.
- Currency embedded inline as `RON 100.00`. No standalone currency column.
- Language: Romanian (with diacritics; the parser also accepts the
  diacritic-free variants `Declaratie anuala`, `dupa instrument`, etc.).
- Year detection regex matches `Declarație anuală - YYYY`.
- Reference fixture:
  `test-data/fixtures/annual-statement-2025-ro-single-account.json`
  (synthetic, no PII).

### Shape 3: Post-Cyprus multi-account horizontal (Invest + CFD + Crypto)

- Footer: "Trading 212 Markets Ltd." registered in Republic of Cyprus.
- Three overview blocks on page 1, laid out as HORIZONTAL columns side-by-side,
  like:
  `Closed result\tRON 3,273.75\tClosed result\tRON -226.80\tClosed result\t€0.00`
  (Invest, CFD, Crypto).
- T212 places Invest leftmost. Other accounts may be missing (CFD only, Crypto
  only) or all three present.
- Sell-trades table omits the standalone `CURRENCY` and `TRANSACTION CURRENCY`
  columns; currency embedded inline (`RON 14.33`).
- Parser implications:
  - `parseOverview` uses a two-pass left-to-right scan: pass 1 prefers lines
    that START with the keyword (Invest is leftmost), pass 2 falls back to
    keyword at any tab-aligned cell-start.
  - Explicit-zero detection extended to cover `€0.00`, `£0.00`, `$0.00` so
    Crypto's empty column does not leak into Invest's slot.
  - CFD-only / Crypto-only uploads emit a defensive warning ("No Invest
    account section found").
- Engine implications:
  - Sell-trade `transactionCurrency` parses to `USD` (parser default fallback)
    because the standalone column is missing.
  - `transactionCurrency !== overview.currency` is detected and the engine
    falls back to `overview.closedResult` instead of summing per-row values.
- Reference fixture:
  `test-data/fixtures/annual-statement-2025-multi-account.json` (synthetic,
  mirrors Florin Pop's shape with anonymized identity and synthetic ISINs).

### Shape 4: Ligature-broken labels

- Latin `fi` ligature gets split into separate tab-separated tokens during PDF
  text extraction:
  - `Profit` appears as `Pro\tfi\tt`
  - `confirmation` (in the legal disclaimer) appears as `con\tfi\trmation`
- Other ligatures (`fl`, `ffi`, `ffl`) MAY exhibit the same behavior; not yet
  observed in committed fixtures.
- Parser implications:
  - `profit` and `loss` overview fields parse to `0` when the label is
    ligature-broken (the `startsWith('profit')` check fails).
  - The engine does NOT depend on `profit` or `loss` overview fields; it uses
    `closedResult` only, which is unaffected by ligature breaks on adjacent
    lines.
- This shape can co-occur with any of Shapes 1, 2, or 3 (it is a
  text-extraction artifact, not a layout choice).
- Reference fixture:
  `test-data/fixtures/annual-statement-2025-ligature-broken.json` (synthetic
  single-account USD with ligature-broken `Pro\tfi\tt` and
  `con\tfi\trmation`).

## Per-dimension reference

T212 PDFs vary along the dimensions below. Each entry lists what we have SEEN
in a committed fixture, what the A.1 synthetic generator GENERATES, what the
A.2 CI sweep EXERCISES on every PR, and what is THEORIZED but not yet observed.

The parser does NOT branch on the T212 entity name in the footer; it is purely
layout-driven and keyword-driven. Entity, language, and currency are tracked
here because they correlate with layout choices T212 has made over time, not
because the parser dispatches on them.

### Dimension: T212 issuing entity (footer)

- **Seen:** "Trading 212 UK Ltd." (pre-Cyprus single-account USD, Shape 1) and
  "Trading 212 Markets Ltd." registered in Republic of Cyprus (post-Cyprus
  multi-account, Shape 3).
- **Generated:** English variant of the synthesizer emits UK Ltd; Romanian
  variant emits Markets Ltd. See `STRINGS_EN.footerLegal` and
  `STRINGS_RO.footerLegal` in `test-data/synthesize-t212-pages.ts`.
- **Swept:** N/A. The parser does not key off the entity string, so the sweep
  asserts no entity-specific behavior. Footer presence is incidental.
- **Theorized:** any future T212 entity (e.g. a US-domiciled subsidiary) would
  ship as a new footer string. Parser behavior would not change unless the
  layout itself changed.

### Dimension: Account count and ordering

- **Seen:** 1 account (Shapes 1, 2, 4) and 3 accounts Invest+CFD+Crypto
  (Shape 3). 2-account configurations have been generated synthetically but no
  committed real-world fixture exists.
- **Generated:** 1-3 accounts. First account is always Invest (the parser's
  two-pass left-to-right scan depends on Invest being leftmost). Enforced by
  `validateSpec` in the synthesizer.
- **Swept:** 5 account shapes in the main cartesian: `[Invest]`,
  `[Invest, CFD]`, `[Invest, Crypto]`, `[Invest, ISA]`,
  `[Invest, CFD, Crypto]`. See `accountShapes` in
  `test-data/synthesized-sweep-specs.ts`.
- **Theorized:**
  - CFD-only or Crypto-only uploads (no Invest section). Parser emits a
    defensive warning here ("No Invest account section found"); no committed
    fixture covers this case. Adding one would tighten the warning-path
    coverage.
  - 4+ account configurations if T212 adds a new account type alongside
    Invest+CFD+Crypto+ISA+Pension.

### Dimension: Account type

- **Seen:** Invest (all 4 shapes), CFD and Crypto (Shape 3 only).
- **Generated:** Invest / ISA / CFD / Crypto / Pension (`T212AccountType`).
  ISA and Pension exist as type-level options but have not been observed in any
  real customer fixture; they emit the same overview-block layout as CFD /
  Crypto.
- **Swept:** Invest in every spec; +CFD, +Crypto, +ISA, +CFD+Crypto in the 5
  account shapes above.
- **Theorized:**
  - Pension (T212 launched in some markets; no customer fixture yet).
  - Future account types T212 may introduce (corporate, joint, etc.).

### Dimension: Language

- **Seen:** English (Shapes 1, 3, 4) and Romanian (Shape 2; also Shape 3's
  multi-account fixture is generated in Romanian).
- **Generated:** `en` and `ro` are fully localized (full label table in
  `STRINGS_EN` / `STRINGS_RO`). `pl`, `es`, `it` are accepted in the
  `T212Language` type for future expansion but currently emit English labels
  with the language tag as a comment placeholder.
- **Swept:** en + ro across all 5 account shapes and 4 base currencies; pl,
  es, it not swept because they would parse as English (no parser-side
  multilingual table yet for those languages).
- **Theorized:**
  - Polish, Spanish, Italian, French, German, Dutch label tables once T212
    confirms which language strings they actually emit. Parser would need a
    matching `KEYWORDS` entry per language.
  - Romanian without diacritics. Parser already accepts diacritic-free
    variants; synthesizer always emits with diacritics. Adding a "no
    diacritics" toggle to the synthesizer would close that gap.

### Dimension: Base currency (overview totals)

- **Seen:** USD (Shape 1), RON (Shapes 2 and 3), EUR (Shape 3 Crypto sub-block
  shows €0.00).
- **Generated:** USD, EUR, GBP, RON. Prefix symbols `$`, `€`, `£`, `RON `
  per `CURRENCY_PREFIX`.
- **Swept:** 7 language-currency combos: en + (USD/EUR/GBP), ro +
  (USD/EUR/GBP/RON). en+RON is not a real-world T212 shape so it is
  intentionally excluded.
- **Theorized:** CHF, CAD, AUD, NOK, SEK, DKK, BGN, PLN, HUF, CZK if T212
  expands base-currency support. Parser's `detectCurrency` would need each one
  registered.

### Dimension: Currency representation in tables

This is the parser's main shape-branch and the most frequent source of bugs.

- **Seen (standalone column):** Shape 1 has explicit `CURRENCY` and
  `TRANSACTION CURRENCY` columns; values like `USD` appear as standalone cells
  in those columns.
- **Seen (inline):** Shapes 2 and 3 omit the standalone columns; the currency
  is embedded inline with the amount, e.g. `RON 14.33`, `$100.00`, `€50.00`.
- **Generated:** the synthesizer's `formatMoney` helper emits the inline form
  in all currencies (`RON 100.00`, `$100.00`, `€100.00`, `£100.00`). The
  sell-trades table also emits standalone CURRENCY + TRANSACTION CURRENCY
  columns per `sellTradesColumns`. Combined: both representations are present
  in every synthesized PDF, mirroring real T212 output where the standalone
  columns and the inline cells co-exist.
- **Swept:** every spec in the main cartesian asserts both representations
  parse cleanly to the same number; the engine sweep asserts
  `transactionCurrency` propagation works in the multi-account horizontal case
  via the `Invest+CFD+Crypto` shape.
- **Theorized:**
  - T212 dropping the standalone column entirely in a future format. The
    parser already tolerates this via inline-currency detection; behavior
    would not change.
  - T212 emitting a third representation (e.g. ISO-4217 code in a separate
    metadata block). Not observed.

### Dimension: Tax year

- **Seen:** 2025 (every committed fixture).
- **Generated:** any year 2020-2030. `validateSpec` enforces the range.
- **Swept:** 2025 in the main cartesian (held fixed to keep cartesian size
  manageable); 2023, 2024, 2025, 2026 in the separate `yearSpecs` list to
  exercise year-detection regex on each.
- **Theorized:**
  - 2020-2022: synthesizer accepts; not swept; parser regex `Annual Statement
    - YYYY` and `Declarație anuală - YYYY` should match but no real-world
    fixture confirms historic T212 formats were identical.
  - 2027+: synthesizer accepts; not swept; will be needed once Legea 239/2025
    engine refactor lands (backlog #13) and the parser starts seeing real 2026
    and 2027 statements from customers.
- **Note on the year-detection fallback:** parser pushes a warning "Could not
  detect year from PDF. Defaulting to YYYY." if the regex misses. The A.2
  sanity check (session #74) intentionally broke `detectYear` to confirm the
  sweep catches year-mismatch regressions.

### Dimension: Sell trades volume

- **Seen:** 19 sells in Paul Adam's 14-page statement (multi-page section
  continuation, surfaced the PR #94 fix). Single-digit counts in Dragos's
  fixture.
- **Generated:** any non-negative integer. Synthesizer emits each sell as a
  row on the sell-trades page; the section header is emitted only when count
  >= 1.
- **Swept:** 3 volume profiles in the main cartesian: small (1 sell), normal
  (5 sells), heavy (25 sells). Edge-case suite adds very-large (100 sells) and
  only-sells (no dividends or distributions).
- **Theorized:**
  - Very high-volume statements (1000+ sells) for day-trader accounts. Not
    observed in committed fixtures; would stress the multi-page state-machine
    in the parser.
  - Multi-page sell-trades continuation across 3+ pages. Parser supports
    arbitrary continuation depth (see `KEYWORDS.sellTrades` continuation logic
    around `trading212Pdf.ts` line ~297), but the synthesizer currently emits
    each section on one logical page. Closing this gap is a synthesizer-side
    extension flagged in A.1's "NOT covered" header.

### Dimension: Dividend volume

- **Seen:** 11 dividends in Paul's statement; single-digit counts in Dragos's
  fixture.
- **Generated:** any non-negative integer. Synthesizer emits each dividend as
  a row on the dividend-overview page; section header emitted only when count
  >= 1.
- **Swept:** small (1), normal (3), heavy (10). Edge-case suite adds
  very-large (50) and only-divs (no sells; parser emits "No sell trades
  section found" warning by design).
- **Theorized:** as with sells, very-high-volume and multi-page continuation
  scenarios are theorized but not swept.

### Dimension: Distribution (ETF) volume

- **Seen:** small counts in Dragos's fixture.
- **Generated:** any non-negative integer; ETF instruments picked from
  `INSTRUMENT_CATALOG`.
- **Swept:** small (0), normal (1), heavy (5); very-large (20) in the
  edge-case suite.
- **Theorized:** distribution-only statements (no sells, no dividends). Not
  swept; would test the parser's multi-section interaction logic.

### Dimension: Ligature artifacts

- **Seen:** Shape 4 committed fixture has `Pro\tfi\tt` and `con\tfi\trmation`
  broken by the PDF.js text-extraction step.
- **Generated:** `ligatureBroken: true` runs the `applyLigatureBreaks` helper
  over the page text, replacing `Profit` / `profit` / `confirmations` / `fill`
  / `specific` with their tab-broken variants.
- **Swept:** ligature on + ligature off across all 5 account shapes and 7
  language-currency combos (210 main cartesian specs split evenly).
- **Theorized:**
  - Other ligatures: `fl` (e.g. "fluctuation"), `ffi` ("efficient"), `ffl`
    ("baffle"), `ft` ("often"). None observed in committed fixtures; would
    extend `applyLigatureBreaks` if any appear in customer PDFs.
  - Word-boundary-breaking ligatures in number formatting (unlikely; T212
    does not appear to ligature-format numbers).

### Dimension: Multi-page section continuation

- **Seen:** Paul Adam's 14-page statement triggered this via 19/142 sell
  trades and 11/49 dividends. PR #94 added state-tracking across pages.
- **Generated:** NOT covered by the synthesizer today. Every section is
  emitted on one logical page regardless of row count, even at large volumes.
  Flagged in the A.1 "NOT covered" header for a future synthesizer extension.
- **Swept:** N/A on the synthetic side. Paul's real fixture has not been
  anonymized and committed yet (that work falls under PR B, which is
  Dragos-primary because it needs real T212 statement generation).
- **Theorized:** any new T212 layout that introduces section continuation
  via a new continuation-marker (e.g. "continued from previous page") could
  drift past the current `KEYWORDS` state-tracking. Parser would warn rather
  than silently truncate, which is the right failure mode.

### Dimension: Corporate actions

- **Seen:** none in committed fixtures. (Customer-anonymized fixtures may
  contain corporate actions; the committed set does not.)
- **Generated:** `T212CorporateAction` accepts `split`, `reinvest`,
  `name-change` in the spec interface. Today the synthesizer accepts the
  field but does not yet emit corporate-action-narrative rows in the
  sell-trades or dividend tables. Flagged as "currently structural only;
  reserved for richer narrative in A.2 sweeps" in the type comment.
- **Swept:** all sweep specs leave `corporateActions: []`.
- **Theorized:**
  - Stock splits inline in the sell-trades table (e.g. "NVDA 10:1 split
    2024-06-10" rows that affect cost-basis tracking). T212 has historically
    inserted these as narrative rows.
  - Dividend reinvestment notes (DRIP) altering the holdings column on
    dividend rows.
  - Name-change events (e.g. "FB renamed to META") which split a single
    instrument into two ISIN periods within one tax year.

### Dimension: Customer identity fields

- **Seen:** every real customer PDF has CUSTOMER ID + CUSTOMER NAME header
  block. Account IDs (`Account ID: NNNN`) appear once per account section.
- **Generated:** synthesizer accepts `customerName` and optional `customerId`;
  defaults to placeholders. The anonymization tool at
  `test-data/anonymize-pdf-pages.ts` replaces real customer name + ID with
  sequential placeholders when promoting a real PDF to a committed fixture.
- **Swept:** not a swept dimension (no parser branch on customer identity).
- **Theorized:** N/A.

## Sweep coverage in CI

The synthetic CI sweep at
`test-data/synthesized-sweep-specs.ts` drives two parallel test files:

- `shared/src/parsers/__tests__/trading212Pdf.synthesized.test.ts` (parser
  invariants, ~431 tests per run).
- `shared/src/engine/__tests__/pdfTaxCalculator.synthesized.test.ts` (engine
  invariants, ~218 tests per run).

Both iterate over the same spec set so coverage cannot drift between parser and
engine.

Current cartesian:

- 5 account shapes (single Invest, +CFD, +Crypto, +ISA, +CFD+Crypto)
- 7 language-currency combos (en + USD/EUR/GBP, ro + USD/EUR/GBP/RON)
- 3 volume profiles (small 1/1/0, normal 5/3/1, heavy 25/10/5)
- 2 ligature states (false / true)

That is 210 main cartesian specs + 10 edge-case specs (only-sells, only-divs,
very-large) + 4 year specs = 224 specs total. Full sweep runs in ~300ms parser
+ ~150ms engine, well under the 60s budget from the execution plan.

### How to extend the sweep

1. Decide whether the new coverage is a dimension expansion (add a value to an
   existing array, e.g. a new account shape or a new currency) or an edge
   case (a hand-picked spec that the cartesian skips).
2. For dimension expansion: edit the relevant array in
   `test-data/synthesized-sweep-specs.ts`. The cartesian size grows
   multiplicatively, so confirm sweep time stays under 60s after the change.
3. For edge cases: append to `edgeCaseSpecs` with a descriptive `name`.
4. Both sweep files iterate the same lists; no per-file changes needed.
5. Run `npm test -w shared` to confirm the new specs parse and the engine
   invariants hold. If they fail, that is a real format gap. Fix the parser
   or generator before merging, not the assertions.

## When to add a new shape

Add a new committed fixture when:

- A customer reports a parse failure (numbers wrong, missing rows, the warning
  banner fires unexpectedly).
- Trading 212 announces a PDF format change (new entity migration, new column,
  new account type).
- A new account type appears (ISA, Plus, pension, retirement) and the format
  differs from current shapes.
- The sweep surfaces a class of dimension combinations that the synthesizer
  cannot fully reproduce (e.g. corporate-action narratives, multi-page
  continuation with continuation-marker rows).

## How to add a new shape

1. Get the customer's PDF with their explicit consent. The customer's raw PDF
   and the pre-anonymization extraction NEVER get committed
   (`feedback_test_fixture_data.md`).
2. Extract page texts locally:
   ```
   npx tsx test-data/extract-fixture.ts
   ```
   (Adapt the script's `pdfPath` or pass it as an argument; the existing
   script targets `test-data/annual-statement-2025.pdf`.)
3. Inspect the extracted JSON manually. Confirm what is in there. Look for
   any PII patterns beyond the standard list (customer name, customer ID,
   account IDs).
4. Anonymize:
   ```
   npx tsx test-data/anonymize-pdf-pages.ts <input.json> test-data/fixtures/annual-statement-YYYY-<shape-slug>.json
   ```
5. Re-inspect the anonymized output. Verify all PII is replaced. Commit only
   when the diff is something you could show the customer.
6. Add a `describe` block to `shared/src/engine/__tests__/pdfIntegration.test.ts`
   for the new fixture. Assert the engine output end-to-end (parse + tax calc
   + warnings).
7. Update this document with a new shape section (under "Committed shapes") and
   update the relevant dimension entries under "Per-dimension reference" to
   move that combination from THEORIZED to SEEN.
8. If the new shape breaks the parser or engine, that is a separate PR. Do not
   bundle the fix with the fixture commit.

## Hard rules

- No real customer PDFs in the repository. Always anonymize first via
  `test-data/anonymize-pdf-pages.ts`.
- The 28,053 lei regression (Dragos's 2025 Trading212 statement) must stay
  green on every parser or engine change. Reference: Shape 1 fixture +
  `pdfIntegration.test.ts` "Annual Statement 2025" describe block.
- Fixture filenames follow `annual-statement-YYYY-<shape-slug>.json` (year
  then descriptive slug).
- Fixtures are JSON arrays of strings, one string per PDF page, lines
  newline-separated, columns tab-separated. The format mirrors what
  `test-data/extract-fixture.ts` produces.
- The synthesizer (`test-data/synthesize-t212-pages.ts`) and the sweep spec
  list (`test-data/synthesized-sweep-specs.ts`) are the only ways to grow
  parser coverage without committing more fixtures. New parser branches must
  be accompanied by either a new fixture, a new synthesizer dimension, or a
  new edge-case spec; no parser change ships without at least one of those.
