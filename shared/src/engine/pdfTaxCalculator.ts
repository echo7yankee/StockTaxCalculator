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

export interface PdfTaxEngineResult {
  taxResult: TaxCalculationResult;
  securities: SecurityBreakdown[];
}

export function calculateTaxesFromPdf(
  pdfData: PdfParseResult,
  config: CountryTaxConfig,
  exchangeRate: number = 1
): PdfTaxEngineResult {
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
    const proceeds = trade.positionSize * trade.executionPrice * (trade.fxRate || 1) * exchangeRate;
    const costBasis = proceeds - (trade.totalResult * exchangeRate);

    sec.totalSoldShares += trade.positionSize;
    sec.totalProceeds += round2(proceeds);
    sec.totalCostBasis += round2(costBasis);
    sec.realizedGainLoss += round2(trade.totalResult * exchangeRate);
    sec.weightedAvgCostLocal = trade.averagePrice * (trade.fxRate || 1) * exchangeRate;

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

  // Tax calculations
  const netGains = Math.max(0, totalProceeds - totalCostBasis);
  const losses = Math.max(0, totalCostBasis - totalProceeds);
  const capitalGainsTax = netGains * config.capitalGainsTaxRate;

  const dividendTaxGross = totalDividends * config.dividendTaxRate;
  const dividendTax = Math.max(0, dividendTaxGross - totalWithholdingTax);

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
      withholdingTaxPaid: round2(totalWithholdingTax),
      taxOwed: round2(dividendTax),
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

  return { taxResult, securities };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}
