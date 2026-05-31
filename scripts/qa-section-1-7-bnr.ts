#!/usr/bin/env tsx
/**
 * QA harness for Priority 1.7 PR 1 (CSV dividend annual-avg BNR fix).
 *
 * Exercises the full enrichment + engine chain against REAL 2025 BNR rates
 * fetched from production (https://investax.app/api/exchange-rates/...).
 * Builds a representative Transaction[] (one buy, one sell, two dividends on
 * dates where daily BNR diverges meaningfully from the annual average) and
 * prints exact RON breakdowns for both methodologies:
 *
 *   - METHOD A (old/buggy): per-date BNR for ALL transactions including dividends
 *   - METHOD B (new/correct per ANAF): annual avg for dividends, per-date for buy/sell
 *
 * Prints a side-by-side comparison so a human (me, the agent acting as QA)
 * can visually verify the engine produces the expected user-visible deltas.
 *
 * One-shot script for this PR's QA pass. Not a CI gate — see
 * `shared/src/engine/__tests__/bnrEnrichment.test.ts` for the locked-in
 * regression suite.
 */

import { applyBnrRates } from '../shared/src/engine/bnrEnrichment.js';
import { calculateTaxes } from '../shared/src/engine/taxCalculator.js';
import { romaniaTaxConfig } from '../shared/src/taxRules/romania.js';
import type { Transaction } from '../shared/src/types/transaction.js';

const PROD_BASE = 'https://investax.app';
const YEAR = 2025;
const CURRENCY = 'USD';

async function fetchRates() {
  const [dailyRes, avgRes] = await Promise.all([
    fetch(`${PROD_BASE}/api/exchange-rates/${YEAR}/daily?currency=${CURRENCY}`),
    fetch(`${PROD_BASE}/api/exchange-rates/${YEAR}/average?currency=${CURRENCY}`),
  ]);
  if (!dailyRes.ok || !avgRes.ok) {
    throw new Error(`BNR fetch failed: daily=${dailyRes.status} avg=${avgRes.status}`);
  }
  const daily = await dailyRes.json();
  const avg = await avgRes.json();
  return {
    dailyRates: daily.rates as Record<string, number>,
    dailyCount: daily.count as number,
    annualAvg: avg.rate as number,
  };
}

function buildTransactions(): Transaction[] {
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
    // Buy 100 shares for $15,000 on 2025-02-10
    {
      ...base,
      id: 'b1',
      action: 'buy',
      transactionDate: new Date('2025-02-10'),
      shares: 100,
      totalAmountOriginal: 15000,
      withholdingTaxOriginal: 0,
      brokerTransactionId: 'b1',
    },
    // Sell 100 shares for $20,000 on 2025-10-15 (capital gain = $5,000)
    {
      ...base,
      id: 's1',
      action: 'sell',
      transactionDate: new Date('2025-10-15'),
      shares: 100,
      totalAmountOriginal: 20000,
      withholdingTaxOriginal: 0,
      brokerTransactionId: 's1',
    },
    // Dividend $250 gross, $37.50 WHT on 2025-01-15 (daily rate near year start)
    {
      ...base,
      id: 'd1',
      action: 'dividend',
      transactionDate: new Date('2025-01-15'),
      shares: 0,
      totalAmountOriginal: 250,
      withholdingTaxOriginal: 37.50,
      brokerTransactionId: 'd1',
    },
    // Dividend $250 gross, $37.50 WHT on 2025-07-15 (daily rate mid-year)
    {
      ...base,
      id: 'd2',
      action: 'dividend',
      transactionDate: new Date('2025-07-15'),
      shares: 0,
      totalAmountOriginal: 250,
      withholdingTaxOriginal: 37.50,
      brokerTransactionId: 'd2',
    },
  ];
}

function fmt(n: number): string {
  return n.toFixed(2).padStart(12, ' ');
}

async function main() {
  console.log('=================================================================');
  console.log('  QA Harness — Section 1.7 CSV Dividend Annual-Avg BNR Fix');
  console.log('=================================================================');
  console.log(`  Tax year: ${YEAR} (Romania)`);
  console.log(`  Foreign currency: ${CURRENCY}`);
  console.log(`  Engine: shared/src/engine/{bnrEnrichment,taxCalculator}.ts`);
  console.log('');

  console.log('Fetching real BNR rates from production...');
  const { dailyRates, dailyCount, annualAvg } = await fetchRates();
  console.log(`  ✓ Daily rates: ${dailyCount} dates`);
  console.log(`  ✓ Annual avg : ${annualAvg.toFixed(4)} RON/USD`);
  console.log(`  ✓ Daily 2025-01-15: ${dailyRates['2025-01-15']?.toFixed(4) ?? 'n/a'}`);
  console.log(`  ✓ Daily 2025-07-15: ${dailyRates['2025-07-15']?.toFixed(4) ?? 'n/a'}`);
  console.log(`  ✓ Daily 2025-02-10: ${dailyRates['2025-02-10']?.toFixed(4) ?? 'n/a'}`);
  console.log(`  ✓ Daily 2025-10-15: ${dailyRates['2025-10-15']?.toFixed(4) ?? 'n/a'}`);
  console.log('');

  const txs = buildTransactions();
  console.log('Test scenario:');
  console.log(`  Buy 100 sh @ $150 on 2025-02-10  ($15,000 cost)`);
  console.log(`  Sell 100 sh @ $200 on 2025-10-15 ($20,000 proceeds, $5,000 gain USD)`);
  console.log(`  Dividend $250 gross, $37.50 WHT on 2025-01-15`);
  console.log(`  Dividend $250 gross, $37.50 WHT on 2025-07-15`);
  console.log('');

  // METHOD A: old/buggy — per-date for ALL (annualAvgRate = null)
  const enrichedA = applyBnrRates(txs, { [CURRENCY]: { daily: dailyRates, annualAvg: null } }, 'RON');
  const { taxResult: rA } = calculateTaxes(enrichedA, romaniaTaxConfig, YEAR);

  // METHOD B: new/correct ANAF — annual avg for dividends only
  const enrichedB = applyBnrRates(txs, { [CURRENCY]: { daily: dailyRates, annualAvg } }, 'RON');
  const { taxResult: rB } = calculateTaxes(enrichedB, romaniaTaxConfig, YEAR);

  console.log('Per-transaction BNR rates applied:');
  console.log('                                METHOD A (old)   METHOD B (ANAF)');
  for (let i = 0; i < txs.length; i++) {
    const label = `  ${enrichedA[i].action.padEnd(10)} ${enrichedA[i].transactionDate.toISOString().split('T')[0]}`;
    const rateA = enrichedA[i].exchangeRateToLocal.toFixed(4);
    const rateB = enrichedB[i].exchangeRateToLocal.toFixed(4);
    const diff = enrichedA[i].exchangeRateToLocal !== enrichedB[i].exchangeRateToLocal ? ' ← DIFFERS' : '';
    console.log(`${label}   ${rateA.padStart(15)}   ${rateB.padStart(15)}${diff}`);
  }
  console.log('');

  console.log('Engine output (RON):');
  console.log('                                METHOD A (old)   METHOD B (ANAF)   DELTA');
  const lines: [string, number, number][] = [
    ['  capitalGains.totalProceeds  ', rA.capitalGains.totalProceeds, rB.capitalGains.totalProceeds],
    ['  capitalGains.totalCostBasis ', rA.capitalGains.totalCostBasis, rB.capitalGains.totalCostBasis],
    ['  capitalGains.netGains       ', rA.capitalGains.netGains, rB.capitalGains.netGains],
    ['  capitalGains.taxOwed        ', rA.capitalGains.taxOwed, rB.capitalGains.taxOwed],
    ['  dividends.grossTotal        ', rA.dividends.grossTotal, rB.dividends.grossTotal],
    ['  dividends.withholdingTaxPaid', rA.dividends.withholdingTaxPaid, rB.dividends.withholdingTaxPaid],
    ['  dividends.taxOwed           ', rA.dividends.taxOwed, rB.dividends.taxOwed],
    ['  healthContrib.totalIncome   ', rA.healthContribution.totalNonSalaryIncome, rB.healthContribution.totalNonSalaryIncome],
    ['  healthContrib.amountOwed    ', rA.healthContribution.amountOwed, rB.healthContribution.amountOwed],
    ['  totals.totalTaxOwed         ', rA.totals.totalTaxOwed, rB.totals.totalTaxOwed],
    ['  totals.totalAfterDiscount   ', rA.totals.totalAfterDiscount, rB.totals.totalAfterDiscount],
  ];
  for (const [label, a, b] of lines) {
    const delta = b - a;
    const arrow = Math.abs(delta) < 0.005 ? '       ' : (delta > 0 ? '  +    ' : '  -    ');
    console.log(`${label} ${fmt(a)}    ${fmt(b)}   ${arrow}${fmt(Math.abs(delta))}`);
  }
  console.log('');

  // Sanity assertions
  let passed = 0;
  let failed = 0;
  const check = (name: string, cond: boolean) => {
    if (cond) { console.log(`  ✓ ${name}`); passed++; }
    else { console.log(`  ✗ ${name}`); failed++; }
  };

  console.log('QA assertions:');
  check('Capital gains proceeds identical between methods',
    rA.capitalGains.totalProceeds === rB.capitalGains.totalProceeds);
  check('Capital gains cost basis identical between methods',
    rA.capitalGains.totalCostBasis === rB.capitalGains.totalCostBasis);
  check('Capital gains tax owed identical between methods (fix did not break this)',
    rA.capitalGains.taxOwed === rB.capitalGains.taxOwed);
  check('Dividend gross differs between methods (fix is doing something)',
    rA.dividends.grossTotal !== rB.dividends.grossTotal);
  check('Method B dividend gross equals 2 × $250 × annual avg',
    Math.abs(rB.dividends.grossTotal - 2 * 250 * annualAvg) < 0.02);
  check('Method B WHT equals 2 × $37.50 × annual avg',
    Math.abs(rB.dividends.withholdingTaxPaid - 2 * 37.50 * annualAvg) < 0.02);
  check('Method A dividend gross equals daily(2025-01-15)*250 + daily(2025-07-15)*250',
    Math.abs(rA.dividends.grossTotal - (dailyRates['2025-01-15'] * 250 + dailyRates['2025-07-15'] * 250)) < 0.02);
  console.log('');

  console.log('Adversarial: degraded mode (annual avg fetch failed → annualAvgRate = null):');
  const degraded = applyBnrRates(txs, { [CURRENCY]: { daily: dailyRates, annualAvg: null } }, 'RON');
  const divDates = ['2025-01-15', '2025-07-15'];
  const divEnriched = degraded.filter(t => t.action === 'dividend');
  let degradedOk = true;
  for (let i = 0; i < divEnriched.length; i++) {
    const expectedRate = dailyRates[divDates[i]];
    if (Math.abs(divEnriched[i].exchangeRateToLocal - expectedRate) > 0.0001) {
      degradedOk = false;
    }
  }
  check('Degraded mode falls back to per-date for dividends (no crash, no silent zero)', degradedOk);
  console.log('');

  console.log('=================================================================');
  if (failed === 0) {
    console.log(`  RESULT: PASS (${passed}/${passed + failed} assertions passed)`);
  } else {
    console.log(`  RESULT: FAIL (${failed} of ${passed + failed} assertions FAILED)`);
    process.exit(1);
  }
  console.log('=================================================================');
}

main().catch(err => {
  console.error('QA harness crashed:', err);
  process.exit(1);
});
