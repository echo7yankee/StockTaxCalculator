import type { Transaction } from '../types/transaction.js';

/**
 * BNR reference rates for a single foreign currency, as returned by the
 * `/api/exchange-rates/{year}/daily` and `/average` endpoints.
 */
export interface CurrencyBnrRates {
  /** Per-date rates (`YYYY-MM-DD` → RON per 1 unit of the currency). */
  daily: Record<string, number>;
  /**
   * Annual average rate (`cursul mediu anual`), or null when the average fetch
   * failed; dividends in that currency then degrade to per-date.
   */
  annualAvg: number | null;
}

/**
 * Builds an on-or-before lookup over a daily BNR rate map (keys `YYYY-MM-DD`).
 * Sorts the date keys once, then binary-searches for the latest rate on or
 * before the queried date, so weekend/holiday dates resolve to the prior
 * business day's rate. Returns null when the map is empty or the queried date
 * precedes every known rate. Shared by the CSV flow (`applyBnrRates`) and the
 * PDF flow (`calculateTaxesFromPdf`) so both paths convert capital gains at the
 * same per-trade-date rule.
 */
export function makeRateLookup(daily: Record<string, number>): (dateStr: string) => number | null {
  const rateDates = Object.keys(daily).sort();
  return (dateStr: string): number | null => {
    let lo = 0;
    let hi = rateDates.length - 1;
    let best: string | null = null;
    while (lo <= hi) {
      const mid = Math.floor((lo + hi) / 2);
      if (rateDates[mid] <= dateStr) {
        best = rateDates[mid];
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    return best ? daily[best] : null;
  };
}

/**
 * Enriches raw CSV transactions with BNR exchange rates per ANAF rule:
 *
 *   - Foreign dividends → annual average BNR rate (`cursul mediu anual`).
 *   - Foreign capital-gain transactions (buy/sell) → per-trade-date BNR rate.
 *
 * Codul Fiscal splits foreign-source income conversion by category: dividend
 * income converts at the annual average, while transfers of securities convert
 * at the rate valid on the day the gain is determined. Crypto follows the
 * per-transaction-date rule alongside capital gains.
 *
 * Rates are keyed by currency, so a statement mixing several foreign currencies
 * (e.g. USD + GBP + EUR, common on IBKR and merged multi-file exports) converts
 * each transaction at its OWN currency's BNR rate rather than a single dominant
 * currency's rate. A transaction whose `priceCurrency` is absent from
 * `ratesByCurrency` is returned unchanged (the caller surfaces the missing-rate
 * case as a UI warning rather than silently mis-converting it).
 *
 * Per-date lookups use `findRateOnOrBefore` (handles weekends/holidays by
 * falling back to the last known rate). When a currency's `annualAvg` is null,
 * its dividends fall back to per-date; the caller surfaces this as a degraded
 * mode so the user knows the methodology is degraded.
 */
export function applyBnrRates(
  transactions: Transaction[],
  ratesByCurrency: Record<string, CurrencyBnrRates>,
  localCurrency: string,
): Transaction[] {
  // Precompute an on-or-before lookup per currency so the sorted-date scan runs
  // once per currency rather than once per transaction.
  const lookupByCurrency = new Map<string, (dateStr: string) => number | null>();
  for (const [currency, rates] of Object.entries(ratesByCurrency)) {
    lookupByCurrency.set(currency, makeRateLookup(rates.daily));
  }

  return transactions.map((tx) => {
    if (tx.priceCurrency === localCurrency) {
      return {
        ...tx,
        exchangeRateToLocal: 1,
        totalAmountLocal: tx.totalAmountOriginal,
        withholdingTaxLocal: tx.withholdingTaxOriginal,
      };
    }

    const rates = ratesByCurrency[tx.priceCurrency];
    if (!rates) return tx;

    const useAnnualAvg = tx.action === 'dividend' && rates.annualAvg !== null;
    const bnrRate = useAnnualAvg
      ? rates.annualAvg
      : lookupByCurrency.get(tx.priceCurrency)!(
          new Date(tx.transactionDate).toISOString().split('T')[0],
        );

    if (!bnrRate) return tx;

    return {
      ...tx,
      exchangeRateToLocal: bnrRate,
      totalAmountLocal: Math.round(tx.totalAmountOriginal * bnrRate * 100) / 100,
      withholdingTaxLocal: Math.round(tx.withholdingTaxOriginal * bnrRate * 100) / 100,
    };
  });
}
