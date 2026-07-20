import type { Transaction } from '../types/transaction.js';
import { KNOWN_STOCK_SPLITS, type StockSplit } from '../data/stockSplits.js';
import { createWarningSink, type ParserWarning } from './parserWarnings.js';

export interface AppliedSplit {
  /** Label from the splits table, e.g. "NVDA 10:1 (Jun 2024)". */
  label: string;
  ticker: string;
  ratio: number;
  /** Synthetic shares injected to reach the post-split count. */
  addedShares: number;
}

export interface StockSplitResult {
  /** Original transactions plus any injected split-adjustment buys. */
  transactions: Transaction[];
  /** Splits that were applied, surfaced to the user as a transparency note. */
  appliedSplits: AppliedSplit[];
  /** Reverse / un-applicable splits, fed to the parse-warning hard-stop. */
  warnings: string[];
  /** The same warnings with stable codes + severity (SUGGESTIONS S6). */
  structuredWarnings: ParserWarning[];
}

const EPSILON = 0.0001;

/**
 * Repairs cost basis for transaction streams that do NOT carry split events
 * (the Trading212 CSV). For each known forward split where the user held shares
 * across the effective date, we inject a zero-cost "buy" of the new shares, the
 * exact mechanic the Revolut parser uses for its native STOCK SPLIT rows. Under
 * weighted-average cost this leaves total cost unchanged while raising the share
 * count, so a pre-split buy and a post-split sell reconcile.
 *
 * The engine is untouched: this is a pure pre-engine transaction transform.
 *
 * IMPORTANT: call this ONLY for brokers whose statements omit split events
 * (Trading212 CSV). Revolut and IBKR report splits in their own data; applying
 * this table there would double-count.
 *
 * Reverse splits (ratio < 1) and any split the table does not cover are left
 * unmodified; unknown splits surface through the existing oversell/missing-
 * history guard rather than producing a silently wrong number here.
 */
export function applyKnownStockSplits(
  transactions: Transaction[],
  splits: readonly StockSplit[] = KNOWN_STOCK_SPLITS,
): StockSplitResult {
  const result: Transaction[] = [...transactions];
  const appliedSplits: AppliedSplit[] = [];
  const sink = createWarningSink();
  const { warnings, structuredWarnings } = sink;

  // Apply chronologically so an earlier split's injected shares are counted when
  // a later split on the same security is evaluated (e.g. TSLA 5:1 then 3:1).
  const ordered = [...splits].sort(
    (a, b) => splitTimeMs(a.effectiveDate) - splitTimeMs(b.effectiveDate),
  );

  for (const split of ordered) {
    const cutoff = splitTimeMs(split.effectiveDate);

    // Net shares held strictly before the split takes effect, over the working
    // set (which already includes any earlier-split injections).
    let held = 0;
    let template: Transaction | undefined;
    for (const tx of result) {
      if (!matchesSecurity(tx, split)) continue;
      // transactionDate is typed Date but some callers/fixtures pass an ISO
      // string; wrap defensively (matches the UploadPage preview convention).
      if (new Date(tx.transactionDate).getTime() >= cutoff) continue;
      if (tx.action === 'buy') {
        held += tx.shares;
        template = tx;
      } else if (tx.action === 'sell') {
        held -= tx.shares;
      }
    }

    if (held <= EPSILON || !template) continue;

    if (split.ratio < 1) {
      sink.push(
        'splits_reverse_split_unapplied',
        `Reverse stock split for ${split.ticker} on ${split.effectiveDate} could not be applied automatically. Verify this position before filing.`,
        { ticker: split.ticker, date: split.effectiveDate },
      );
      continue;
    }

    const addedShares = held * (split.ratio - 1);
    if (addedShares <= EPSILON) continue;

    result.push({
      ...template,
      id: `split-${split.ticker}-${split.effectiveDate}`,
      brokerTransactionId: '',
      action: 'buy',
      transactionDate: new Date(cutoff),
      shares: addedShares,
      pricePerShare: 0,
      totalAmountOriginal: 0,
      totalAmountLocal: 0,
      withholdingTaxOriginal: 0,
      withholdingTaxLocal: 0,
    });
    appliedSplits.push({
      label: split.label,
      ticker: split.ticker,
      ratio: split.ratio,
      addedShares,
    });
  }

  return { transactions: result, appliedSplits, warnings, structuredWarnings };
}

/** Match by ISIN when the transaction has one (precise, stable across splits);
 *  fall back to ticker only for ISIN-less rows to avoid cross-listing collisions. */
function matchesSecurity(tx: Transaction, split: StockSplit): boolean {
  const isin = tx.isin?.trim().toUpperCase();
  if (isin) return isin === split.isin.toUpperCase();
  const ticker = tx.ticker?.trim().toUpperCase();
  return !!ticker && ticker === split.ticker.toUpperCase();
}

function splitTimeMs(effectiveDate: string): number {
  return Date.parse(`${effectiveDate}T00:00:00Z`);
}
