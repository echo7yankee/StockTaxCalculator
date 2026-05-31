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

// Fixture transactions default to USD; this wraps a single currency's rates in
// the per-currency map applyBnrRates now expects (rates are keyed by currency so
// a mixed-currency statement converts each transaction at its own rate).
function usd(annualAvg: number | null, daily: Record<string, number> = dailyRates2025) {
  return { USD: { daily, annualAvg } };
}

describe('applyBnrRates', () => {
  it('uses annual average rate for dividend transactions (per ANAF rule)', () => {
    const tx = makeTx({
      action: 'dividend',
      transactionDate: new Date('2025-06-15'),
      totalAmountOriginal: 100,
      withholdingTaxOriginal: 15,
    });
    const [result] = applyBnrRates([tx], usd(annualAvg2025), 'RON');
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
    const [result] = applyBnrRates([tx], usd(annualAvg2025), 'RON');
    expect(result.exchangeRateToLocal).toBe(4.55);
    expect(result.totalAmountLocal).toBe(1000 * 4.55);
  });

  it('uses per-date rate for sell transactions (capital gains conversion)', () => {
    const tx = makeTx({
      action: 'sell',
      transactionDate: new Date('2025-03-15'),
      totalAmountOriginal: 2000,
    });
    const [result] = applyBnrRates([tx], usd(annualAvg2025), 'RON');
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
      usd(annualAvg2025),
      'RON',
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
    const [result] = applyBnrRates([tx], usd(annualAvg2025), 'RON');
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
    const [result] = applyBnrRates([tx], usd(null), 'RON');
    expect(result.exchangeRateToLocal).toBe(4.60);
  });

  it('rounds local amounts to 2 decimals', () => {
    const tx = makeTx({
      action: 'buy',
      transactionDate: new Date('2025-06-15'),
      totalAmountOriginal: 123.456,
    });
    const [result] = applyBnrRates([tx], usd(annualAvg2025), 'RON');
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
    const [result] = applyBnrRates([tx], usd(annualAvg2025), 'RON');
    expect(result.exchangeRateToLocal).toBe(4.45);
  });

  it('returns transaction unchanged when no per-date rate is available (date before earliest)', () => {
    const tx = makeTx({
      action: 'sell',
      transactionDate: new Date('2024-12-15'),
      totalAmountOriginal: 1000,
    });
    const [result] = applyBnrRates([tx], usd(annualAvg2025), 'RON');
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
    const results = applyBnrRates(txs, usd(annualAvg2025), 'RON');
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
    const enrichedA = applyBnrRates(raw, usd(null, daily), 'RON');
    const { taxResult: resultA } = calculateTaxes(enrichedA, romaniaTaxConfig, 2025);

    // METHOD B — new/correct per ANAF: dividends use annual avg, buy/sell per-date.
    const enrichedB = applyBnrRates(raw, usd(annualAvg, daily), 'RON');
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

    const enrichedA = applyBnrRates(dividendOnly, usd(null, dailyMatchingAvg), 'RON');
    const enrichedB = applyBnrRates(dividendOnly, usd(4.50, dailyMatchingAvg), 'RON');
    const { taxResult: resultA } = calculateTaxes(enrichedA, romaniaTaxConfig, 2025);
    const { taxResult: resultB } = calculateTaxes(enrichedB, romaniaTaxConfig, 2025);

    expect(resultA.dividends.grossTotal).toBe(resultB.dividends.grossTotal);
    expect(resultA.dividends.withholdingTaxPaid).toBe(resultB.dividends.withholdingTaxPaid);
  });
});

// ----------------------------------------------------------------------------
// Multi-currency: rates are keyed by currency so a statement mixing several
// foreign currencies converts each transaction at its OWN currency's rate
// rather than a single dominant currency's rate (backlog #5). IBKR and merged
// multi-file exports make mixed-currency statements common.
// ----------------------------------------------------------------------------

describe('applyBnrRates multi-currency', () => {
  it('converts each transaction at its own currency rate (not a single dominant rate)', () => {
    const usdBuy = makeTx({
      id: 'usd-b',
      action: 'buy',
      priceCurrency: 'USD',
      transactionDate: new Date('2025-06-15'),
      totalAmountOriginal: 1000,
    });
    const gbpBuy = makeTx({
      id: 'gbp-b',
      action: 'buy',
      priceCurrency: 'GBP',
      transactionDate: new Date('2025-06-15'),
      totalAmountOriginal: 1000,
    });
    const [usdResult, gbpResult] = applyBnrRates(
      [usdBuy, gbpBuy],
      {
        USD: { daily: { '2025-06-15': 4.55 }, annualAvg: 4.50 },
        GBP: { daily: { '2025-06-15': 5.80 }, annualAvg: 5.75 },
      },
      'RON',
    );
    expect(usdResult.exchangeRateToLocal).toBe(4.55);
    expect(usdResult.totalAmountLocal).toBe(4550);
    expect(gbpResult.exchangeRateToLocal).toBe(5.80);
    expect(gbpResult.totalAmountLocal).toBe(5800);
  });

  it('applies each currency annual average to its own dividends', () => {
    const usdDiv = makeTx({
      id: 'usd-d',
      action: 'dividend',
      priceCurrency: 'USD',
      transactionDate: new Date('2025-06-15'),
      totalAmountOriginal: 100,
    });
    const gbpDiv = makeTx({
      id: 'gbp-d',
      action: 'dividend',
      priceCurrency: 'GBP',
      transactionDate: new Date('2025-06-15'),
      totalAmountOriginal: 100,
    });
    const [usdResult, gbpResult] = applyBnrRates(
      [usdDiv, gbpDiv],
      {
        USD: { daily: { '2025-06-15': 4.55 }, annualAvg: 4.50 },
        GBP: { daily: { '2025-06-15': 5.80 }, annualAvg: 5.75 },
      },
      'RON',
    );
    // Dividends use the annual average of THEIR currency, not the per-date rate.
    expect(usdResult.exchangeRateToLocal).toBe(4.50);
    expect(gbpResult.exchangeRateToLocal).toBe(5.75);
  });

  it('returns a transaction unchanged when its currency has no rates (no silent mis-conversion)', () => {
    const eurBuy = makeTx({
      id: 'eur-b',
      action: 'buy',
      priceCurrency: 'EUR',
      transactionDate: new Date('2025-06-15'),
      totalAmountOriginal: 1000,
    });
    const [result] = applyBnrRates(
      [eurBuy],
      { USD: { daily: { '2025-06-15': 4.55 }, annualAvg: 4.50 } },
      'RON',
    );
    // EUR is absent: leave it for the caller to warn about, never convert it at the USD rate.
    expect(result.exchangeRateToLocal).toBe(0);
    expect(result.totalAmountLocal).toBe(0);
  });

  it('still skips local-currency (RON) transactions in a mixed-currency batch', () => {
    const ronTx = makeTx({
      id: 'ron',
      action: 'buy',
      priceCurrency: 'RON',
      transactionDate: new Date('2025-06-15'),
      totalAmountOriginal: 500,
    });
    const usdTx = makeTx({
      id: 'usd',
      action: 'buy',
      priceCurrency: 'USD',
      transactionDate: new Date('2025-06-15'),
      totalAmountOriginal: 1000,
    });
    const [ronResult, usdResult] = applyBnrRates(
      [ronTx, usdTx],
      { USD: { daily: { '2025-06-15': 4.55 }, annualAvg: 4.50 } },
      'RON',
    );
    expect(ronResult.exchangeRateToLocal).toBe(1);
    expect(ronResult.totalAmountLocal).toBe(500);
    expect(usdResult.exchangeRateToLocal).toBe(4.55);
  });

  it('degrades to per-date per currency (one currency missing its annual average)', () => {
    const usdDiv = makeTx({
      id: 'usd-d',
      action: 'dividend',
      priceCurrency: 'USD',
      transactionDate: new Date('2025-06-15'),
      totalAmountOriginal: 100,
    });
    const gbpDiv = makeTx({
      id: 'gbp-d',
      action: 'dividend',
      priceCurrency: 'GBP',
      transactionDate: new Date('2025-06-15'),
      totalAmountOriginal: 100,
    });
    const [usdResult, gbpResult] = applyBnrRates(
      [usdDiv, gbpDiv],
      {
        USD: { daily: { '2025-06-15': 4.55 }, annualAvg: 4.50 },
        GBP: { daily: { '2025-06-15': 5.80 }, annualAvg: null }, // GBP average fetch failed
      },
      'RON',
    );
    expect(usdResult.exchangeRateToLocal).toBe(4.50); // USD dividend uses annual avg
    expect(gbpResult.exchangeRateToLocal).toBe(5.80); // GBP dividend degrades to per-date
  });
});

// Integration: a mixed USD + GBP batch feeding calculateTaxes. Each security
// converts at its own currency's rates and the engine sums the gains. This is
// the link the unit tests don't cover: a single dominant rate would produce a
// different number for the GBP security, so this locks in per-currency wiring.
describe('integration: multi-currency batch feeding calculateTaxes', () => {
  it('converts each security at its own currency rate, then sums the gains', () => {
    const ratesByCurrency = {
      USD: { daily: { '2025-03-15': 4.45, '2025-06-15': 4.55 }, annualAvg: 4.50 },
      GBP: { daily: { '2025-03-15': 5.70, '2025-06-15': 5.80 }, annualAvg: 5.75 },
    };
    const usdBase = {
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
      withholdingTaxOriginal: 0,
    };
    const gbpBase = {
      ...usdBase,
      isin: 'GB00BH4HKS39',
      ticker: 'VOD',
      securityName: 'Vodafone Group plc',
      priceCurrency: 'GBP' as const,
      withholdingTaxCurrency: 'GBP' as const,
    };
    const raw: Transaction[] = [
      // USD: buy 10 @ $50 (cost $500), sell 10 @ $100 (proceeds $1000).
      { ...usdBase, id: 'ub', action: 'buy', transactionDate: new Date('2025-03-15'), shares: 10, totalAmountOriginal: 500, brokerTransactionId: 'ub' },
      { ...usdBase, id: 'us', action: 'sell', transactionDate: new Date('2025-06-15'), shares: 10, totalAmountOriginal: 1000, brokerTransactionId: 'us' },
      // GBP: buy 10 @ £40 (cost £400), sell 10 @ £60 (proceeds £600).
      { ...gbpBase, id: 'gb', action: 'buy', transactionDate: new Date('2025-03-15'), shares: 10, totalAmountOriginal: 400, brokerTransactionId: 'gb' },
      { ...gbpBase, id: 'gs', action: 'sell', transactionDate: new Date('2025-06-15'), shares: 10, totalAmountOriginal: 600, brokerTransactionId: 'gs' },
    ];

    const enriched = applyBnrRates(raw, ratesByCurrency, 'RON');
    const { taxResult } = calculateTaxes(enriched, romaniaTaxConfig, 2025);

    // USD security: cost 500 * 4.45 = 2225 RON, proceeds 1000 * 4.55 = 4550 RON, gain 2325 RON.
    // GBP security: cost 400 * 5.70 = 2280 RON, proceeds 600 * 5.80 = 3480 RON, gain 1200 RON.
    expect(taxResult.capitalGains.totalCostBasis).toBe(2225 + 2280); // 4505
    expect(taxResult.capitalGains.totalProceeds).toBe(4550 + 3480); // 8030
    expect(taxResult.capitalGains.netGains).toBe(2325 + 1200); // 3525
    expect(taxResult.capitalGains.taxOwed).toBe(352.5); // 10% of 3525
  });
});
