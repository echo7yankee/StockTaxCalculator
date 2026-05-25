# Trading 212 PDF Format Taxonomy

Trading 212 Annual Statement PDFs come in several shapes depending on the user's
jurisdiction, account configuration, language, and the issuing T212 entity at
the time of generation. The parser needs to handle each shape; this document
tracks the shapes we have personally seen and committed regression fixtures for.

Two paying customers (Paul Adam 2026-05-19, Florin Pop 2026-05-24) hit
format-specific parser bugs back-to-back. The fixtures listed below are the
prevention layer: each PR that touches the parser or engine runs them
end-to-end in CI, so future format drift gets caught before a paying customer
hits it.

## Shape 1: Pre-Cyprus single-account USD

- Footer: "Trading 212 UK Ltd."
- One Trading 212 Invest overview block on page 1, vertical layout.
- Sell-trades table has explicit `CURRENCY` and `TRANSACTION CURRENCY` columns.
- Currencies appear as standalone column values (`USD`), not embedded inline.
- Profit and Loss overview fields parse correctly (no ligature breaks).
- Language: English.
- Reference fixture: `test-data/fixtures/annual-statement-2025-pages.json` (Dragos's actual 2025 statement, the canonical 28,053 lei regression case).
- Coverage: `shared/src/engine/__tests__/pdfIntegration.test.ts`.

## Shape 2: Romanian-localized single-account RON

- Footer can be either UK or Cyprus.
- One Trading 212 Invest overview block on page 1, vertical layout.
- All labels in Romanian (`Rezultat închis`, `Profit`, `Pierdere`, `Dividende brute`, `Taxe reținute`, etc.).
- Sell trades use `Acțiune` as the instrument type and `TIP` as the column header.
- Currency embedded inline as `RON 100.00`. No standalone currency column.
- Language: Romanian (with diacritics; the parser also accepts the diacritic-free variants `Declaratie anuala`, `dupa instrument`, etc.).
- Year detection regex matches `Declarație anuală - YYYY`.
- Reference fixture: `test-data/fixtures/annual-statement-2025-ro-single-account.json` (synthetic, no PII).

## Shape 3: Post-Cyprus multi-account horizontal (Invest + CFD + Crypto)

- Footer: "Trading 212 Markets Ltd." registered in Republic of Cyprus.
- Three overview blocks on page 1, laid out as HORIZONTAL columns side-by-side, like:
  `Closed result\tRON 3,273.75\tClosed result\tRON -226.80\tClosed result\t€0.00`
  (Invest, CFD, Crypto).
- T212 places Invest leftmost. Other accounts may be missing (CFD only, Crypto only) or all three present.
- Sell-trades table omits the standalone `CURRENCY` and `TRANSACTION CURRENCY` columns; currency embedded inline (`RON 14.33`).
- Parser implications:
  - `parseOverview` uses a two-pass left-to-right scan: pass 1 prefers lines that START with the keyword (Invest is leftmost), pass 2 falls back to keyword at any tab-aligned cell-start.
  - Explicit-zero detection extended to cover `€0.00`, `£0.00`, `$0.00` so Crypto's empty column does not leak into Invest's slot.
  - CFD-only / Crypto-only uploads emit a defensive warning ("No Invest account section found").
- Engine implications:
  - Sell-trade `transactionCurrency` parses to `USD` (parser default fallback) because the standalone column is missing.
  - `transactionCurrency !== overview.currency` is detected and the engine falls back to `overview.closedResult` instead of summing per-row values.
- Reference fixture: `test-data/fixtures/annual-statement-2025-multi-account.json` (synthetic, mirrors Florin Pop's shape with anonymized identity and synthetic ISINs).

## Shape 4: Ligature-broken labels

- Latin `fi` ligature gets split into separate tab-separated tokens during PDF text extraction:
  - `Profit` appears as `Pro\tfi\tt`
  - `confirmation` (in the legal disclaimer) appears as `con\tfi\trmation`
- Other ligatures (`fl`, `ffi`, `ffl`) MAY exhibit the same behavior; not yet observed in committed fixtures.
- Parser implications:
  - `profit` and `loss` overview fields parse to `0` when the label is ligature-broken (the `startsWith('profit')` check fails).
  - The engine does NOT depend on `profit` or `loss` overview fields; it uses `closedResult` only, which is unaffected by ligature breaks on adjacent lines.
- This shape can co-occur with any of Shapes 1, 2, or 3 (it is a text-extraction artifact, not a layout choice).
- Reference fixture: `test-data/fixtures/annual-statement-2025-ligature-broken.json` (synthetic single-account USD with ligature-broken `Pro\tfi\tt` and `con\tfi\trmation`).

## When to add a new shape

Add a new fixture when:
- A customer reports a parse failure (numbers wrong, missing rows, the warning banner fires unexpectedly).
- Trading 212 announces a PDF format change (new entity migration, new column, new account type).
- A new account type appears (ISA, Plus, pension, retirement) and the format differs from current shapes.

## How to add a new shape

1. Get the customer's PDF with their explicit consent. The customer's raw PDF and the pre-anonymization extraction NEVER get committed (`feedback_test_fixture_data.md`).
2. Extract page texts locally:
   ```
   npx tsx test-data/extract-fixture.ts
   ```
   (Adapt the script's `pdfPath` or pass it as an argument; the existing script targets `test-data/annual-statement-2025.pdf`.)
3. Inspect the extracted JSON manually. Confirm what is in there. Look for any PII patterns beyond the standard list (customer name, customer ID, account IDs).
4. Anonymize:
   ```
   npx tsx test-data/anonymize-pdf-pages.ts <input.json> test-data/fixtures/annual-statement-YYYY-<shape-slug>.json
   ```
5. Re-inspect the anonymized output. Verify all PII is replaced. Commit only when the diff is something you could show the customer.
6. Add a `describe` block to `shared/src/engine/__tests__/pdfIntegration.test.ts` for the new fixture. Assert the engine output end-to-end (parse + tax calc + warnings).
7. Update this document with a new shape section.
8. If the new shape breaks the parser or engine, that is a separate PR. Do not bundle the fix with the fixture commit.

## Hard rules

- No real customer PDFs in the repository. Always anonymize first via `test-data/anonymize-pdf-pages.ts`.
- The 28,053 lei regression (Dragos's 2025 Trading212 statement) must stay green on every parser or engine change. Reference: Shape 1 fixture + `pdfIntegration.test.ts` "Annual Statement 2025" describe block.
- Fixture filenames follow `annual-statement-YYYY-<shape-slug>.json` (year then descriptive slug).
- Fixtures are JSON arrays of strings, one string per PDF page, lines newline-separated, columns tab-separated. The format mirrors what `test-data/extract-fixture.ts` produces.
