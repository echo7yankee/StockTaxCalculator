import { describe, it, expect } from 'vitest';
import { calculateTaxesFromPdf } from '../pdfTaxCalculator.js';
import { romaniaTaxConfig } from '../../taxRules/romania.js';
import type { PdfParseResult, PdfSellTrade, PdfDividend } from '../../parsers/trading212Pdf.js';

function makePdfData(overrides: Partial<PdfParseResult> = {}): PdfParseResult {
  const sellTrades: PdfSellTrade[] = overrides.sellTrades ?? [
    {
      executionTime: '15.03.2025 10:30',
      instrument: 'Apple Inc.',
      isin: 'US0378331005',
      instrumentType: 'Stock',
      instrumentCurrency: 'USD',
      positionSize: 10,
      averagePrice: 130,
      executionPrice: 155,
      fxRate: 1,
      transactionCurrency: 'USD',
      totalResult: 250,
    } as PdfSellTrade,
  ];
  // Default overview.closedResult mirrors per-row sum so single-currency tests stay
  // consistent under the overview-authoritative engine. Tests that want a mismatch
  // (mixed-currency scenarios) pass an explicit overview override.
  const defaultClosedResult = sellTrades.reduce((s, t) => s + t.totalResult, 0);
  return {
    overview: {
      closedResult: defaultClosedResult,
      profit: Math.max(0, defaultClosedResult),
      loss: Math.max(0, -defaultClosedResult),
      netDividends: 90,
      grossDividends: 100,
      taxWithheld: 10,
      openResult: 500,
      accountValue: 5000,
      currency: 'USD',
      ...overrides.overview,
    },
    sellTrades,
    dividends: overrides.dividends ?? [
      {
        instrument: 'Apple Inc.',
        isin: 'US0378331005',
        instrumentCurrency: 'USD',
        issuingCountry: 'US',
        eligibleHoldings: 10,
        payDate: '15.06.2025',
        grossAmountPerShare: 0.25,
        grossAmount: 2.5,
        fxRate: 1,
        grossAmountUsd: 2.5,
        whtRate: '15%',
        whtUsd: 0.38,
        netAmountUsd: 2.12,
      } as PdfDividend,
    ],
    distributions: overrides.distributions ?? [],
    year: overrides.year ?? 2025,
    warnings: overrides.warnings ?? [],
  };
}

describe('calculateTaxesFromPdf', () => {
  it('applies exchange rate to all amounts', () => {
    const data = makePdfData();
    const rate = 4.7;
    const result = calculateTaxesFromPdf(data, romaniaTaxConfig, rate);

    // Proceeds = 10 * 155 * 1 * 4.7 = 7285
    expect(result.taxResult.capitalGains.totalProceeds).toBeCloseTo(7285, 0);
    // Dividends gross = 2.5 * 4.7 = 11.75
    expect(result.taxResult.dividends.grossTotal).toBeCloseTo(11.75, 1);
  });

  it('calculates capital gains tax at 10%', () => {
    const data = makePdfData();
    const result = calculateTaxesFromPdf(data, romaniaTaxConfig, 1);
    const netGains = result.taxResult.capitalGains.netGains;
    expect(result.taxResult.capitalGains.taxOwed).toBeCloseTo(netGains * 0.1, 1);
  });

  it('calculates cost basis from proceeds minus totalResult', () => {
    const data = makePdfData();
    const result = calculateTaxesFromPdf(data, romaniaTaxConfig, 1);
    // Proceeds = 10 * 155 = 1550. Cost = 1550 - 250 = 1300
    const sec = result.securities[0];
    expect(sec.totalProceeds).toBeCloseTo(1550, 0);
    expect(sec.totalCostBasis).toBeCloseTo(1300, 0);
    expect(sec.realizedGainLoss).toBeCloseTo(250, 0);
  });

  it('processes distributions same as dividends', () => {
    const div: PdfDividend = {
      instrument: 'Vanguard ETF',
      isin: 'IE00B3RBWM25',
      instrumentCurrency: 'USD',
      issuingCountry: 'IE',
      eligibleHoldings: 20,
      payDate: '01.09.2025',
      grossAmountPerShare: 0.1,
      grossAmount: 2,
      fxRate: 1,
      grossAmountUsd: 2,
      whtRate: '0%',
      whtUsd: 0,
      netAmountUsd: 2,
    };
    const data = makePdfData({ dividends: [], distributions: [div] });
    const result = calculateTaxesFromPdf(data, romaniaTaxConfig, 1);
    expect(result.taxResult.dividends.grossTotal).toBeCloseTo(2, 1);
  });

  it('groups multiple trades by ISIN in securities breakdown', () => {
    const trade2: PdfSellTrade = {
      executionTime: '20.03.2025 14:00',
      instrument: 'Apple Inc.',
      isin: 'US0378331005',
      instrumentType: 'Stock',
      instrumentCurrency: 'USD',
      positionSize: 5,
      averagePrice: 130,
      executionPrice: 160,
      fxRate: 1,
      transactionCurrency: 'USD',
      totalResult: 150,
    };
    const data = makePdfData();
    data.sellTrades.push(trade2);
    const result = calculateTaxesFromPdf(data, romaniaTaxConfig, 1);
    // Should be grouped into one security
    expect(result.securities.filter(s => s.isin === 'US0378331005')).toHaveLength(1);
    const sec = result.securities.find(s => s.isin === 'US0378331005')!;
    expect(sec.totalSoldShares).toBe(15);
  });

  it('selects correct CASS bracket based on total income', () => {
    // Create large gains to hit top bracket
    const bigTrade: PdfSellTrade = {
      executionTime: '15.03.2025',
      instrument: 'Tesla',
      isin: 'US88160R1014',
      instrumentType: 'Stock',
      instrumentCurrency: 'USD',
      positionSize: 100,
      averagePrice: 100,
      executionPrice: 200,
      fxRate: 1,
      transactionCurrency: 'USD',
      totalResult: 10000,
    };
    const data = makePdfData({ sellTrades: [bigTrade] });
    // With rate 4.7: net gains = 10000 * 4.7 = 47000, + dividends. Should hit 6x bracket (24300-48600)
    const result = calculateTaxesFromPdf(data, romaniaTaxConfig, 4.7);
    expect(result.taxResult.healthContribution.amountOwed).toBe(2430);
  });

  it('calculates early filing discount at 3% of income tax only (excludes CASS)', () => {
    const data = makePdfData();
    const result = calculateTaxesFromPdf(data, romaniaTaxConfig, 1);
    const incomeTax = result.taxResult.capitalGains.taxOwed + result.taxResult.dividends.taxOwed;
    expect(result.taxResult.totals.earlyFilingDiscount).toBeCloseTo(incomeTax * 0.03, 1);
  });

  it('returns empty securities for no trades or dividends', () => {
    const data = makePdfData({ sellTrades: [], dividends: [], distributions: [] });
    const result = calculateTaxesFromPdf(data, romaniaTaxConfig, 1);
    expect(result.securities).toHaveLength(0);
    expect(result.taxResult.capitalGains.taxOwed).toBe(0);
  });

  describe('net P/L source selection (currency-aware fallback)', () => {
    // Paul Adam 2026-05-19: RON account, mixed USD + EUR + RON transaction
    // currencies across rows. Per-row sum is unit-inconsistent so the engine
    // must fall back to overview.closedResult (the only correctly converted
    // total for that PDF). Two-row mixed fixture exercises the fallback.
    function paulLikeMixedCurrencyTrades(): PdfSellTrade[] {
      return [
        {
          executionTime: '27.01.2025 10:00',
          instrument: 'AAA', isin: 'US0000000001', instrumentType: 'Stock',
          instrumentCurrency: 'USD', positionSize: 1, averagePrice: 100,
          executionPrice: 130, fxRate: 1, transactionCurrency: 'USD', totalResult: 30,
        } as PdfSellTrade,
        {
          executionTime: '28.01.2025 10:00',
          instrument: 'BBB', isin: 'IE0000000001', instrumentType: 'Stock',
          instrumentCurrency: 'EUR', positionSize: 2, averagePrice: 50,
          executionPrice: 25, fxRate: 1, transactionCurrency: 'EUR', totalResult: -50,
        } as PdfSellTrade,
      ];
    }

    it('mixed transaction currencies: falls back to overview.closedResult (Paul Adam case)', () => {
      // Mixed USD + EUR trades. Per-row sum is unit-inconsistent. Overview says
      // -365 RON which T212 correctly converted from the row currencies.
      const data = makePdfData({
        sellTrades: paulLikeMixedCurrencyTrades(),
        overview: { closedResult: -365, currency: 'RON' } as PdfParseResult['overview'],
      });
      const result = calculateTaxesFromPdf(data, romaniaTaxConfig, 1);
      expect(result.taxResult.capitalGains.netGains).toBe(0);
      expect(result.taxResult.capitalGains.losses).toBe(365);
      expect(result.taxResult.capitalGains.taxOwed).toBe(0);
    });

    it('single-currency trades matching overview currency: uses per-row sum (Florin Pop case)', () => {
      // Florin Pop 2026-05-24: RON account with all-RON-transaction trades.
      // T212 PDF page 1 has Invest + CFD + Crypto columns side-by-side. Parser
      // had picked CFD overview (-226.80) but per-row sum (3273.75) is the
      // correct Invest result. With matching currencies engine trusts per-row.
      const data = makePdfData({
        sellTrades: [{
          executionTime: '01.03.2025 10:00',
          instrument: 'XYZ', isin: 'RO0000000001', instrumentType: 'Stock',
          instrumentCurrency: 'RON', positionSize: 100, averagePrice: 10,
          executionPrice: 42.74, fxRate: 1, transactionCurrency: 'RON', totalResult: 3273.75,
        } as PdfSellTrade],
        overview: { closedResult: -226.80, currency: 'RON' } as PdfParseResult['overview'],
      });
      const result = calculateTaxesFromPdf(data, romaniaTaxConfig, 1);
      expect(result.taxResult.capitalGains.netGains).toBeCloseTo(3273.75, 2);
      expect(result.taxResult.capitalGains.losses).toBe(0);
      expect(result.taxResult.capitalGains.taxOwed).toBeCloseTo(327.38, 2);
    });

    it('single currency NOT matching overview currency: falls back to overview', () => {
      // RO customer trading only US stocks. Per-row totals in USD; overview is
      // in RON. Engine cannot apply the exchangeRate to per-row safely so it
      // falls back to the T212-converted overview value.
      const data = makePdfData({
        sellTrades: [{
          executionTime: '01.03.2025 10:00',
          instrument: 'AAPL', isin: 'US0378331005', instrumentType: 'Stock',
          instrumentCurrency: 'USD', positionSize: 10, averagePrice: 100,
          executionPrice: 110, fxRate: 1, transactionCurrency: 'USD', totalResult: 100,
        } as PdfSellTrade],
        overview: { closedResult: 460, currency: 'RON' } as PdfParseResult['overview'],
      });
      const result = calculateTaxesFromPdf(data, romaniaTaxConfig, 1);
      expect(result.taxResult.capitalGains.netGains).toBeCloseTo(460, 2);
    });

    it('Dragos all-USD with exchangeRate 4.7 multiplies per-row sum (USD overview equals per-row)', () => {
      // Single USD trade, USD overview, USD account. allSameCurrency match
      // overview, per-row sum used. Result equivalent to overview path since
      // closedResult equals per-row sum in single-currency PDFs.
      const data = makePdfData({
        sellTrades: [{
          executionTime: '15.03.2025', instrument: 'NVDA', isin: 'US67066G1040',
          instrumentType: 'Stock', instrumentCurrency: 'USD', positionSize: 70,
          averagePrice: 30, executionPrice: 146, fxRate: 1, transactionCurrency: 'USD',
          totalResult: 8094,
        } as PdfSellTrade],
        overview: { closedResult: 8094, currency: 'USD' } as PdfParseResult['overview'],
      });
      const result = calculateTaxesFromPdf(data, romaniaTaxConfig, 4.7);
      expect(result.taxResult.capitalGains.netGains).toBeCloseTo(38041.80, 0);
      expect(result.taxResult.capitalGains.taxOwed).toBeCloseTo(3804.18, 0);
    });

    it('zero sell trades: netGains and losses both 0 regardless of overview', () => {
      const data = makePdfData({
        sellTrades: [],
        overview: { closedResult: 999, currency: 'USD' } as PdfParseResult['overview'],
      });
      const result = calculateTaxesFromPdf(data, romaniaTaxConfig, 1);
      expect(result.taxResult.capitalGains.netGains).toBe(0);
      expect(result.taxResult.capitalGains.losses).toBe(0);
      expect(result.taxResult.capitalGains.taxOwed).toBe(0);
    });

    it('CASS bracket reflects overview-derived netGains (Paul case below threshold)', () => {
      const data = makePdfData({
        sellTrades: paulLikeMixedCurrencyTrades(),
        overview: { closedResult: -365, currency: 'RON' } as PdfParseResult['overview'],
        dividends: [{
          instrument: 'X', isin: 'US0000000002', instrumentCurrency: 'USD',
          issuingCountry: 'US', eligibleHoldings: 1, payDate: '15.06.2025',
          grossAmountPerShare: 1, grossAmount: 93.7, fxRate: 1,
          grossAmountUsd: 93.7, whtRate: '10%', whtUsd: 7.74, netAmountUsd: 85.96,
        } as PdfDividend],
      });
      const result = calculateTaxesFromPdf(data, romaniaTaxConfig, 1);
      expect(result.taxResult.healthContribution.thresholdHit).toBe('none');
      expect(result.taxResult.healthContribution.amountOwed).toBe(0);
      expect(result.taxResult.healthContribution.totalNonSalaryIncome).toBeCloseTo(93.7, 1);
    });
  });
});
