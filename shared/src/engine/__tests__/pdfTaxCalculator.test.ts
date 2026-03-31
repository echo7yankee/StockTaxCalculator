import { describe, it, expect } from 'vitest';
import { calculateTaxesFromPdf } from '../pdfTaxCalculator.js';
import { romaniaTaxConfig } from '../../taxRules/romania.js';
import type { PdfParseResult, PdfSellTrade, PdfDividend } from '../../parsers/trading212Pdf.js';

function makePdfData(overrides: Partial<PdfParseResult> = {}): PdfParseResult {
  return {
    overview: {
      closedResult: 1000,
      profit: 1200,
      loss: 200,
      netDividends: 90,
      grossDividends: 100,
      taxWithheld: 10,
      openResult: 500,
      accountValue: 5000,
      currency: 'USD',
    },
    sellTrades: [
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
    ],
    dividends: [
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
    distributions: [],
    year: 2025,
    warnings: [],
    ...overrides,
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

  it('calculates early filing discount at 3%', () => {
    const data = makePdfData();
    const result = calculateTaxesFromPdf(data, romaniaTaxConfig, 1);
    const total = result.taxResult.totals.totalTaxOwed;
    expect(result.taxResult.totals.earlyFilingDiscount).toBeCloseTo(total * 0.03, 1);
  });

  it('returns empty securities for no trades or dividends', () => {
    const data = makePdfData({ sellTrades: [], dividends: [], distributions: [] });
    const result = calculateTaxesFromPdf(data, romaniaTaxConfig, 1);
    expect(result.securities).toHaveLength(0);
    expect(result.taxResult.capitalGains.taxOwed).toBe(0);
  });
});
