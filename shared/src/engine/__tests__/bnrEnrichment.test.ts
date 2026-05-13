import { describe, it, expect } from 'vitest';
import { applyBnrRates } from '../bnrEnrichment.js';
import type { Transaction } from '../../types/transaction.js';

function makeTx(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 'tx-1',
    csvUploadId: '',
    taxYearId: '',
    action: 'buy',
    transactionDate: new Date('2025-06-15'),
    isin: 'US0378331005',
    ticker: 'AAPL',
    securityName: 'Apple Inc.',
    shares: 10,
    pricePerShare: 100,
    priceCurrency: 'USD',
    totalAmountOriginal: 1000,
    exchangeRateToLocal: 0,
    totalAmountLocal: 0,
    withholdingTaxOriginal: 0,
    withholdingTaxCurrency: 'USD',
    withholdingTaxLocal: 0,
    brokerTransactionId: 'tx-1',
    ...overrides,
  };
}

// Daily rates for 2025: a few representative dates where per-date diverges from the annual avg.
// Annual average is 4.50 (the value we pass in); daily rates range from 4.40 to 4.60.
const dailyRates2025: Record<string, number> = {
  '2025-01-15': 4.40,
  '2025-03-15': 4.45,
  '2025-06-15': 4.55,
  '2025-09-15': 4.60,
  '2025-12-15': 4.50,
};
const annualAvg2025 = 4.50;

describe('applyBnrRates', () => {
  it('uses annual average rate for dividend transactions (per ANAF rule)', () => {
    const tx = makeTx({
      action: 'dividend',
      transactionDate: new Date('2025-06-15'),
      totalAmountOriginal: 100,
      withholdingTaxOriginal: 15,
    });
    const [result] = applyBnrRates([tx], dailyRates2025, 'RON', annualAvg2025);
    expect(result.exchangeRateToLocal).toBe(annualAvg2025);
    expect(result.totalAmountLocal).toBe(100 * annualAvg2025);
    expect(result.withholdingTaxLocal).toBe(15 * annualAvg2025);
  });

  it('uses per-date rate for buy transactions (capital gains conversion)', () => {
    const tx = makeTx({
      action: 'buy',
      transactionDate: new Date('2025-06-15'),
      totalAmountOriginal: 1000,
    });
    const [result] = applyBnrRates([tx], dailyRates2025, 'RON', annualAvg2025);
    expect(result.exchangeRateToLocal).toBe(4.55);
    expect(result.totalAmountLocal).toBe(1000 * 4.55);
  });

  it('uses per-date rate for sell transactions (capital gains conversion)', () => {
    const tx = makeTx({
      action: 'sell',
      transactionDate: new Date('2025-03-15'),
      totalAmountOriginal: 2000,
    });
    const [result] = applyBnrRates([tx], dailyRates2025, 'RON', annualAvg2025);
    expect(result.exchangeRateToLocal).toBe(4.45);
    expect(result.totalAmountLocal).toBe(2000 * 4.45);
  });

  it('dividend rate differs from buy rate when daily diverges from annual avg', () => {
    // Same transaction date for both; only action differs.
    const buy = makeTx({
      id: 'buy-1',
      action: 'buy',
      transactionDate: new Date('2025-09-15'),
      totalAmountOriginal: 1000,
    });
    const dividend = makeTx({
      id: 'div-1',
      action: 'dividend',
      transactionDate: new Date('2025-09-15'),
      totalAmountOriginal: 1000,
    });
    const [enrichedBuy, enrichedDividend] = applyBnrRates(
      [buy, dividend],
      dailyRates2025,
      'RON',
      annualAvg2025,
    );
    expect(enrichedBuy.exchangeRateToLocal).toBe(4.60);
    expect(enrichedDividend.exchangeRateToLocal).toBe(4.50);
    expect(enrichedBuy.totalAmountLocal).not.toBe(enrichedDividend.totalAmountLocal);
  });

  it('local-currency transactions get rate 1 and original amounts (no conversion)', () => {
    const tx = makeTx({
      action: 'dividend',
      priceCurrency: 'RON',
      totalAmountOriginal: 500,
      withholdingTaxOriginal: 50,
    });
    const [result] = applyBnrRates([tx], dailyRates2025, 'RON', annualAvg2025);
    expect(result.exchangeRateToLocal).toBe(1);
    expect(result.totalAmountLocal).toBe(500);
    expect(result.withholdingTaxLocal).toBe(50);
  });

  it('falls back to per-date when annualAvgRate is null (degraded mode)', () => {
    const tx = makeTx({
      action: 'dividend',
      transactionDate: new Date('2025-09-15'),
      totalAmountOriginal: 100,
    });
    const [result] = applyBnrRates([tx], dailyRates2025, 'RON', null);
    expect(result.exchangeRateToLocal).toBe(4.60);
  });

  it('rounds local amounts to 2 decimals', () => {
    const tx = makeTx({
      action: 'buy',
      transactionDate: new Date('2025-06-15'),
      totalAmountOriginal: 123.456,
    });
    const [result] = applyBnrRates([tx], dailyRates2025, 'RON', annualAvg2025);
    // 123.456 * 4.55 = 561.7248 → 561.72
    expect(result.totalAmountLocal).toBe(561.72);
  });

  it('uses on-or-before fallback when transaction date has no exact rate match', () => {
    // 2025-04-20 has no rate; should fall back to 2025-03-15 (4.45)
    const tx = makeTx({
      action: 'sell',
      transactionDate: new Date('2025-04-20'),
      totalAmountOriginal: 1000,
    });
    const [result] = applyBnrRates([tx], dailyRates2025, 'RON', annualAvg2025);
    expect(result.exchangeRateToLocal).toBe(4.45);
  });

  it('returns transaction unchanged when no per-date rate is available (date before earliest)', () => {
    const tx = makeTx({
      action: 'sell',
      transactionDate: new Date('2024-12-15'),
      totalAmountOriginal: 1000,
    });
    const [result] = applyBnrRates([tx], dailyRates2025, 'RON', annualAvg2025);
    expect(result.exchangeRateToLocal).toBe(0);
    expect(result.totalAmountLocal).toBe(0);
  });

  it('processes mixed transaction batch correctly', () => {
    const txs = [
      makeTx({
        id: 'd1',
        action: 'dividend',
        transactionDate: new Date('2025-01-15'),
        totalAmountOriginal: 50,
      }),
      makeTx({
        id: 'b1',
        action: 'buy',
        transactionDate: new Date('2025-01-15'),
        totalAmountOriginal: 500,
      }),
      makeTx({
        id: 's1',
        action: 'sell',
        transactionDate: new Date('2025-12-15'),
        totalAmountOriginal: 700,
      }),
      makeTx({
        id: 'd2',
        action: 'dividend',
        transactionDate: new Date('2025-12-15'),
        totalAmountOriginal: 30,
      }),
    ];
    const results = applyBnrRates(txs, dailyRates2025, 'RON', annualAvg2025);
    // d1: dividend → annual avg 4.50
    expect(results[0].exchangeRateToLocal).toBe(4.50);
    // b1: buy on 2025-01-15 → per-date 4.40
    expect(results[1].exchangeRateToLocal).toBe(4.40);
    // s1: sell on 2025-12-15 → per-date 4.50 (coincidentally same as annual avg here)
    expect(results[2].exchangeRateToLocal).toBe(4.50);
    // d2: dividend → annual avg 4.50 (same number, different methodology)
    expect(results[3].exchangeRateToLocal).toBe(4.50);
  });
});
