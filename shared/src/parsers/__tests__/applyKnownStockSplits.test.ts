import { describe, it, expect } from 'vitest';
import { applyKnownStockSplits } from '../applyKnownStockSplits.js';
import type { StockSplit } from '../../data/stockSplits.js';
import { calculateTaxes } from '../../engine/taxCalculator.js';
import { romaniaTaxConfig } from '../../taxRules/romania.js';
import type { Transaction } from '../../types/transaction.js';

function tx(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 'x',
    csvUploadId: '',
    taxYearId: '',
    action: 'buy',
    transactionDate: new Date('2023-01-15'),
    isin: 'US67066G1040',
    ticker: 'NVDA',
    securityName: 'NVIDIA',
    shares: 1,
    pricePerShare: 1200,
    priceCurrency: 'USD',
    totalAmountOriginal: 1200,
    exchangeRateToLocal: 1,
    totalAmountLocal: 0,
    withholdingTaxOriginal: 0,
    withholdingTaxCurrency: 'USD',
    withholdingTaxLocal: 0,
    brokerTransactionId: '',
    ...overrides,
  };
}

describe('applyKnownStockSplits', () => {
  it('injects a zero-cost buy for shares held across a known forward split', () => {
    const { transactions, appliedSplits, warnings } = applyKnownStockSplits([
      tx({ action: 'buy', shares: 1, transactionDate: new Date('2023-01-15') }),
    ]);

    expect(warnings).toEqual([]);
    expect(appliedSplits).toHaveLength(1);
    expect(appliedSplits[0]).toMatchObject({ ticker: 'NVDA', ratio: 10, addedShares: 9 });

    const injected = transactions.find((t) => t.id.startsWith('split-NVDA'));
    expect(injected).toBeDefined();
    expect(injected).toMatchObject({
      action: 'buy',
      shares: 9,
      pricePerShare: 0,
      totalAmountOriginal: 0,
      totalAmountLocal: 0,
      isin: 'US67066G1040',
    });
    // Dated at the split effective date (UTC midnight).
    expect(injected!.transactionDate.getTime()).toBe(Date.parse('2024-06-10T00:00:00Z'));
  });

  it('does not adjust a position opened on/after the split date', () => {
    // Bought only AFTER NVDA's 2024-06-10 split: already in post-split units.
    const { appliedSplits, transactions } = applyKnownStockSplits([
      tx({ transactionDate: new Date('2024-06-10') }),
      tx({ transactionDate: new Date('2024-09-01') }),
    ]);
    expect(appliedSplits).toEqual([]);
    expect(transactions).toHaveLength(2);
  });

  it('does not adjust a position fully sold before the split', () => {
    const { appliedSplits } = applyKnownStockSplits([
      tx({ id: 'b', action: 'buy', shares: 1, transactionDate: new Date('2024-01-10') }),
      tx({ id: 's', action: 'sell', shares: 1, transactionDate: new Date('2024-02-10') }),
    ]);
    expect(appliedSplits).toEqual([]);
  });

  it('adjusts net held shares (buys minus pre-split sells)', () => {
    // Buy 3, sell 1 before the split -> net 2 held -> inject 2 * (10-1) = 18.
    const { appliedSplits } = applyKnownStockSplits([
      tx({ id: 'b', action: 'buy', shares: 3, transactionDate: new Date('2023-01-15') }),
      tx({ id: 's', action: 'sell', shares: 1, transactionDate: new Date('2023-06-15') }),
    ]);
    expect(appliedSplits[0].addedShares).toBe(18);
  });

  it('applies sequential splits on the same security chronologically (TSLA 5:1 then 3:1)', () => {
    // 1 TSLA held since 2019 -> after 2020 5:1 = 5 -> after 2022 3:1 = 15.
    const { appliedSplits, transactions } = applyKnownStockSplits([
      tx({ isin: 'US88160R1014', ticker: 'TSLA', shares: 1, transactionDate: new Date('2019-05-01') }),
    ]);
    const tsla = appliedSplits.filter((s) => s.ticker === 'TSLA');
    expect(tsla).toHaveLength(2);
    // Order is chronological: 5:1 (2020) injects 4, then 3:1 (2022) injects held(5) * 2 = 10.
    expect(tsla.map((s) => s.addedShares)).toEqual([4, 10]);
    const finalHeld = transactions
      .filter((t) => t.ticker === 'TSLA' && t.action === 'buy')
      .reduce((sum, t) => sum + t.shares, 0);
    expect(finalHeld).toBe(15);
  });

  it('matches by ticker when a transaction has no ISIN', () => {
    const { appliedSplits } = applyKnownStockSplits([
      tx({ isin: '', ticker: 'NVDA', shares: 2, transactionDate: new Date('2023-01-15') }),
    ]);
    expect(appliedSplits[0]).toMatchObject({ ticker: 'NVDA', addedShares: 18 });
  });

  it('does not match on ticker when the transaction has a different ISIN', () => {
    // Same NVDA ticker but a foreign cross-listing ISIN -> precise ISIN match fails.
    const { appliedSplits } = applyKnownStockSplits([
      tx({ isin: 'DE000A0X9XX1', ticker: 'NVDA', shares: 1, transactionDate: new Date('2023-01-15') }),
    ]);
    expect(appliedSplits).toEqual([]);
  });

  it('leaves untracked securities untouched', () => {
    const input = [
      tx({ isin: 'US5949181045', ticker: 'MSFT', shares: 5, transactionDate: new Date('2020-01-01') }),
    ];
    const { transactions, appliedSplits, warnings } = applyKnownStockSplits(input);
    expect(appliedSplits).toEqual([]);
    expect(warnings).toEqual([]);
    expect(transactions).toHaveLength(1);
  });

  it('warns (and does not inject) for a reverse split', () => {
    const reverse: StockSplit[] = [
      { isin: 'US67066G1040', ticker: 'NVDA', ratio: 0.1, effectiveDate: '2024-06-10', label: 'NVDA 1:10' },
    ];
    const { transactions, appliedSplits, warnings } = applyKnownStockSplits(
      [tx({ shares: 10, transactionDate: new Date('2023-01-15') })],
      reverse,
    );
    expect(appliedSplits).toEqual([]);
    expect(transactions).toHaveLength(1);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/reverse stock split/i);
  });

  it('does not mutate the input array', () => {
    const input = [tx({ shares: 1, transactionDate: new Date('2023-01-15') })];
    const before = input.length;
    applyKnownStockSplits(input);
    expect(input).toHaveLength(before);
  });

  it('returns an empty result for no transactions', () => {
    const { transactions, appliedSplits, warnings } = applyKnownStockSplits([]);
    expect(transactions).toEqual([]);
    expect(appliedSplits).toEqual([]);
    expect(warnings).toEqual([]);
  });
});

describe('cost basis correctness through calculateTaxes', () => {
  // Buy 1 NVDA @ $1200 in 2023, hold through the June 2024 10:1 split, sell 10 @
  // $130 in 2025. Real result: spent $1200, sold for $1300, gain $100.
  const buy = tx({ id: 'buy', action: 'buy', shares: 1, totalAmountOriginal: 1200, transactionDate: new Date('2023-01-15') });
  const sell = tx({ id: 'sell', action: 'sell', shares: 10, pricePerShare: 130, totalAmountOriginal: 1300, transactionDate: new Date('2025-03-15') });

  it('without the split fix, the engine reports a large fake loss', () => {
    const { taxResult } = calculateTaxes([buy, sell], romaniaTaxConfig, 2025);
    // Cost basis = 10 shares * $1200 avg = 12000 against 1300 proceeds.
    expect(taxResult.capitalGains.netGains).toBe(0);
    expect(taxResult.capitalGains.losses).toBeCloseTo(10700, 2);
  });

  it('with the split fix, the engine reports the correct $100 gain', () => {
    const { transactions } = applyKnownStockSplits([buy, sell]);
    const { taxResult } = calculateTaxes(transactions, romaniaTaxConfig, 2025);
    expect(taxResult.capitalGains.totalProceeds).toBeCloseTo(1300, 2);
    expect(taxResult.capitalGains.totalCostBasis).toBeCloseTo(1200, 2);
    expect(taxResult.capitalGains.netGains).toBeCloseTo(100, 2);
    expect(taxResult.capitalGains.losses).toBe(0);
  });
});
