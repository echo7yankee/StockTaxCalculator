/**
 * Tax calculator for Trading212 Annual Statement PDF data.
 *
 * Unlike the CSV flow, the PDF already has pre-computed results:
 * - Sell trades include total result (gain/loss)
 * - Dividends include gross, WHT, and net amounts
 * - The overview has summary totals
 *
 * We still need to:
 * - Apply Romanian tax rates
 * - Calculate CASS health contribution brackets
 * - Calculate early filing discount
 * - Build per-security breakdown
 */

import type { TaxCalculationResult, SecurityBreakdown } from '../types/tax.js';
import type { CountryTaxConfig } from '../types/country.js';
import type { PdfParseResult, PdfDividend } from '../parsers/trading212Pdf.js';
import { makeRateLookup } from './bnrEnrichment.js';

export interface PdfTaxEngineResult {
  taxResult: TaxCalculationResult;
  securities: SecurityBreakdown[];
  warnings: string[];
}

/**
 * Extracts the calendar date from a Trading212 sell-trade `executionTime`
 * (e.g. "22.01.2025 19:16" or bare "15.03.2025") as an ISO `YYYY-MM-DD` string
 * for BNR per-date rate lookup. Returns null when no `DD.MM.YYYY` date is
 * present, in which case the caller falls back to the annual-average rate.
 */
function executionDateToIso(executionTime: string): string | null {
  const m = /(\d{2})\.(\d{2})\.(\d{4})/.exec(executionTime);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

export function calculateTaxesFromPdf(
  pdfData: PdfParseResult,
  config: CountryTaxConfig,
  exchangeRate: number = 1,
  dailyRates?: Record<string, number>
): PdfTaxEngineResult {
  // Capital gains from `transferul titlurilor de valoare` convert at the BNR
  // rate valid on each trade's execution date (Codul Fiscal art. 96). When a
  // per-date `dailyRates` map is supplied (keys `YYYY-MM-DD`), each sell trade
  // uses its own date's rate, with weekend/holiday dates resolving to the last
  // prior business day. Without the map (or when a trade's date is missing or
  // precedes every known rate), the trade falls back to the single annual
  // `exchangeRate`, preserving the prior annual-average behavior for callers
  // that don't supply daily rates and for degraded fetches. Dividends always
  // convert at `exchangeRate` (the annual average, art. 131 alin. 6).
  const dailyLookup = dailyRates ? makeRateLookup(dailyRates) : null;
  const sellTradeRate = (trade: { executionTime: string }): number => {
    if (!dailyLookup) return exchangeRate;
    const iso = executionDateToIso(trade.executionTime);
    const rate = iso ? dailyLookup(iso) : null;
    return rate ?? exchangeRate;
  };

  // Build per-security breakdown from sell trades + dividends + distributions
  const secMap = new Map<string, SecurityBreakdown>();

  function getOrCreate(isin: string, ticker: string, name: string): SecurityBreakdown {
    const key = isin || ticker;
    if (!secMap.has(key)) {
      secMap.set(key, {
        isin,
        ticker,
        securityName: name,
        totalBoughtShares: 0,
        totalSoldShares: 0,
        remainingShares: 0,
        weightedAvgCostLocal: 0,
        totalProceeds: 0,
        totalCostBasis: 0,
        realizedGainLoss: 0,
        totalDividends: 0,
        totalWithholdingTax: 0,
      });
    }
    return secMap.get(key)!;
  }

  // Process sell trades
  let totalProceeds = 0;
  let totalCostBasis = 0;

  for (const trade of pdfData.sellTrades) {
    const sec = getOrCreate(trade.isin, trade.instrument, trade.instrument);
    const rate = sellTradeRate(trade);
    const proceeds = trade.positionSize * trade.executionPrice * (trade.fxRate || 1) * rate;
    const costBasis = proceeds - (trade.totalResult * rate);

    sec.totalSoldShares += trade.positionSize;
    sec.totalProceeds += round2(proceeds);
    sec.totalCostBasis += round2(costBasis);
    sec.realizedGainLoss += round2(trade.totalResult * rate);
    sec.weightedAvgCostLocal = trade.averagePrice * (trade.fxRate || 1) * rate;

    totalProceeds += proceeds;
    totalCostBasis += costBasis;
  }

  // Process dividends
  let totalDividends = 0;
  let totalWithholdingTax = 0;

  const processDividend = (div: PdfDividend) => {
    const sec = getOrCreate(div.isin, div.instrument, div.instrument);
    const gross = div.grossAmountUsd * exchangeRate;
    const wht = div.whtUsd * exchangeRate;

    sec.totalDividends += round2(gross);
    sec.totalWithholdingTax += round2(wht);

    totalDividends += gross;
    totalWithholdingTax += wht;
  };

  for (const div of pdfData.dividends) processDividend(div);
  for (const dist of pdfData.distributions) processDividend(dist);

  // Net P/L source: pick whichever total is unit-consistent.
  //
  // Per-row trade.totalResult is in each trade's TRANSACTION currency. Summing
  // is reliable when all trades share that currency AND it matches the overview
  // currency (e.g. Florin Pop: all-RON trades, RON account; Dragos: all-USD,
  // USD account). Per-row is also more directly tied to the parsed rows than
  // overview, which can be wrong if a multi-account T212 PDF causes the parser
  // to pick the wrong account's closedResult.
  //
  // Overview is authoritative when per-row is unit-inconsistent: mixed
  // transaction currencies (Paul Adam: USD + EUR + RON rows) or trade currency
  // not matching overview currency (e.g. RO user holding only USD instruments).
  let closedResultLocal: number;
  if (pdfData.sellTrades.length === 0) {
    closedResultLocal = 0;
  } else {
    const firstCurrency = pdfData.sellTrades[0].transactionCurrency;
    const allSameCurrency = pdfData.sellTrades.every(t => t.transactionCurrency === firstCurrency);
    const matchesOverviewCurrency = !!pdfData.overview.currency && firstCurrency === pdfData.overview.currency;
    if (allSameCurrency && matchesOverviewCurrency) {
      // Per-trade-date conversion (art. 96): each sell trade's result converts
      // at its own execution-date BNR rate, then sums. Falls back to the single
      // exchangeRate per trade when no daily map is supplied (byte-identical to
      // the prior `perRowSum * exchangeRate` behavior).
      closedResultLocal = pdfData.sellTrades.reduce((s, t) => s + t.totalResult * sellTradeRate(t), 0);
    } else {
      // Overview is a single pre-aggregated total with no per-trade dates, so it
      // can only take the single annual-average rate (mixed-currency, or
      // trade-currency != overview-currency cases).
      closedResultLocal = (pdfData.overview.closedResult ?? 0) * exchangeRate;
    }
  }
  const netGains = Math.max(0, closedResultLocal);
  const losses = Math.max(0, -closedResultLocal);
  const capitalGainsTax = netGains * config.capitalGainsTaxRate;

  const dividendTaxGross = totalDividends * config.dividendTaxRate;
  const dividendTax = Math.max(0, dividendTaxGross - totalWithholdingTax);
  // Surface the full ANAF dividend line-up (rd.8/rd.10/rd.11). Round each so the
  // displayed credit reconciles exactly: rd.10 = rd.8 - rd.11.
  const dividendTaxGrossRounded = round2(dividendTaxGross);
  const dividendTaxRounded = round2(dividendTax);
  const dividendForeignCredit = round2(dividendTaxGrossRounded - dividendTaxRounded);

  // CASS health contribution
  const totalNonSalaryIncome = netGains + totalDividends;
  let healthAmount = 0;
  let bracketLabel = 'none';
  for (const bracket of config.healthContributionBrackets) {
    if (totalNonSalaryIncome >= bracket.minIncome &&
        (bracket.maxIncome === null || totalNonSalaryIncome < bracket.maxIncome)) {
      healthAmount = bracket.fixedAmount;
      bracketLabel = bracket.label;
      break;
    }
  }

  const totalTaxOwed = capitalGainsTax + dividendTax + healthAmount;
  // Early filing discount applies only to income tax (capital gains + dividends), NOT to CASS
  const earlyFilingDiscount = (capitalGainsTax + dividendTax) * config.earlyFilingDiscountRate;

  const taxResult: TaxCalculationResult = {
    taxYearId: `${pdfData.year}`,
    capitalGains: {
      totalProceeds: round2(totalProceeds),
      totalCostBasis: round2(totalCostBasis),
      netGains: round2(netGains),
      losses: round2(losses),
      taxRate: config.capitalGainsTaxRate,
      taxOwed: round2(capitalGainsTax),
    },
    dividends: {
      grossTotal: round2(totalDividends),
      taxBeforeCredit: dividendTaxGrossRounded,
      withholdingTaxPaid: round2(totalWithholdingTax),
      foreignTaxCredit: dividendForeignCredit,
      taxOwed: dividendTaxRounded,
      taxRate: config.dividendTaxRate,
    },
    healthContribution: {
      totalNonSalaryIncome: round2(totalNonSalaryIncome),
      thresholdHit: bracketLabel,
      amountOwed: round2(healthAmount),
    },
    totals: {
      totalTaxOwed: round2(totalTaxOwed),
      earlyFilingDiscount: round2(earlyFilingDiscount),
      totalAfterDiscount: round2(totalTaxOwed - earlyFilingDiscount),
    },
    calculatedAt: new Date(),
  };

  const securities = Array.from(secMap.values()).map(s => ({
    ...s,
    totalBoughtShares: round4(s.totalBoughtShares),
    totalSoldShares: round4(s.totalSoldShares),
    remainingShares: round4(s.remainingShares),
    weightedAvgCostLocal: round2(s.weightedAvgCostLocal),
    totalProceeds: round2(s.totalProceeds),
    totalCostBasis: round2(s.totalCostBasis),
    realizedGainLoss: round2(s.realizedGainLoss),
    totalDividends: round2(s.totalDividends),
    totalWithholdingTax: round2(s.totalWithholdingTax),
  }));

  // Sanity warnings: per-row sell-trade sum vs overview.closedResult. Only
  // meaningful when both numbers share a currency (otherwise comparing units
  // would produce false positives, e.g. Paul Adam mixed-currency case where
  // the engine intentionally falls back to overview). When comparable, a sign
  // flip or >10x magnitude gap is the strong signal of a parser misread on a
  // multi-account PDF, which the UI hard-stops on via the warnings banner.
  const warnings: string[] = [];
  if (
    pdfData.sellTrades.length > 0 &&
    pdfData.overview.closedResult != null
  ) {
    const firstCurrency = pdfData.sellTrades[0].transactionCurrency;
    const allSameCurrency = pdfData.sellTrades.every(t => t.transactionCurrency === firstCurrency);
    const matchesOverviewCurrency = !!pdfData.overview.currency && firstCurrency === pdfData.overview.currency;

    if (allSameCurrency && matchesOverviewCurrency) {
      const perRowSum = pdfData.sellTrades.reduce((s, t) => s + t.totalResult, 0);
      const overviewSum = pdfData.overview.closedResult;

      if (perRowSum !== 0 && overviewSum !== 0) {
        if (Math.sign(perRowSum) !== Math.sign(overviewSum)) {
          warnings.push(
            `Sign mismatch between per-row sell trades (${perRowSum.toFixed(2)} ${firstCurrency}) and overview closed result (${overviewSum.toFixed(2)} ${firstCurrency}). The PDF may have a multi-account layout the parser misread.`
          );
        }
        const ratio = Math.max(Math.abs(perRowSum), Math.abs(overviewSum)) / Math.min(Math.abs(perRowSum), Math.abs(overviewSum));
        if (ratio > 10) {
          warnings.push(
            `Magnitude mismatch (>10x) between per-row sell trades (${perRowSum.toFixed(2)} ${firstCurrency}) and overview closed result (${overviewSum.toFixed(2)} ${firstCurrency}). The PDF may have a multi-account layout the parser misread.`
          );
        }
      }
    }
  }

  return { taxResult, securities, warnings };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}
