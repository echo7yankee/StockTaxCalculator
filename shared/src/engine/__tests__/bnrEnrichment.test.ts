import { describe, it, expect } from 'vitest';
import { applyBnrRates } from '../bnrEnrichment.js';
import { calculateTaxes } from '../taxCalculator.js';
import { romaniaTaxConfig } from '../../taxRules/romania.js';
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

// ----------------------------------------------------------------------------
// Integration: applyBnrRates → calculateTaxes
//
// Proves the engine consumes the enriched transactions correctly and that the
// user-visible RON output for dividends changes between methodologies while
// capital gains stays identical. This is the link the pure-unit tests above
// don't cover: it locks in the actual numbers that flow through `taxResult`
// from the same upstream `Transaction[]` so a future refactor that breaks the
// wiring between enrichment and engine fails loudly.
// ----------------------------------------------------------------------------

describe('integration: applyBnrRates feeding calculateTaxes', () => {
  // 2025 fixture: one dividend on a day where daily BNR diverges from the annual
  // average, one buy + one sell forming a capital gain. Annual avg is 4.50;
  // daily rate on the dividend date is 4.60 (intentionally above the average).
  const daily: Record<string, number> = {
    '2025-03-15': 4.45, // buy date
    '2025-06-15': 4.55, // sell date
    '2025-09-15': 4.60, // dividend date (above annual avg)
  };
  const annualAvg = 4.50;

  function buildRawTxs(): Transaction[] {
    const base = {
      csvUploadId: '',
      taxYearId: '',
      isin: 'US0378331005',
      ticker: 'AAPL',
      securityName: 'Apple Inc.',
      pricePerShare: 0,
      priceCurrency: 'USD' as const,
      withholdingTaxCurrency: 'USD' as const,
      exchangeRateToLocal: 0,
      totalAmountLocal: 0,
      withholdingTaxLocal: 0,
    };
    return [
      // Buy 10 shares @ $50 on 2025-03-15 (cost = $500)
      {
        ...base,
        id: 'b1',
        action: 'buy',
        transactionDate: new Date('2025-03-15'),
        shares: 10,
        totalAmountOriginal: 500,
        withholdingTaxOriginal: 0,
        brokerTransactionId: 'b1',
      },
      // Sell 10 shares @ $100 on 2025-06-15 (proceeds = $1000, gain = $500)
      {
        ...base,
        id: 's1',
        action: 'sell',
        transactionDate: new Date('2025-06-15'),
        shares: 10,
        totalAmountOriginal: 1000,
        withholdingTaxOriginal: 0,
        brokerTransactionId: 's1',
      },
      // Dividend $100 gross with $15 WHT on 2025-09-15
      {
        ...base,
        id: 'd1',
        action: 'dividend',
        transactionDate: new Date('2025-09-15'),
        shares: 0,
        totalAmountOriginal: 100,
        withholdingTaxOriginal: 15,
        brokerTransactionId: 'd1',
      },
    ];
  }

  it('dividend grossTotal differs between methods; capital gains identical', () => {
    const raw = buildRawTxs();

    // METHOD A — old/buggy: all transactions use per-date BNR (annualAvgRate = null).
    const enrichedA = applyBnrRates(raw, daily, 'RON', null);
    const { taxResult: resultA } = calculateTaxes(enrichedA, romaniaTaxConfig, 2025);

    // METHOD B — new/correct per ANAF: dividends use annual avg, buy/sell per-date.
    const enrichedB = applyBnrRates(raw, daily, 'RON', annualAvg);
    const { taxResult: resultB } = calculateTaxes(enrichedB, romaniaTaxConfig, 2025);

    // Capital gains math goes through per-date rates in BOTH methods → identical.
    // Buy: $500 * 4.45 = 2225 RON cost basis.
    // Sell: $1000 * 4.55 = 4550 RON proceeds.
    // Net gain: 2325 RON. Tax: 232.50 RON.
    expect(resultA.capitalGains.totalProceeds).toBe(4550);
    expect(resultA.capitalGains.totalCostBasis).toBe(2225);
    expect(resultA.capitalGains.netGains).toBe(2325);
    expect(resultA.capitalGains.taxOwed).toBe(232.5);
    expect(resultB.capitalGains.totalProceeds).toBe(resultA.capitalGains.totalProceeds);
    expect(resultB.capitalGains.totalCostBasis).toBe(resultA.capitalGains.totalCostBasis);
    expect(resultB.capitalGains.netGains).toBe(resultA.capitalGains.netGains);
    expect(resultB.capitalGains.taxOwed).toBe(resultA.capitalGains.taxOwed);

    // Dividend gross diverges between methods — the user-visible bug fix.
    // METHOD A (per-date 4.60): $100 * 4.60 = 460 RON gross, $15 * 4.60 = 69 RON WHT.
    expect(resultA.dividends.grossTotal).toBe(460);
    expect(resultA.dividends.withholdingTaxPaid).toBe(69);
    // METHOD B (annual avg 4.50): $100 * 4.50 = 450 RON gross, $15 * 4.50 = 67.50 RON WHT.
    expect(resultB.dividends.grossTotal).toBe(450);
    expect(resultB.dividends.withholdingTaxPaid).toBe(67.5);

    // The actual RON delta on dividend gross.
    expect(resultA.dividends.grossTotal - resultB.dividends.grossTotal).toBe(10);
    // Dividend tax owed is 0 in both methods (WHT of 15% USD exceeds the 10% RO rate),
    // but the gross/WHT RON amounts feed CASS, so the methodology still matters.
    expect(resultA.dividends.taxOwed).toBe(0);
    expect(resultB.dividends.taxOwed).toBe(0);

    // Total non-salary income for CASS = netGains + dividends. Methods diverge here too.
    expect(resultA.healthContribution.totalNonSalaryIncome).toBe(2325 + 460); // 2785
    expect(resultB.healthContribution.totalNonSalaryIncome).toBe(2325 + 450); // 2775
  });

  it('engine produces same totals when dividend date rate equals annual avg', () => {
    // Sanity: when the daily rate on the dividend date HAPPENS to equal the annual
    // average, both methods produce identical engine output. This guards against
    // a future change accidentally introducing a fudge factor between paths.
    const dailyMatchingAvg: Record<string, number> = {
      '2025-09-15': 4.50, // dividend date — same as annual avg
    };

    const dividendOnly: Transaction[] = [
      {
        id: 'd1',
        csvUploadId: '',
        taxYearId: '',
        action: 'dividend',
        transactionDate: new Date('2025-09-15'),
        isin: 'US0378331005',
        ticker: 'AAPL',
        securityName: 'Apple Inc.',
        shares: 0,
        pricePerShare: 0,
        priceCurrency: 'USD',
        totalAmountOriginal: 100,
        exchangeRateToLocal: 0,
        totalAmountLocal: 0,
        withholdingTaxOriginal: 15,
        withholdingTaxCurrency: 'USD',
        withholdingTaxLocal: 0,
        brokerTransactionId: 'd1',
      },
    ];

    const enrichedA = applyBnrRates(dividendOnly, dailyMatchingAvg, 'RON', null);
    const enrichedB = applyBnrRates(dividendOnly, dailyMatchingAvg, 'RON', 4.50);
    const { taxResult: resultA } = calculateTaxes(enrichedA, romaniaTaxConfig, 2025);
    const { taxResult: resultB } = calculateTaxes(enrichedB, romaniaTaxConfig, 2025);

    expect(resultA.dividends.grossTotal).toBe(resultB.dividends.grossTotal);
    expect(resultA.dividends.withholdingTaxPaid).toBe(resultB.dividends.withholdingTaxPaid);
  });
});
