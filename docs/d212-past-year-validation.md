# Past-year D212 XML: ANAF validator runbook (incomes 2023 + 2024)

The app generates a Declaratia Unica XML on the form version of the statement's
income year. The 2025 (v11) structure was validated against a real,
SPV-accepted filing; the 2023/2024 structures are built from ANAF's published
season packages (XSD + structure doc) and CI locks the emitted shape against
the real XSDs (`shared/src/engine/__tests__/d212XmlXsdShape.test.ts`).

The remaining quality bar is running ANAF's OWN validator (the Java "soft J" /
DUKIntegrator) on one generated file per past year. Until that has been done,
the UI ships an explicit "validate it in DUKIntegrator with that season's
package before you submit it in SPV" caveat on past years (DUKIntegrator is the
only pre-submission validator; SPV validates at upload, after the fact). This
runbook is the ~30-minute operator procedure.

## Which package validates which year

A late or never-filed declaration for income year N uses the season-(N+1) form.
Each season has its OWN validator; do not mix them. All downloads are on the
ANAF archive page:
https://static.anaf.ro/static/10/Anaf/Declaratii_R/declaratie_unica.html

| Income year | Season form (OPANAF)                  | Validator (soft J)          | XSD                    |
| ----------- | ------------------------------------- | --------------------------- | ---------------------- |
| 2023        | 6/2024                                | `D212_20240708.zip`         | `d212_v7_20240709.xsd` |
| 2024        | 7015/2024 cycle (published 1929/2025) | `D212Validator_01082025.zip`| `d212_20250113.xsd`    |

Note: both season XSDs declare the same `mfp:anaf:dgti:d212:declaratie:v9`
namespace despite different structures; the validator zip per season is the
authority.

## Procedure (per year)

1. In the app, load a statement for that income year (paid flow), open
   "Declarația Unică (D212) pre-completată", fill the identity form (use real
   CNP format; the file never leaves the browser) and download the `.xml`.
2. Download + unzip that year's validator from the table above (needs Java).
3. Run the validator GUI (`dukintegrator.jar` or the season's equivalent),
   pick declaration type D212, select the generated `.xml`, validate.
4. Expected: zero errors. Warnings: note them verbatim.
5. If it errors, record the exact message + the attribute it names, and open a
   defect. Do NOT hand-edit the XML and submit it.

## What was already verified without the validator

- Every emitted attribute exists in that season's XSD, and every
  `use="required"` root attribute is present (CI shape lock).
- Category codes 2012/2018 and the ISIN-derived country codes are in the
  season nomenclators.
- `an_r` matches the season (2024 / 2025), `totalPlata_A` is the CNP digit-sum
  control defined by the season structure docs.
- Field semantics (bifa flags, CASS bracket bases at the year's minimum wage,
  the obligations-summary formulas) follow the official structure PDFs:
  `structura_declaratieUnica_2024_v1.0.0_10012024.pdf` and
  `structura_D212_2025_v1.0.3_01082025.pdf`.

## After a clean validation

Remove/soften the past-year "validate before submitting" caveat only by a
normal PR (the copy is i18n `results:d212PastYearFormNote`), and record the
validation (year, validator version, date) in the session log.
