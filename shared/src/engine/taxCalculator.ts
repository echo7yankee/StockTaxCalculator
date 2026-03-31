import type { Transaction } from '../types/transaction.js';
import type { TaxCalculationResult, SecurityBreakdown } from '../types/tax.js';
import type { CountryTaxConfig } from '../types/country.js';

interface HoldingLot {
  shares: number;
  costPerShareLocal: number;
}

export interface TaxEngineResult {
  taxResult: TaxCalculationResult;
  securities: SecurityBreakdown[];
}

export function calculateTaxes(
  transactions: Transaction[],
  config: CountryTaxConfig,
  year: number
): TaxEngineResult {
  const sorted = [...transactions]
    .filter(t => t.transactionDate.getFullYear() === year)
    .sort((a, b) => a.transactionDate.getTime() - b.transactionDate.getTime());

  // Per-security tracking
  const holdings = new Map<string, HoldingLot[]>();
  const securityData = new Map<string, SecurityBreakdown>();

  let totalProceeds = 0;
  let totalCostBasis = 0;
  let totalDividends = 0;
  let totalWithholdingTax = 0;

  function getOrCreateSecurity(t: Transaction): SecurityBreakdown {
    const key = t.isin || t.ticker;
    if (!securityData.has(key)) {
      securityData.set(key, {
        isin: t.isin,
        ticker: t.ticker,
        securityName: t.securityName,
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
    return securityData.get(key)!;
  }

  for (const t of sorted) {
    const key = t.isin || t.ticker;
    const sec = getOrCreateSecurity(t);
    const amountLocal = t.totalAmountLocal || t.totalAmountOriginal * t.exchangeRateToLocal;

    if (t.action === 'buy') {
      sec.totalBoughtShares += t.shares;

      if (!holdings.has(key)) holdings.set(key, []);
      const lots = holdings.get(key)!;

      if (config.costBasisMethod === 'weighted-average') {
        // Weighted average: merge into a single lot
        const existingShares = lots.reduce((s, l) => s + l.shares, 0);
        const existingCost = lots.reduce((s, l) => s + l.shares * l.costPerShareLocal, 0);
        const newTotalShares = existingShares + t.shares;
        const newTotalCost = existingCost + amountLocal;
        const avgCost = newTotalShares > 0 ? newTotalCost / newTotalShares : 0;

        holdings.set(key, [{ shares: newTotalShares, costPerShareLocal: avgCost }]);
        sec.weightedAvgCostLocal = avgCost;
      } else {
        // FIFO fallback
        lots.push({ shares: t.shares, costPerShareLocal: amountLocal / t.shares });
      }
    } else if (t.action === 'sell') {
      sec.totalSoldShares += t.shares;
      sec.totalProceeds += amountLocal;
      totalProceeds += amountLocal;

      const lots = holdings.get(key) ?? [];
      let sharesToSell = t.shares;
      let costBasis = 0;

      if (config.costBasisMethod === 'weighted-average' && lots.length > 0) {
        const avgCost = lots[0].costPerShareLocal;
        costBasis = sharesToSell * avgCost;
        lots[0].shares -= sharesToSell;
        if (lots[0].shares <= 0.0001) lots.splice(0, 1);
      } else {
        // FIFO
        while (sharesToSell > 0.0001 && lots.length > 0) {
          const lot = lots[0];
          const sellFromLot = Math.min(sharesToSell, lot.shares);
          costBasis += sellFromLot * lot.costPerShareLocal;
          lot.shares -= sellFromLot;
          sharesToSell -= sellFromLot;
          if (lot.shares <= 0.0001) lots.splice(0, 1);
        }
      }

      sec.totalCostBasis += costBasis;
      totalCostBasis += costBasis;
      sec.realizedGainLoss += amountLocal - costBasis;
    } else if (t.action === 'dividend') {
      sec.totalDividends += amountLocal;
      totalDividends += amountLocal;

      const whLocal = t.withholdingTaxLocal || t.withholdingTaxOriginal * t.exchangeRateToLocal;
      sec.totalWithholdingTax += whLocal;
      totalWithholdingTax += whLocal;
    }
  }

  // Update remaining shares
  for (const [key, lots] of holdings) {
    const sec = securityData.get(key);
    if (sec) {
      sec.remainingShares = lots.reduce((s, l) => s + l.shares, 0);
    }
  }

  // Tax calculations
  const netGains = Math.max(0, totalProceeds - totalCostBasis);
  const losses = Math.max(0, totalCostBasis - totalProceeds);
  const capitalGainsTax = netGains * config.capitalGainsTaxRate;

  const dividendTaxGross = totalDividends * config.dividendTaxRate;
  const dividendTax = Math.max(0, dividendTaxGross - totalWithholdingTax);

  // Health contribution (CASS)
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
  const earlyFilingDiscount = totalTaxOwed * config.earlyFilingDiscountRate;

  const taxResult: TaxCalculationResult = {
    taxYearId: `${year}`,
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

  const securities = Array.from(securityData.values()).map(s => ({
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
