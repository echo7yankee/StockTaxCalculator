import { describe, it, expect } from 'vitest';
import { calculateTaxes } from '../taxCalculator.js';
import { romaniaTaxConfig } from '../../taxRules/romania.js';
import type { Transaction } from '../../types/transaction.js';

function makeTx(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 'tx-1',
    csvUploadId: '',
    taxYearId: '',
    action: 'buy',
    transactionDate: new Date('2025-06-01'),
    isin: 'US0378331005',
    ticker: 'AAPL',
    securityName: 'Apple Inc.',
    shares: 10,
    pricePerShare: 100,
    priceCurrency: 'USD',
    totalAmountOriginal: 1000,
    exchangeRateToLocal: 1,
    totalAmountLocal: 0,
    withholdingTaxOriginal: 0,
    withholdingTaxCurrency: 'USD',
    withholdingTaxLocal: 0,
    brokerTransactionId: 'tx-1',
    ...overrides,
  };
}

describe('calculateTaxes', () => {
  it('only counts target-year buys in breakdown but processes all for lots', () => {
    const txs = [
      makeTx({ transactionDate: new Date('2024-01-01'), action: 'buy' }),
      makeTx({ id: 'tx-2', transactionDate: new Date('2025-06-01'), action: 'buy' }),
    ];
    const result = calculateTaxes(txs, romaniaTaxConfig, 2025);
    // Only the 2025 buy shows in breakdown
    expect(result.securities).toHaveLength(1);
    expect(result.securities[0].totalBoughtShares).toBe(10);
    // But remaining shares includes both years' buys (lot management)
    expect(result.securities[0].remainingShares).toBe(20);
  });

  it('uses historical buys for cost basis when selling in target year', () => {
    const txs = [
      // Buy 100 shares in 2023 at $20/share
      makeTx({ id: 'b1', transactionDate: new Date('2023-06-01'), action: 'buy', shares: 100, totalAmountOriginal: 2000 }),
      // Buy 50 shares in 2024 at $30/share
      makeTx({ id: 'b2', transactionDate: new Date('2024-06-01'), action: 'buy', shares: 50, totalAmountOriginal: 1500 }),
      // Sell 100 shares in 2025 at $150/share
      makeTx({ id: 's1', transactionDate: new Date('2025-06-01'), action: 'sell', shares: 100, totalAmountOriginal: 15000 }),
    ];
    const result = calculateTaxes(txs, romaniaTaxConfig, 2025);
    // Weighted avg cost = (2000 + 1500) / 150 = 23.33/share
    // Cost basis for 100 shares sold = 100 * 23.33 = 2333.33
    expect(result.taxResult.capitalGains.totalCostBasis).toBeCloseTo(2333.33, 0);
    expect(result.taxResult.capitalGains.totalProceeds).toBe(15000);
    expect(result.taxResult.capitalGains.netGains).toBeCloseTo(12666.67, 0);
    // 50 shares remaining
    expect(result.securities[0].remainingShares).toBe(50);
  });

  it('prior-year sells reduce lots before target year', () => {
    const txs = [
      // Buy 200 shares in 2023 at $20
      makeTx({ id: 'b1', transactionDate: new Date('2023-01-01'), action: 'buy', shares: 200, totalAmountOriginal: 4000 }),
      // Sell 100 shares in 2024
      makeTx({ id: 's1', transactionDate: new Date('2024-06-01'), action: 'sell', shares: 100, totalAmountOriginal: 5000 }),
      // Sell 50 shares in 2025
      makeTx({ id: 's2', transactionDate: new Date('2025-06-01'), action: 'sell', shares: 50, totalAmountOriginal: 7500 }),
    ];
    const result = calculateTaxes(txs, romaniaTaxConfig, 2025);
    // The 2024 sell should NOT count toward 2025 totals
    // Only the 2025 sell matters: proceeds = 7500, cost = 50 * 20 = 1000
    expect(result.taxResult.capitalGains.totalProceeds).toBe(7500);
    expect(result.taxResult.capitalGains.totalCostBasis).toBe(1000);
    expect(result.taxResult.capitalGains.netGains).toBe(6500);
    // 50 shares remaining (200 - 100 - 50)
    expect(result.securities[0].remainingShares).toBe(50);
  });

  describe('weighted-average cost basis', () => {
    it('calculates correct avg cost with two buys', () => {
      const txs = [
        makeTx({ id: 'b1', action: 'buy', shares: 10, totalAmountOriginal: 1000 }),
        makeTx({ id: 'b2', action: 'buy', shares: 10, totalAmountOriginal: 2000 }),
        makeTx({ id: 's1', action: 'sell', shares: 10, totalAmountOriginal: 2000 }),
      ];
      const result = calculateTaxes(txs, romaniaTaxConfig, 2025);
      const sec = result.securities[0];
      // Avg cost = (1000+2000)/20 = 150/share. Sell 10 shares: cost basis = 1500
      expect(sec.totalCostBasis).toBe(1500);
      expect(sec.totalProceeds).toBe(2000);
      expect(sec.realizedGainLoss).toBe(500);
    });
  });

  describe('capital gains tax', () => {
    it('applies 10% rate on net gains', () => {
      const txs = [
        makeTx({ id: 'b1', action: 'buy', shares: 10, totalAmountOriginal: 1000 }),
        makeTx({ id: 's1', action: 'sell', shares: 10, totalAmountOriginal: 2000 }),
      ];
      const result = calculateTaxes(txs, romaniaTaxConfig, 2025);
      expect(result.taxResult.capitalGains.netGains).toBe(1000);
      expect(result.taxResult.capitalGains.taxOwed).toBe(100);
    });

    it('net gains are zero when there is a loss', () => {
      const txs = [
        makeTx({ id: 'b1', action: 'buy', shares: 10, totalAmountOriginal: 2000 }),
        makeTx({ id: 's1', action: 'sell', shares: 10, totalAmountOriginal: 1000 }),
      ];
      const result = calculateTaxes(txs, romaniaTaxConfig, 2025);
      expect(result.taxResult.capitalGains.netGains).toBe(0);
      expect(result.taxResult.capitalGains.losses).toBe(1000);
      expect(result.taxResult.capitalGains.taxOwed).toBe(0);
    });
  });

  describe('dividend tax', () => {
    it('applies 10% minus withholding tax', () => {
      const txs = [
        makeTx({
          id: 'd1',
          action: 'dividend',
          totalAmountOriginal: 1000,
          withholdingTaxOriginal: 50,
        }),
      ];
      const result = calculateTaxes(txs, romaniaTaxConfig, 2025);
      expect(result.taxResult.dividends.grossTotal).toBe(1000);
      expect(result.taxResult.dividends.withholdingTaxPaid).toBe(50);
      // 10% of 1000 = 100, minus 50 WHT = 50
      expect(result.taxResult.dividends.taxOwed).toBe(50);
    });

    it('dividend tax is floored at 0', () => {
      const txs = [
        makeTx({
          id: 'd1',
          action: 'dividend',
          totalAmountOriginal: 100,
          withholdingTaxOriginal: 20, // 20% WHT > 10% RO rate
        }),
      ];
      const result = calculateTaxes(txs, romaniaTaxConfig, 2025);
      // 10% of 100 = 10, minus 20 WHT = -10, floored to 0
      expect(result.taxResult.dividends.taxOwed).toBe(0);
    });
  });

  describe('CASS health contribution brackets', () => {
    it('returns 0 for income below 24,300', () => {
      const txs = [
        makeTx({ id: 'b1', action: 'buy', shares: 10, totalAmountOriginal: 1000 }),
        makeTx({ id: 's1', action: 'sell', shares: 10, totalAmountOriginal: 2000 }),
      ];
      // Net gains = 1000, under 24300
      const result = calculateTaxes(txs, romaniaTaxConfig, 2025);
      expect(result.taxResult.healthContribution.amountOwed).toBe(0);
      expect(result.taxResult.healthContribution.thresholdHit).toBe('none');
    });

    it('returns 2,430 for income in 24,300-48,600 bracket', () => {
      const txs = [
        makeTx({ id: 'b1', action: 'buy', shares: 100, totalAmountOriginal: 10000 }),
        makeTx({ id: 's1', action: 'sell', shares: 100, totalAmountOriginal: 40000 }),
      ];
      // Net gains = 30000, in 24300-48600 bracket
      const result = calculateTaxes(txs, romaniaTaxConfig, 2025);
      expect(result.taxResult.healthContribution.amountOwed).toBe(2430);
      expect(result.taxResult.healthContribution.thresholdHit).toBe('6x');
    });

    it('returns 4,860 for income in 48,600-97,200 bracket', () => {
      const txs = [
        makeTx({ id: 'b1', action: 'buy', shares: 100, totalAmountOriginal: 10000 }),
        makeTx({ id: 's1', action: 'sell', shares: 100, totalAmountOriginal: 70000 }),
      ];
      // Net gains = 60000
      const result = calculateTaxes(txs, romaniaTaxConfig, 2025);
      expect(result.taxResult.healthContribution.amountOwed).toBe(4860);
      expect(result.taxResult.healthContribution.thresholdHit).toBe('12x');
    });

    it('returns 9,720 for income over 97,200', () => {
      const txs = [
        makeTx({ id: 'b1', action: 'buy', shares: 100, totalAmountOriginal: 10000 }),
        makeTx({ id: 's1', action: 'sell', shares: 100, totalAmountOriginal: 120000 }),
      ];
      // Net gains = 110000
      const result = calculateTaxes(txs, romaniaTaxConfig, 2025);
      expect(result.taxResult.healthContribution.amountOwed).toBe(9720);
      expect(result.taxResult.healthContribution.thresholdHit).toBe('24x');
    });
  });

  describe('early filing discount', () => {
    it('calculates 3% discount on income tax only (excludes CASS)', () => {
      const txs = [
        makeTx({ id: 'b1', action: 'buy', shares: 100, totalAmountOriginal: 10000 }),
        makeTx({ id: 's1', action: 'sell', shares: 100, totalAmountOriginal: 120000 }),
      ];
      const result = calculateTaxes(txs, romaniaTaxConfig, 2025);
      const incomeTax = result.taxResult.capitalGains.taxOwed + result.taxResult.dividends.taxOwed;
      expect(result.taxResult.totals.earlyFilingDiscount).toBeCloseTo(incomeTax * 0.03, 1);
      const totalTax = result.taxResult.totals.totalTaxOwed;
      expect(result.taxResult.totals.totalAfterDiscount).toBeCloseTo(totalTax - incomeTax * 0.03, 1);
    });
  });

  describe('per-security breakdown', () => {
    it('tracks multiple securities separately', () => {
      const txs = [
        makeTx({ id: 'b1', isin: 'US0378331005', ticker: 'AAPL', action: 'buy', shares: 10, totalAmountOriginal: 1000 }),
        makeTx({ id: 'b2', isin: 'US5949181045', ticker: 'MSFT', action: 'buy', shares: 5, totalAmountOriginal: 2000 }),
        makeTx({ id: 's1', isin: 'US0378331005', ticker: 'AAPL', action: 'sell', shares: 10, totalAmountOriginal: 1500 }),
      ];
      const result = calculateTaxes(txs, romaniaTaxConfig, 2025);
      expect(result.securities).toHaveLength(2);
      const aapl = result.securities.find(s => s.ticker === 'AAPL')!;
      const msft = result.securities.find(s => s.ticker === 'MSFT')!;
      expect(aapl.totalSoldShares).toBe(10);
      expect(aapl.realizedGainLoss).toBe(500);
      expect(msft.totalBoughtShares).toBe(5);
      expect(msft.totalSoldShares).toBe(0);
    });
  });

  it('returns empty result for no matching transactions', () => {
    const result = calculateTaxes([], romaniaTaxConfig, 2025);
    expect(result.taxResult.capitalGains.taxOwed).toBe(0);
    expect(result.taxResult.dividends.taxOwed).toBe(0);
    expect(result.taxResult.healthContribution.amountOwed).toBe(0);
    expect(result.securities).toHaveLength(0);
  });
});
