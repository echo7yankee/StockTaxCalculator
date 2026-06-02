# Interactive Brokers (IBKR) Activity Statement CSV Format

The parser at `shared/src/parsers/ibkr.ts` reads an IBKR **Activity Statement**
exported as CSV (Reports -> Statements -> Activity -> pick the full tax year ->
CSV). This document is the spec the parser is built to, because we have no real
IBKR export to test against: Dragos holds only a Trading212 account and will not
open accounts at other brokers. The synthetic generator at
`shared/src/parsers/__tests__/ibkrSynthetic.ts` produces this exact format, and
the unit + property tests in `ibkr.test.ts` validate the parser against it.

## STATUS: BETA

Per the Regression Firewall (`investax-docs/09-backlog-and-discipline.md`
Section 8.6 #5), this parser is BETA until at least 3 real anonymized user
exports parse correctly end-to-end and are committed as fixtures (via the
`docs/customer-pdf-intake-runbook.md` intake procedure, adapted for CSV). Until
then, when it is wired into the upload UI it MUST ship behind:

- the parser-warning hard-stop (#24A: any warning blocks the D212 export and
  shows a red banner), and
- the engine sign/magnitude refusal (#24C), and
- a persistent verify-before-filing caveat on the results.

A beta parser may never let a number reach a user without that caveat.

## Why the format is multi-section

Unlike a Trading212 CSV (one flat table with a single header row), an IBKR
Activity Statement concatenates many sections into one file. Every row begins
with two fixed columns:

1. **Section name** (`Trades`, `Dividends`, `Withholding Tax`, `Financial
   Instrument Information`, `Statement`, `Account Information`, ...).
2. **Row type**: `Header` or `Data`.

Each section has its own `Header` row that names its columns; the `Data` rows
that follow align to that header. Columns differ between sections but are
consistent within a section. This is why the parser takes raw rows
(`string[][]` from `Papa.parse(file, { header: false })`) and routes by section,
rather than the header-keyed `RawCsvRow[]` model Trading212 uses.

## Sections the parser reads

### Trades

Header (typical):

```
Trades,Header,DataDiscriminator,Asset Category,Currency,Symbol,Date/Time,Quantity,T. Price,C. Price,Proceeds,Comm/Fee,Basis,Realized P/L,MTM P/L,Code
```

- **DataDiscriminator**: `Order` (order-level rollup), `Trade` (the constituent
  executions of an order), `ClosedLot`, `SubTotal`, `Total`. The parser counts
  `Order` rows only: when an order fills in several executions IBKR emits both
  the `Order` rollup and its `Trade` rows, so summing both would double-count. A
  statement with no `Order` rollup falls back to `Trade` rows. `ClosedLot` /
  `SubTotal` / `Total` are detail or aggregation, never counted.
- **Asset Category**: `Stocks` covers stocks and ETFs (beta scope). Options,
  futures, forex, bonds, CFDs are skipped with a reason + a warning.
- **Quantity**: signed. Positive = buy, negative = sell.
- **Proceeds**: signed, EXCLUDES commission. Negative on a buy (cash out),
  positive on a sell (cash in). `abs(Proceeds)` is the gross trade value.
- **Comm/Fee**: the commission, emitted negative. The parser folds it into the
  cost basis on buys (`gross + commission`) and out of net proceeds on sells
  (`gross - commission`); ANAF allows broker fees as deductible transfer costs.
- **Date/Time**: `"YYYY-MM-DD, HH:MM:SS"`. The parser also accepts plain
  `YYYY-MM-DD` and compact `YYYYMMDD`.

### Financial Instrument Information

Maps `Symbol` to ISIN + a human-readable name. ISIN lives in an `ISIN` column
when present, otherwise the `Security ID` column. The Trades section carries
only `Symbol`, so the parser joins this section to fill ISIN (used for the D212
report). It usually appears AFTER Trades, so the join is a second pass. If ISIN
is absent the engine keys on `Symbol`, which is still correct for cost basis.

### Dividends

```
Dividends,Header,Currency,Date,Description,Amount
```

The `Description` begins with `SYMBOL(ISIN)`, e.g.
`AAPL(US0378331005) Cash Dividend USD 0.24 per Share`. The parser extracts the
symbol + ISIN from it. `Amount` is the gross dividend (signed, so reversals net
out). `Total` / `SubTotal` rows carry a non-currency value in the `Currency`
column and are skipped.

**Cash-section `Date` format (important).** Unlike the Trades section (always
ISO `YYYY-MM-DD`), the cash sections print the `Date` in the account-configured
format. On IBKR Ireland and other non-US entities this is day-first `DD-MM-YY`
(e.g. `15-04-26`); US accounts use `MM-DD-YY`; some configs use ISO. The parser
resolves day-vs-month per row when one component is `> 12`, else from a
file-level order inferred from the first unambiguous cash date (default
day-first). The year is always taken verbatim, so the order can never change a
row's tax year. A genuinely unreadable cash date raises a warning (caught by the
#24A hard-stop) rather than being silently dropped. **Do not** hand a non-ISO
cash date to `new Date()` (it mis-reads `15-04-26` as month 15 and drops the row
silently): this exact bug dropped a real user's dividend before it was fixed.

### Withholding Tax

```
Withholding Tax,Header,Currency,Date,Description,Amount,Code
```

Same `SYMBOL(ISIN)` description convention. `Amount` is negative (tax withheld).
The parser aggregates withholding by `(security, year)` and attaches it to the
matching dividend, which is all the engine needs for a correct foreign tax
credit. Withholding with no matching dividend raises a warning (and is therefore
caught by the #24A hard-stop) rather than being silently dropped.

Not every Withholding Tax row is a dividend credit. IBKR also withholds tax on
**interest income** (e.g. `Withholding @ 10% on Credit Interest`), and those rows
carry no `SYMBOL (ISIN)`. InvesTax handles dividends and capital gains only, not
interest income, so such rows are counted and surfaced as a single clear warning
(`Skipped N withholding-tax row(s) on interest income...`) instead of the
misleading per-row "could not identify the security" message. They still trip the
#24A hard-stop, so no number reaches the user uncaught. A withholding row that has
no identifiable security AND is not interest keeps the generic "could not identify
the security" warning.

## Beta scope and known limitations

- **Stocks / ETFs only.** Options, futures, forex, bonds, CFDs are skipped with
  a warning.
- **Dividends + capital gains only.** Interest income (and the tax withheld on
  it) is not yet handled; interest-withholding rows are flagged, not applied.
  Declaring interest income is on the user (a roadmap gap, not a bug).
- **Currencies USD / EUR / GBP / RON only.** Other currencies (CHF, CAD, JPY...)
  are skipped with a warning, pending multi-currency BNR work (backlog #5).
- **Activity Statement only.** The Flex Query CSV (camelCase field names) is a
  different layout and is not yet supported; the user-facing recipe should point
  users to the Activity Statement CSV download.

## Graduating from BETA to TRUSTED

1. Solicit real IBKR Activity Statement CSVs from the InvesTax audience / a
   waitlist (do NOT open broker accounts to obtain them).
2. Anonymize and commit as fixtures (strip name, account ID; keep dates,
   currencies, position sizes, prices, ISINs).
3. Confirm each parses correctly end-to-end against the user's own ANAF figures.
4. After >=3 independent exports parse correctly, flip the UI copy from BETA to
   trusted and relax (not remove) the verify-before-filing caveat.
