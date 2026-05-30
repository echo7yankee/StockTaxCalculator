import type { Transaction } from '../types/transaction.js';
import type { ParseResult, SkippedRow } from './trading212.js';

/**
 * Merge several broker-CSV `ParseResult`s into one (backlog #1, multi-file CSV).
 *
 * Why this exists: a single broker export often covers only one period, so a
 * user who sells in 2025 a position they bought in 2023 has the buy in one file
 * and the sell in another. The tax engine builds cost basis across ALL
 * transactions chronologically (see `calculateTaxes`), so feeding it the
 * concatenation of every file produces the correct weighted-average cost, and
 * clears the "sells exceed buys / missing history" guard that a single
 * partial-history file trips.
 *
 * The one hazard with concatenation is OVERLAPPING exports (the same transaction
 * present in two files, or the same file uploaded twice): a naive concat would
 * double-count it and inflate the numbers. We therefore de-duplicate
 * EXACT-MATCH transactions across files. An exact match is the same action, the
 * same security, the same instant, the same share count, the same original
 * amount, the same currency and the same withholding, i.e. the same real-world
 * transaction reported in two overlapping statements. Two genuinely distinct
 * trades cannot collide on all of those across files (a trade has one date; if
 * it appears in two files it is because their periods overlap).
 *
 * De-duplication is the CORRECT result here (it removes a double-count, it does
 * not hide income), so `duplicatesRemoved` is surfaced as a transparent preview
 * note rather than pushed into `warnings`: it must not trip the parse-warning
 * hard-stop (#24A), which is reserved for "this number may be wrong". The caller
 * still shows the count so the user can catch the (contrived) case of two real
 * identical trades being collapsed.
 *
 * Per-file `skipped` rows are concatenated as-is. Per-file `warnings` are
 * concatenated with exact-duplicate strings removed (two IBKR files each warning
 * "Skipped non-stock positions (Forex)" should say it once); a file that
 * genuinely contributed nothing keeps its own "no transactions" warning, which
 * is true for that file and worth surfacing.
 */
export interface MergedParseResult extends ParseResult {
  /** Number of source files merged (1 for the single-file case). */
  sourceFileCount: number;
  /** Exact-duplicate transactions removed across overlapping files. */
  duplicatesRemoved: number;
}

/**
 * Identity of a real-world transaction, for cross-file de-duplication. Uses the
 * semantic fields a broker would reproduce identically in two overlapping
 * exports, never the synthetic `id`, which is per-file positional.
 */
function transactionIdentity(t: Transaction): string {
  return [
    t.action,
    t.isin || t.ticker,
    new Date(t.transactionDate).getTime(),
    t.shares,
    t.totalAmountOriginal,
    t.priceCurrency,
    t.withholdingTaxOriginal,
  ].join('|');
}

export function mergeParseResults(results: ParseResult[]): MergedParseResult {
  const transactions: Transaction[] = [];
  const skipped: SkippedRow[] = [];
  const warnings: string[] = [];
  const seen = new Set<string>();
  let duplicatesRemoved = 0;

  for (const result of results) {
    for (const t of result.transactions) {
      const identity = transactionIdentity(t);
      if (seen.has(identity)) {
        duplicatesRemoved++;
        continue;
      }
      seen.add(identity);
      transactions.push(t);
    }
    skipped.push(...result.skipped);
    for (const w of result.warnings) {
      if (!warnings.includes(w)) warnings.push(w);
    }
  }

  return {
    transactions,
    skipped,
    warnings,
    sourceFileCount: results.length,
    duplicatesRemoved,
  };
}
