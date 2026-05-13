import type { Transaction } from '../types/transaction.js';

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
 * The function uses `findRateOnOrBefore` for per-date lookups (handles
 * weekends/holidays by falling back to the last known rate).
 *
 * When `annualAvgRate` is null, dividends fall back to per-date — caller
 * surfaces this as a UI warning so the user knows the methodology is degraded.
 */
export function applyBnrRates(
  transactions: Transaction[],
  dailyRates: Record<string, number>,
  localCurrency: string,
  annualAvgRate: number | null,
): Transaction[] {
  const rateDates = Object.keys(dailyRates).sort();

  function findRateOnOrBefore(dateStr: string): number | null {
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
    return best ? dailyRates[best] : null;
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

    const useAnnualAvg = tx.action === 'dividend' && annualAvgRate !== null;
    const bnrRate = useAnnualAvg
      ? annualAvgRate
      : findRateOnOrBefore(new Date(tx.transactionDate).toISOString().split('T')[0]);

    if (!bnrRate) return tx;

    return {
      ...tx,
      exchangeRateToLocal: bnrRate,
      totalAmountLocal: Math.round(tx.totalAmountOriginal * bnrRate * 100) / 100,
      withholdingTaxLocal: Math.round(tx.withholdingTaxOriginal * bnrRate * 100) / 100,
    };
  });
}
