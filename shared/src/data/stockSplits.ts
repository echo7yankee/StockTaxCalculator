// Known forward stock splits, used to repair cost basis for the Trading212 CSV
// flow. Trading212's transaction-history CSV does NOT split-adjust historical
// rows and emits no split event, so a position held across a split has buy/sell
// share counts that do not reconcile (a 1-share pre-split buy vs a 10-share
// post-split sell). Brokers that DO report splits in their statements (Revolut's
// "STOCK SPLIT" row, IBKR corporate actions) are handled by their own parsers
// and must NOT consume this table, or the adjustment double-counts.
//
// Only FORWARD splits are listed (ratio > 1). Reverse splits are deliberately
// excluded: applyKnownStockSplits warns on them rather than guessing.
//
// `effectiveDate` is the first trading day at the split-adjusted price (UTC
// calendar date). Holdings dated strictly before this are in pre-split units and
// get adjusted; trades on/after it are already in post-split units.
//
// Adding a split: confirm the ratio + first split-adjusted trading date against a
// primary source (issuer 8-K / IR page or an exchange split notice), key it by
// the security's ISIN (stable across forward splits) with the ticker as a
// fallback for ISIN-less rows, and add a unit test asserting it is applied.

export interface StockSplit {
  /** Primary match key. ISIN is stable across forward splits. */
  isin: string;
  /** Fallback match key, used only for transactions that carry no ISIN. */
  ticker: string;
  /** Forward-split ratio: 10 means 10-for-1 (one share becomes ten). */
  ratio: number;
  /** First trading day at the split-adjusted price, UTC calendar date YYYY-MM-DD. */
  effectiveDate: string;
  /** Short label for the transparency note, e.g. "NVDA 10:1 (Jun 2024)". */
  label: string;
}

// Verified 2026-06-01 against issuer 8-K / IR announcements and exchange split
// notices (see PR description for the per-split source URLs).
export const KNOWN_STOCK_SPLITS: readonly StockSplit[] = [
  { isin: 'US67066G1040', ticker: 'NVDA', ratio: 10, effectiveDate: '2024-06-10', label: 'NVDA 10:1 (Jun 2024)' },
  { isin: 'US88160R1014', ticker: 'TSLA', ratio: 3, effectiveDate: '2022-08-25', label: 'TSLA 3:1 (Aug 2022)' },
  { isin: 'US88160R1014', ticker: 'TSLA', ratio: 5, effectiveDate: '2020-08-31', label: 'TSLA 5:1 (Aug 2020)' },
  { isin: 'US0231351067', ticker: 'AMZN', ratio: 20, effectiveDate: '2022-06-06', label: 'AMZN 20:1 (Jun 2022)' },
  { isin: 'US02079K3059', ticker: 'GOOGL', ratio: 20, effectiveDate: '2022-07-18', label: 'GOOGL 20:1 (Jul 2022)' },
  { isin: 'US02079K1079', ticker: 'GOOG', ratio: 20, effectiveDate: '2022-07-18', label: 'GOOG 20:1 (Jul 2022)' },
  { isin: 'US0378331005', ticker: 'AAPL', ratio: 4, effectiveDate: '2020-08-31', label: 'AAPL 4:1 (Aug 2020)' },
];
