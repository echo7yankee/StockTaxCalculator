import type { Transaction } from '../types/transaction.js';
import type { TaxCalculationResult, SecurityBreakdown, OpeningPosition } from '../types/tax.js';
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
  year: number,
  // Optional override for the foreign tax withheld on dividends, in LOCAL
  // currency. Some statements (e.g. the Revolut Account Statement) carry no
  // withholding line, so the parser sets `withholdingTaxOriginal` to 0 and the
  // dividend tax is over-stated. When the user supplies the amount actually
  // withheld abroad, the results page passes it here and it REPLACES the (zero)
  // summed withholding. Omitting it is byte-identical to the prior behavior.
  dividendWithholdingOverrideLocal?: number,
  // Optional holdings carried in from a PRIOR year, whose acquiring BUYs are NOT
  // in `transactions` (e.g. a year-scoped statement that only covers the target
  // year but sells positions opened earlier). Each seeds a cost-basis lot before
  // the year's transactions run, so such a sell gets its real cost basis instead
  // of 0. Omitting it (or passing []) is byte-identical to the prior behavior.
  // See `OpeningPosition` for the caller contract (do NOT also pass the buys).
  openingPositions: OpeningPosition[] = []
): TaxEngineResult {
  // Sort ALL transactions chronologically — do NOT filter by year.
  // Historical buys are needed to build correct cost basis for positions
  // opened in prior years and sold in the target year.
  const sorted = [...transactions]
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

  const isTargetYear = (t: Transaction) => t.transactionDate.getFullYear() === year;

  // Seed carried-forward holdings BEFORE processing the year's transactions, so a
  // sell of a prior-year position finds its cost basis. `carriedKeys` lets the
  // final breakdown surface a carried position that had NO activity this year
  // (otherwise it would be filtered out and the carry-forward chain would break),
  // while leaving the no-opening-positions path byte-identical.
  const carriedKeys = new Set<string>();
  for (const pos of openingPositions) {
    const key = pos.isin || pos.ticker;
    if (!key || !(pos.shares > 0)) continue;
    holdings.set(key, [{ shares: pos.shares, costPerShareLocal: pos.costPerShareLocal }]);
    carriedKeys.add(key);
    if (!securityData.has(key)) {
      securityData.set(key, {
        isin: pos.isin,
        ticker: pos.ticker,
        securityName: pos.securityName || pos.ticker || pos.isin,
        totalBoughtShares: 0,
        totalSoldShares: 0,
        remainingShares: 0,
        weightedAvgCostLocal: pos.costPerShareLocal,
        totalProceeds: 0,
        totalCostBasis: 0,
        realizedGainLoss: 0,
        totalDividends: 0,
        totalWithholdingTax: 0,
      });
    }
  }

  for (const t of sorted) {
    // Guard against malformed transactions
    if ((t.action === 'buy' || t.action === 'sell') && (!t.shares || t.shares <= 0)) continue;

    const key = t.isin || t.ticker;
    const sec = getOrCreateSecurity(t);
    const exchangeRate = t.exchangeRateToLocal > 0 ? t.exchangeRateToLocal : 1;
    const amountLocal = t.totalAmountLocal || t.totalAmountOriginal * exchangeRate;

    if (t.action === 'buy') {
      // Always process buys to build up lots (regardless of year)
      if (!holdings.has(key)) holdings.set(key, []);
      const lots = holdings.get(key)!;

      if (config.costBasisMethod === 'weighted-average') {
        const existingShares = lots.reduce((s, l) => s + l.shares, 0);
        const existingCost = lots.reduce((s, l) => s + l.shares * l.costPerShareLocal, 0);
        const newTotalShares = existingShares + t.shares;
        const newTotalCost = existingCost + amountLocal;
        const avgCost = newTotalShares > 0 ? newTotalCost / newTotalShares : 0;

        holdings.set(key, [{ shares: newTotalShares, costPerShareLocal: avgCost }]);
        sec.weightedAvgCostLocal = avgCost;
      } else {
        lots.push({ shares: t.shares, costPerShareLocal: amountLocal / t.shares });
      }

      // Only count bought shares for the target year in the breakdown
      if (isTargetYear(t)) {
        sec.totalBoughtShares += t.shares;
      }
    } else if (t.action === 'sell') {
      // Always process sells to reduce lots (correct position tracking)
      const lots = holdings.get(key) ?? [];
      let sharesToSell = t.shares;
      let costBasis = 0;

      if (config.costBasisMethod === 'weighted-average' && lots.length > 0) {
        const avgCost = lots[0].costPerShareLocal;
        costBasis = sharesToSell * avgCost;
        lots[0].shares -= sharesToSell;
        if (lots[0].shares <= 0.0001) lots.splice(0, 1);
      } else {
        while (sharesToSell > 0.0001 && lots.length > 0) {
          const lot = lots[0];
          const sellFromLot = Math.min(sharesToSell, lot.shares);
          costBasis += sellFromLot * lot.costPerShareLocal;
          lot.shares -= sellFromLot;
          sharesToSell -= sellFromLot;
          if (lot.shares <= 0.0001) lots.splice(0, 1);
        }
      }

      // Only accumulate financial totals for sells in the target year
      if (isTargetYear(t)) {
        sec.totalSoldShares += t.shares;
        sec.totalProceeds += amountLocal;
        sec.totalCostBasis += costBasis;
        sec.realizedGainLoss += amountLocal - costBasis;
        totalProceeds += amountLocal;
        totalCostBasis += costBasis;
      }
    } else if (t.action === 'dividend') {
      // Only count dividends in the target year
      if (isTargetYear(t)) {
        sec.totalDividends += amountLocal;
        totalDividends += amountLocal;

        const whLocal = t.withholdingTaxLocal || t.withholdingTaxOriginal * exchangeRate;
        sec.totalWithholdingTax += whLocal;
        totalWithholdingTax += whLocal;
      }
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
  // The foreign-tax credit can never exceed the Romanian dividend tax (the
  // Math.max floor), matching Codul Fiscal art. 131 (creditul fiscal extern).
  const effectiveWithholdingTax =
    dividendWithholdingOverrideLocal != null
      ? Math.max(0, dividendWithholdingOverrideLocal)
      : totalWithholdingTax;
  const dividendTax = Math.max(0, dividendTaxGross - effectiveWithholdingTax);
  // Surface the full ANAF dividend line-up (rd.8/rd.10/rd.11). Round each so the
  // displayed credit reconciles exactly: rd.10 = rd.8 - rd.11.
  const dividendTaxGrossRounded = round2(dividendTaxGross);
  const dividendTaxRounded = round2(dividendTax);
  const dividendForeignCredit = round2(dividendTaxGrossRounded - dividendTaxRounded);

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
  // Early filing discount applies only to income tax (capital gains + dividends), NOT to CASS
  const earlyFilingDiscount = (capitalGainsTax + dividendTax) * config.earlyFilingDiscountRate;

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
      taxBeforeCredit: dividendTaxGrossRounded,
      withholdingTaxPaid: round2(effectiveWithholdingTax),
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

  // Only include securities that had activity in the target year, plus any
  // carried-forward position still held at year end (so it can be persisted and
  // carried into the following year). With no opening positions, `carriedKeys` is
  // empty and this reduces to the original activity-only filter.
  const securities = Array.from(securityData.values())
    .filter(s => s.totalSoldShares > 0 || s.totalBoughtShares > 0 || s.totalDividends > 0
      || (carriedKeys.has(s.isin || s.ticker) && s.remainingShares > 0))
    .map(s => ({
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
