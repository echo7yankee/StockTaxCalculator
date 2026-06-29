/**
 * Engine year-awareness (backlog #13 PR B): proves the config-driven engines
 * apply the correct year's rates when handed a year-specific config from
 * buildRomaniaTaxConfig, and that the CSV engine partitions transactions across
 * the 2025/2026 boundary. Uses buildRomaniaTaxConfig(TAX_YEARS[year]) directly so
 * the 2026 path is exercised even while engineSupported is false (the live
 * fallback gate is covered in taxConfigForYear.test.ts).
 */
import { describe, it, expect } from 'vitest';
import { calculateTaxes } from '../taxCalculator.js';
import { calculateTaxesFromPdf } from '../pdfTaxCalculator.js';
import { buildRomaniaTaxConfig } from '../../taxRules/romania.js';
import { TAX_YEARS } from '../../taxRules/taxYears.js';
import type { Transaction } from '../../types/transaction.js';
import type { PdfParseResult, PdfSellTrade, PdfDividend } from '../../parsers/trading212Pdf.js';

const config2025 = buildRomaniaTaxConfig(TAX_YEARS[2025]);
const config2026 = buildRomaniaTaxConfig(TAX_YEARS[2026]);

function makeTx(overrides: Partial<Transaction>): Transaction {
  return {
    id: 'tx',
    csvUploadId: 'u',
    taxYearId: 'ty',
    action: 'buy',
    transactionDate: new Date(2025, 0, 1),
    isin: 'US0000000001',
    ticker: 'TST',
    securityName: 'Test Co',
    shares: 0,
    pricePerShare: 0,
    priceCurrency: 'RON',
    totalAmountOriginal: 0,
    exchangeRateToLocal: 1,
    totalAmountLocal: 0,
    withholdingTaxOriginal: 0,
    withholdingTaxCurrency: 'RON',
    withholdingTaxLocal: 0,
    brokerTransactionId: 'b',
    ...overrides,
  };
}

describe('PDF engine dispatches rates by year', () => {
  // 1,000 RON-equivalent capital gain + 1,000 gross dividend (no WHT), rate 1.
  const data: PdfParseResult = {
    overview: {
      closedResult: 1000,
      profit: 1000,
      loss: 0,
      netDividends: 1000,
      grossDividends: 1000,
      taxWithheld: 0,
      openResult: 0,
      accountValue: 0,
      currency: 'USD',
    } as PdfParseResult['overview'],
    sellTrades: [
      {
        executionTime: '15.06.2026 10:00',
        instrument: 'Test Co',
        isin: 'US0000000001',
        instrumentType: 'Stock',
        instrumentCurrency: 'USD',
        positionSize: 10,
        averagePrice: 100,
        executionPrice: 200,
        fxRate: 1,
        transactionCurrency: 'USD',
        totalResult: 1000,
      } as PdfSellTrade,
    ],
    dividends: [
      {
        instrument: 'Test Co',
        isin: 'US0000000001',
        instrumentCurrency: 'USD',
        issuingCountry: 'US',
        eligibleHoldings: 10,
        payDate: '15.06.2026',
        grossAmountPerShare: 100,
        grossAmount: 1000,
        fxRate: 1,
        grossAmountUsd: 1000,
        whtRate: '0%',
        whtUsd: 0,
        netAmountUsd: 1000,
      } as PdfDividend,
    ],
    distributions: [],
    year: 2026,
    warnings: [],
  };

  it('applies 10% to capital gains and dividends under the 2025 config', () => {
    const { taxResult } = calculateTaxesFromPdf(data, config2025, 1);
    expect(taxResult.capitalGains.taxRate).toBe(0.10);
    expect(taxResult.capitalGains.taxOwed).toBeCloseTo(100, 2);
    expect(taxResult.dividends.taxOwed).toBeCloseTo(100, 2);
  });

  it('applies 16% to capital gains and dividends under the 2026 config (Legea 239/2025)', () => {
    const { taxResult } = calculateTaxesFromPdf(data, config2026, 1);
    expect(taxResult.capitalGains.taxRate).toBe(0.16);
    expect(taxResult.capitalGains.taxOwed).toBeCloseTo(160, 2);
    expect(taxResult.dividends.taxOwed).toBeCloseTo(160, 2);
  });
});

describe('CSV engine partitions the 2025/2026 boundary and applies each year its rate', () => {
  // Buy 20 @ 100 RON (2025-01-01), sell 10 @ 200 (2025-12-31), sell 10 @ 300 (2026-01-01).
  // Weighted-average cost stays 100/share, so each sell's cost basis is 1,000.
  const transactions: Transaction[] = [
    makeTx({ action: 'buy', transactionDate: new Date(2025, 0, 1), shares: 20, totalAmountLocal: 2000, totalAmountOriginal: 2000 }),
    makeTx({ action: 'sell', transactionDate: new Date(2025, 11, 31), shares: 10, totalAmountLocal: 2000, totalAmountOriginal: 2000 }),
    makeTx({ action: 'sell', transactionDate: new Date(2026, 0, 1), shares: 10, totalAmountLocal: 3000, totalAmountOriginal: 3000 }),
  ];

  it('2025: counts only the Dec-31-2025 sell (gain 1,000) at 10%', () => {
    const { taxResult } = calculateTaxes(transactions, config2025, 2025);
    expect(taxResult.capitalGains.netGains).toBeCloseTo(1000, 2);
    expect(taxResult.capitalGains.taxRate).toBe(0.10);
    expect(taxResult.capitalGains.taxOwed).toBeCloseTo(100, 2);
  });

  it('2026: counts only the Jan-1-2026 sell (gain 2,000) at 16%', () => {
    const { taxResult } = calculateTaxes(transactions, config2026, 2026);
    expect(taxResult.capitalGains.netGains).toBeCloseTo(2000, 2);
    expect(taxResult.capitalGains.taxRate).toBe(0.16);
    expect(taxResult.capitalGains.taxOwed).toBeCloseTo(320, 2);
  });
});

describe('engine applies the prior-year rates (2023/2024) after the flip', () => {
  // Prior-year regularization go-live (prior-year-regularization-spec.md Step 3):
  // the ONE engine math delta vs 2025 is dividends at 8% (OG 16/2022); cap gains
  // stay 10%, CASS uses the year's brackets. 1,000 RON-equiv gain + 1,000 gross
  // dividend (no WHT), rate 1, so dividend tax is the cleanest 8% vs 10% witness.
  const config2023 = buildRomaniaTaxConfig(TAX_YEARS[2023]);
  const config2024 = buildRomaniaTaxConfig(TAX_YEARS[2024]);
  const priorYearPdf: PdfParseResult = {
    overview: {
      closedResult: 1000, profit: 1000, loss: 0, netDividends: 1000, grossDividends: 1000,
      taxWithheld: 0, openResult: 0, accountValue: 0, currency: 'USD',
    } as PdfParseResult['overview'],
    sellTrades: [
      {
        executionTime: '15.06.2024 10:00', instrument: 'Test Co', isin: 'US0000000001',
        instrumentType: 'Stock', instrumentCurrency: 'USD', positionSize: 10, averagePrice: 100,
        executionPrice: 200, fxRate: 1, transactionCurrency: 'USD', totalResult: 1000,
      } as PdfSellTrade,
    ],
    dividends: [
      {
        instrument: 'Test Co', isin: 'US0000000001', instrumentCurrency: 'USD', issuingCountry: 'US',
        eligibleHoldings: 10, payDate: '15.06.2024', grossAmountPerShare: 100, grossAmount: 1000,
        fxRate: 1, grossAmountUsd: 1000, whtRate: '0%', whtUsd: 0, netAmountUsd: 1000,
      } as PdfDividend,
    ],
    distributions: [],
    year: 2024,
    warnings: [],
  };

  it('2023: cap gains 10%, dividends 8% (the OG 16/2022 delta vs 2025)', () => {
    const { taxResult } = calculateTaxesFromPdf({ ...priorYearPdf, year: 2023 }, config2023, 1);
    expect(taxResult.capitalGains.taxRate).toBe(0.10);
    expect(taxResult.capitalGains.taxOwed).toBeCloseTo(100, 2);
    expect(taxResult.dividends.taxOwed).toBeCloseTo(80, 2); // 8% of 1,000, NOT 2025's 100
  });

  it('2024: cap gains 10%, dividends 8%', () => {
    const { taxResult } = calculateTaxesFromPdf({ ...priorYearPdf, year: 2024 }, config2024, 1);
    expect(taxResult.capitalGains.taxOwed).toBeCloseTo(100, 2);
    expect(taxResult.dividends.taxOwed).toBeCloseTo(80, 2);
  });
});
