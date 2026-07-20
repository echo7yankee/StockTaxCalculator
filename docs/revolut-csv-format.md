# Revolut Invest "Account Statement" format

Reference for `shared/src/parsers/revolut.ts` (`parseRevolutStatement`). Status: BETA
(built to the published format without a real account of our own; graduates to
TRUSTED only after >=3 real anonymized user exports parse end to end, per the
Regression Firewall, `investax-docs/09-backlog-and-discipline.md` Section 8.6 #5).
Sample intake procedure + anonymization tool + the per-broker tracker:
`docs/broker-sample-intake-runbook.md` (`test-data/anonymize-broker-export.ts`).

## Which file

Revolut Invest exposes three statement types. We parse the **Account Statement**
(the full transaction stream), NOT the P&L summary PDF or the Cost & Charges report.

Export recipe (English app labels; the RO app menu chrome is localized but the
spreadsheet column headers stay English):

> Invest > More > Documents > Stocks > Account Statement > Excel > period: All time > Get statement

The native download is **Excel (`.xlsx`)**. The upload flow reads it via a
lazy-loaded `read-excel-file` into rows; a user-converted `.csv` is also accepted
(parsed header-less, same row shape).

## Schema

A single flat table. Header row (verbatim, 8 columns):

```
Date, Ticker, Type, Quantity, Price per share, Total Amount, Currency, FX Rate
```

Real example rows (anonymized format reference, not a real portfolio):

```
2019-11-15T23:15:55.878985Z, ,    CASH TOP-UP,   ,           ,        $5.22,  USD, 1.1055
2023-09-22T13:30:10.514Z,    O,   BUY - MARKET,  1.63453043, $52.07,  $85.11, USD, 1.0665
2023-07-14T13:30:00.797Z,    MA,  SELL - MARKET, 0.1998348,  $402.13, $80.34, USD, 1.1241
2019-12-13T08:40:00.835101Z, MSFT,DIVIDEND,      ,           ,        $0.08,  USD, 1.1179
2021-09-01T07:40:54.539038Z, ,    CUSTODY FEE,   ,           ,        -$0.01, USD, 1.18
2022-08-25T08:27:46.419568Z, TSLA,STOCK SPLIT,   0.16431924, ,        $0,     USD, 0.0947
2023-08-06T...,              WBD, TRANSFER FROM REVOLUT TRADING LTD TO REVOLUT SECURITIES EUROPE UAB, 0.0004562, , $0, USD, 1.1018
2025-09-08T07:29:03.333Z,    MSFT,BUY - MARKET,  "0,76672417", €26.09, €20,    EUR, 1
```

### Per-column notes

| Column          | Notes |
|-----------------|-------|
| `Date`          | ISO-8601 UTC. Sub-second precision varies (3 or 6 digits). Parsed with `new Date()`. |
| `Ticker`        | Symbol (`O`, `MSFT`). Empty on cash / fee / some transfer rows. No ISIN anywhere in the file; the engine groups cost basis on ticker. |
| `Type`          | Verbose labels, see mapping below. |
| `Quantity`      | Decimal. May be European comma-formatted (`0,76672417`). |
| `Price per share` | Inline currency symbol (`$52.07`, `€26.09`). Empty on cash / fee / dividend / split / transfer rows. |
| `Total Amount`  | Inline symbol and sign (`-$30.93`, `$0`, `€50`). Positive for buys/sells/dividends; negative for cash-out/fees. |
| `Currency`      | ISO code (`USD`, `EUR`, `GBP`). Source of truth for the transaction currency. |
| `FX Rate`       | Revolut's internal rate to the account base currency. **Ignored** - we convert to RON via BNR ourselves, per the transaction's own currency. |

Number parsing is locale-tolerant: inline symbols stripped; if both `.` and `,`
appear the later one is the decimal (`1,234.56` US and `1.234,56` EU both read as
1234.56); a lone `,` is a decimal (`0,76672417`).

## Type -> action mapping

| `Type` value                       | Mapped to | Notes |
|------------------------------------|-----------|-------|
| contains `BUY` (e.g. `BUY - MARKET`) | buy     | Cost basis. |
| contains `SELL` (e.g. `SELL - MARKET`) | sell  | Proceeds. |
| contains `DIVIDEND`                | dividend  | See withholding limitation below. |
| contains `STOCK SPLIT`             | zero-cost buy | Adds the new shares at $0, so the weighted-average cost per share drops proportionally (a forward split). A negative quantity (reverse split) is not modelled and emits a warning. |
| **exactly** `CASH TOP-UP`, `CASH WITHDRAWAL`, `CUSTODY FEE`, or matching `TRANSFER FROM REVOLUT .. TO REVOLUT ..` | ignored | Non-taxable cash movements, account fees, and the UK->EU custodian migration ($0 bookkeeping). Anchored exactly (SUGGESTIONS S14): a bare-substring ignore set would let a never-seen income type such as `MERGER - CASH` vanish silently, and an in-kind transfer from an EXTERNAL broker (cost-basis information we cannot model) must warn, not disappear. All five shapes are evidenced in the real anonymized sample. |
| anything else                      | warning   | Unrecognised type is skipped and pushes a parse warning, which trips the #24A red hard-stop AND the fatal pre-pay gate block, so an unseen row can never be silently miscomputed or paid for. |

Currencies: USD / EUR / GBP / RON supported. Others (e.g. CHF, GBX pence) are
skipped with a warning rather than guessed (GBX is never symbol-mapped to GBP, to
avoid a 100x pence/pounds error).

## Beta limitations

- **No dividend withholding breakdown.** The current format reports a dividend as a
  single `Total Amount` with no foreign-WHT line (the old `DIVNRA` rows are gone).
  So `withholdingTaxOriginal` is 0 and the engine computes the full 10% Romanian
  dividend tax with no foreign-tax credit. That OVER-states the dividend tax (the
  safe direction; never under-declares). The results page carries a beta
  verify-before-filing caveat, and the upload preview note tells the user to verify
  dividend tax manually.
- **Entity-migration transfers** are ignored; the buys that set cost basis remain in
  the same All-time export.
- **Reverse splits** warn instead of guessing.

## Drift watch

The schema drifted once already: the circa-2021 PDF "Activity" format
(`Trade Date / Activity Type / Symbol / Amount`, codes `DIV`/`DIVNRA`/`SSP`) is
obsolete. The discontinued OSS parser `doino-gretchenliev/revolut-stocks` was
archived because "Revolut changed their statements format." If Revolut changes the
columns again, an old-format file fails header detection (no `Type` / `Total Amount`
column) and surfaces a clear "does not look like a Revolut Account Statement"
warning rather than mis-parsing. Pin any new shape with a fixture or synthesizer
dimension (see `revolutSynthetic.ts`).
