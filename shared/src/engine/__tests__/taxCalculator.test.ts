import { describe, it, expect } from 'vitest';
import { calculateTaxes } from '../taxCalculator.js';
import { romaniaTaxConfig } from '../../taxRules/romania.js';
import type { Transaction } from '../../types/transaction.js';
import type { OpeningPosition } from '../../types/tax.js';

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
      const d = result.taxResult.dividends;
      expect(d.grossTotal).toBe(1000);
      expect(d.taxBeforeCredit).toBe(100); // rd.8: 10% of 1000
      expect(d.withholdingTaxPaid).toBe(50); // rd.9
      expect(d.foreignTaxCredit).toBe(50); // rd.10: credit granted
      // 10% of 1000 = 100, minus 50 WHT = 50
      expect(d.taxOwed).toBe(50); // rd.11
      expect(d.taxRate).toBe(0.10);
      // rd.8 - rd.10 = rd.11, by construction.
      expect(d.taxBeforeCredit - d.foreignTaxCredit).toBe(d.taxOwed);
    });

    it('dividend tax is floored at 0, credit capped at the RO tax due', () => {
      const txs = [
        makeTx({
          id: 'd1',
          action: 'dividend',
          totalAmountOriginal: 100,
          withholdingTaxOriginal: 20, // 20% WHT > 10% RO rate
        }),
      ];
      const result = calculateTaxes(txs, romaniaTaxConfig, 2025);
      const d = result.taxResult.dividends;
      // 10% of 100 = 10 (rd.8), minus 20 WHT = -10, floored to 0 (rd.11). The
      // credit (rd.10) cannot exceed the RO tax due, so it is capped at 10.
      expect(d.taxBeforeCredit).toBe(10);
      expect(d.foreignTaxCredit).toBe(10);
      expect(d.taxOwed).toBe(0);
      expect(d.taxBeforeCredit - d.foreignTaxCredit).toBe(d.taxOwed);
    });
  });

  // The Revolut Account Statement carries no withholding line, so the parser
  // reports 0 withholding and the dividend tax is over-stated. The results page
  // lets the user supply the foreign tax withheld via this optional override.
  describe('dividend withholding override (Revolut beta foreign-tax credit)', () => {
    const dividendTxs = [
      makeTx({ id: 'd1', action: 'dividend', totalAmountOriginal: 1000, withholdingTaxOriginal: 0 }),
    ];

    it('an omitted override is byte-identical to the parsed-withholding result', () => {
      const txs = [makeTx({ id: 'd1', action: 'dividend', totalAmountOriginal: 1000, withholdingTaxOriginal: 30 })];
      const withArg = calculateTaxes(txs, romaniaTaxConfig, 2025, undefined);
      const without = calculateTaxes(txs, romaniaTaxConfig, 2025);
      expect(withArg.taxResult).toEqual(without.taxResult);
      // 10% of 1000 = 100, minus parsed 30 WHT = 70
      expect(without.taxResult.dividends.taxOwed).toBe(70);
    });

    it('replaces the (zero) parsed withholding and lowers the dividend tax', () => {
      const result = calculateTaxes(dividendTxs, romaniaTaxConfig, 2025, 40);
      // 10% of 1000 = 100, minus the supplied 40 = 60
      expect(result.taxResult.dividends.withholdingTaxPaid).toBe(40);
      expect(result.taxResult.dividends.taxOwed).toBe(60);
    });

    it('caps the foreign-tax credit at the Romanian dividend tax (floored at 0)', () => {
      // A user whose dividends were withheld abroad at >10% (e.g. US 15%) owes
      // nothing more in Romania: 10% of 1000 = 100, minus 150 = -50 -> 0.
      const result = calculateTaxes(dividendTxs, romaniaTaxConfig, 2025, 150);
      expect(result.taxResult.dividends.taxOwed).toBe(0);
      expect(result.taxResult.dividends.withholdingTaxPaid).toBe(150);
    });

    it('floors a negative override at 0 so it can never inflate the tax', () => {
      const result = calculateTaxes(dividendTxs, romaniaTaxConfig, 2025, -50);
      expect(result.taxResult.dividends.withholdingTaxPaid).toBe(0);
      expect(result.taxResult.dividends.taxOwed).toBe(100);
    });

    it('moves only the dividend line + totals, never CASS or capital gains', () => {
      const txs = [
        makeTx({ id: 'b1', action: 'buy', shares: 100, totalAmountOriginal: 10000 }),
        makeTx({ id: 's1', action: 'sell', shares: 100, totalAmountOriginal: 40000 }),
        makeTx({ id: 'd1', action: 'dividend', totalAmountOriginal: 1000, withholdingTaxOriginal: 0 }),
      ];
      const base = calculateTaxes(txs, romaniaTaxConfig, 2025);
      const credited = calculateTaxes(txs, romaniaTaxConfig, 2025, 100);
      // CASS keys off GROSS income (net gains 30000 + gross dividends 1000), unchanged.
      expect(credited.taxResult.healthContribution.amountOwed).toBe(base.taxResult.healthContribution.amountOwed);
      expect(credited.taxResult.healthContribution.totalNonSalaryIncome).toBe(base.taxResult.healthContribution.totalNonSalaryIncome);
      expect(credited.taxResult.capitalGains.taxOwed).toBe(base.taxResult.capitalGains.taxOwed);
      // Dividend tax drops 100 -> 0, so the total and the income-tax-only discount drop too.
      expect(base.taxResult.dividends.taxOwed).toBe(100);
      expect(credited.taxResult.dividends.taxOwed).toBe(0);
      expect(credited.taxResult.totals.totalTaxOwed).toBe(base.taxResult.totals.totalTaxOwed - 100);
      expect(credited.taxResult.totals.earlyFilingDiscount).toBeLessThan(base.taxResult.totals.earlyFilingDiscount);
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

  // Year-round position memory (opportunity #3, PR-1): the engine can be seeded
  // with holdings carried in from a prior year, so a file that only covers the
  // target year but sells a position opened earlier gets its real cost basis.
  // This is the inert engine capability; wiring it to the upload flow is a
  // separate PR. The no-opening-positions path must stay byte-identical.
  describe('opening positions (year-round carry-forward)', () => {
    it('an omitted opening-positions arg is identical to passing []', () => {
      const txs = [
        makeTx({ id: 'b1', action: 'buy', shares: 100, totalAmountOriginal: 10000 }),
        makeTx({ id: 's1', action: 'sell', shares: 100, totalAmountOriginal: 40000 }),
      ];
      const without = calculateTaxes(txs, romaniaTaxConfig, 2025);
      const withEmpty = calculateTaxes(txs, romaniaTaxConfig, 2025, undefined, []);
      // Compare the deterministic parts (taxResult.calculatedAt is a fresh Date).
      expect(withEmpty.securities).toEqual(without.securities);
      expect(withEmpty.taxResult.capitalGains).toEqual(without.taxResult.capitalGains);
      expect(withEmpty.taxResult.dividends).toEqual(without.taxResult.dividends);
      expect(withEmpty.taxResult.healthContribution).toEqual(without.taxResult.healthContribution);
      expect(withEmpty.taxResult.totals).toEqual(without.taxResult.totals);
    });

    it('gives a prior-year position its real cost basis instead of 0', () => {
      // The file covers only 2025 and holds a SELL whose BUY was in an earlier year.
      const txs = [
        makeTx({ id: 's1', action: 'sell', shares: 100, totalAmountOriginal: 40000, transactionDate: new Date('2025-06-01') }),
      ];
      // Without carry-forward: no lot is found, cost basis is 0, the whole 40000
      // is taxed as gain (the over-taxation this feature fixes).
      const naive = calculateTaxes(txs, romaniaTaxConfig, 2025);
      expect(naive.taxResult.capitalGains.totalCostBasis).toBe(0);
      expect(naive.taxResult.capitalGains.netGains).toBe(40000);
      // With the carried opening lot (100 sh @ 100 RON = 10000 basis): gain 30000.
      const opening: OpeningPosition[] = [
        { isin: 'US0378331005', ticker: 'AAPL', shares: 100, costPerShareLocal: 100 },
      ];
      const carried = calculateTaxes(txs, romaniaTaxConfig, 2025, undefined, opening);
      expect(carried.taxResult.capitalGains.totalCostBasis).toBe(10000);
      expect(carried.taxResult.capitalGains.netGains).toBe(30000);
      expect(carried.taxResult.capitalGains.taxOwed).toBe(3000);
    });

    it('re-averages a carried lot with an in-year buy (weighted-average)', () => {
      // Carried 100 sh @ 100 RON, then an in-year buy of 100 sh @ 200 RON.
      // New weighted avg = (100*100 + 100*200) / 200 = 150/share.
      const txs = [
        makeTx({ id: 'b1', action: 'buy', shares: 100, totalAmountOriginal: 20000, transactionDate: new Date('2025-03-01') }),
        makeTx({ id: 's1', action: 'sell', shares: 100, totalAmountOriginal: 30000, transactionDate: new Date('2025-06-01') }),
      ];
      const opening: OpeningPosition[] = [
        { isin: 'US0378331005', ticker: 'AAPL', shares: 100, costPerShareLocal: 100 },
      ];
      const result = calculateTaxes(txs, romaniaTaxConfig, 2025, undefined, opening);
      // Sell 100 @ avg 150 -> cost basis 15000, proceeds 30000, gain 15000.
      expect(result.taxResult.capitalGains.totalCostBasis).toBe(15000);
      expect(result.taxResult.capitalGains.netGains).toBe(15000);
      const sec = result.securities[0];
      // 100 carried + 100 bought - 100 sold = 100 remaining, at the blended avg.
      expect(sec.remainingShares).toBe(100);
      expect(sec.weightedAvgCostLocal).toBe(150);
    });

    it('surfaces an untouched carried position so it persists to next year', () => {
      // AAPL is carried and held all year with no 2025 activity; only MSFT trades.
      const txs = [
        makeTx({ id: 'b1', isin: 'US5949181045', ticker: 'MSFT', action: 'buy', shares: 5, totalAmountOriginal: 1000 }),
      ];
      const opening: OpeningPosition[] = [
        { isin: 'US0378331005', ticker: 'AAPL', shares: 40, costPerShareLocal: 90 },
      ];
      const result = calculateTaxes(txs, romaniaTaxConfig, 2025, undefined, opening);
      const aapl = result.securities.find(s => s.ticker === 'AAPL');
      expect(aapl).toBeDefined();
      expect(aapl!.remainingShares).toBe(40);
      expect(aapl!.weightedAvgCostLocal).toBe(90);
      expect(aapl!.totalSoldShares).toBe(0);
      expect(aapl!.realizedGainLoss).toBe(0);
    });

    it('a carried position sold to zero surfaces via its sell, with real basis', () => {
      const txs = [
        makeTx({ id: 's1', action: 'sell', shares: 50, totalAmountOriginal: 10000 }),
      ];
      const opening: OpeningPosition[] = [
        { isin: 'US0378331005', ticker: 'AAPL', shares: 50, costPerShareLocal: 100 },
      ];
      const result = calculateTaxes(txs, romaniaTaxConfig, 2025, undefined, opening);
      const aapl = result.securities.find(s => s.ticker === 'AAPL')!;
      expect(aapl.remainingShares).toBe(0);
      expect(aapl.totalSoldShares).toBe(50);
      expect(aapl.totalCostBasis).toBe(5000);
      expect(aapl.realizedGainLoss).toBe(5000);
    });

    it('matches an opening position by ISIN, falling back to ticker', () => {
      // Opening and sell are both ticker-only (no ISIN); they must still match.
      const txs = [
        makeTx({ id: 's1', isin: '', ticker: 'TSLA', action: 'sell', shares: 10, totalAmountOriginal: 5000 }),
      ];
      const opening: OpeningPosition[] = [
        { isin: '', ticker: 'TSLA', shares: 10, costPerShareLocal: 200 },
      ];
      const result = calculateTaxes(txs, romaniaTaxConfig, 2025, undefined, opening);
      expect(result.taxResult.capitalGains.totalCostBasis).toBe(2000);
      expect(result.taxResult.capitalGains.netGains).toBe(3000);
    });

    it('ignores malformed opening positions (no key or non-positive shares)', () => {
      const txs = [
        makeTx({ id: 's1', action: 'sell', shares: 10, totalAmountOriginal: 5000 }),
      ];
      const opening: OpeningPosition[] = [
        { isin: '', ticker: '', shares: 10, costPerShareLocal: 100 }, // no key -> ignored
        { isin: 'US0378331005', ticker: 'AAPL', shares: 0, costPerShareLocal: 100 }, // 0 shares -> ignored
      ];
      const result = calculateTaxes(txs, romaniaTaxConfig, 2025, undefined, opening);
      // Nothing seeded AAPL, so the sell falls back to cost basis 0.
      expect(result.taxResult.capitalGains.totalCostBasis).toBe(0);
      expect(result.taxResult.capitalGains.netGains).toBe(5000);
    });
  });
});
