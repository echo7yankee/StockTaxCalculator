import { describe, it, expect } from 'vitest';
import { generateAuditTrailCsv, type AuditTrailCsvLabels } from '../auditTrailCsv.js';
import { calculateTaxes } from '../taxCalculator.js';
import { getTaxConfigForYear, romaniaTaxConfig } from '../../taxRules/index.js';
import type { TaxCalculationResult, SecurityBreakdown, PdfAuditRow } from '../../types/tax.js';
import type { Transaction, TransactionAction } from '../../types/transaction.js';

/**
 * Recognizable label set: each value is its own key so an assertion can target a
 * specific header/label without coupling to production copy. The action labels
 * are prefixed so they are unambiguous in the type column.
 */
function makeLabels(): AuditTrailCsvLabels {
  return {
    heading: 'HEADING',
    metaFile: 'File',
    metaTaxYear: 'TaxYear',
    metaBroker: 'Broker',
    metaMethodology: 'Methodology',
    methodologyNote: 'per-date gains, annual-avg dividends; amounts in RON',
    netSourceOverviewNote: 'NET_FROM_OVERVIEW_NOTE',
    tradeSectionTitle: 'TRADES',
    perSecuritySectionTitle: 'SECURITIES',
    summaryTitle: 'SUMMARY',
    colDate: 'Date',
    colType: 'Type',
    colTicker: 'Ticker',
    colIsin: 'ISIN',
    colName: 'Name',
    colShares: 'Shares',
    colPrice: 'Price',
    colCurrency: 'Currency',
    colAmountOriginal: 'AmountOrig',
    colBnrRate: 'BnrRate',
    colAmountRon: 'AmountRon',
    colWhtOriginal: 'WhtOrig',
    colWhtRon: 'WhtRon',
    colSecSold: 'Sold',
    colSecAvgCost: 'AvgCost',
    colSecProceeds: 'Proceeds',
    colSecCostBasis: 'CostBasis',
    colSecGainLoss: 'GainLoss',
    colSecDividends: 'Dividends',
    actionBuy: 'ACT_BUY',
    actionSell: 'ACT_SELL',
    actionDividend: 'ACT_DIV',
    actionInterest: 'ACT_INT',
    actionDeposit: 'ACT_DEP',
    actionWithdrawal: 'ACT_WD',
    summaryColItem: 'Item',
    summaryColValue: 'Value',
    sumCapGainsProceeds: 'CG proceeds',
    sumCapGainsCostBasis: 'CG cost',
    sumCapGainsNet: 'CG net',
    sumCapGainsLosses: 'CG losses',
    sumCapGainsRate: 'CG rate',
    sumCapGainsTax: 'CG tax',
    sumDivGross: 'Div gross',
    sumDivWht: 'Div wht',
    sumDivCredit: 'Div credit',
    sumDivTax: 'Div tax',
    sumCassBase: 'CASS base',
    sumCassAmount: 'CASS amount',
    sumTotalTax: 'Total tax',
    sumEarlyDiscount: 'Early discount',
    sumTotalAfterDiscount: 'Total after discount',
  };
}

function makeResult(over: Partial<TaxCalculationResult> = {}): TaxCalculationResult {
  return {
    taxYearId: '2025',
    capitalGains: {
      totalProceeds: 10000,
      totalCostBasis: 8000,
      netGains: 2000,
      losses: 0,
      taxRate: 0.1,
      taxOwed: 200,
    },
    dividends: {
      grossTotal: 500,
      taxBeforeCredit: 50,
      withholdingTaxPaid: 30,
      foreignTaxCredit: 20,
      taxOwed: 20,
      taxRate: 0.1,
    },
    healthContribution: {
      totalNonSalaryIncome: 2500,
      thresholdHit: 'none',
      amountOwed: 0,
    },
    totals: {
      totalTaxOwed: 220,
      earlyFilingDiscount: 0,
      totalAfterDiscount: 220,
    },
    calculatedAt: new Date('2026-01-01T00:00:00Z'),
    ...over,
  };
}

function makeTx(over: Partial<Transaction> = {}): Transaction {
  return {
    id: 'tx',
    csvUploadId: 'u',
    taxYearId: '2025',
    action: 'sell' as TransactionAction,
    transactionDate: new Date('2025-03-15T10:00:00Z'),
    isin: 'US0378331005',
    ticker: 'AAPL',
    securityName: 'Apple Inc',
    shares: 10,
    pricePerShare: 150,
    priceCurrency: 'USD',
    totalAmountOriginal: 1500,
    exchangeRateToLocal: 4.5,
    totalAmountLocal: 6750,
    withholdingTaxOriginal: 0,
    withholdingTaxCurrency: 'USD',
    withholdingTaxLocal: 0,
    brokerTransactionId: 'b',
    ...over,
  };
}

function makeSec(over: Partial<SecurityBreakdown> = {}): SecurityBreakdown {
  return {
    isin: 'US0378331005',
    ticker: 'AAPL',
    securityName: 'Apple Inc',
    totalBoughtShares: 10,
    totalSoldShares: 10,
    remainingShares: 0,
    weightedAvgCostLocal: 600,
    totalProceeds: 6750,
    totalCostBasis: 6000,
    realizedGainLoss: 750,
    totalDividends: 100,
    totalWithholdingTax: 10,
    ...over,
  };
}

function makePdfRow(over: Partial<PdfAuditRow> = {}): PdfAuditRow {
  return {
    date: '2025-03-15',
    action: 'sell',
    ticker: 'AAPL',
    isin: 'US0378331005',
    securityName: 'Apple Inc',
    shares: 10,
    pricePerShare: 150,
    currency: 'USD',
    amountOriginal: 1500,
    exchangeRateToLocal: 4.5,
    amountLocal: 6750,
    withholdingTaxOriginal: 0,
    withholdingTaxLocal: 0,
    ...over,
  };
}

/** Splits the CSV back into rows for structural assertions. */
function rows(csv: string): string[] {
  return csv.split('\r\n');
}

const labels = makeLabels();

describe('generateAuditTrailCsv', () => {
  it('emits the title + meta block from the input', () => {
    const csv = generateAuditTrailCsv(
      { result: makeResult(), securities: [], transactions: [], taxYear: 2025, fileName: 'statement.csv', brokerLabel: 'Trading 212' },
      labels,
    );
    const r = rows(csv);
    expect(r[0]).toBe('HEADING');
    expect(r[1]).toBe('File,statement.csv');
    expect(r[2]).toBe('TaxYear,2025');
    expect(r[3]).toBe('Broker,Trading 212');
    // The note contains a comma, so the field is quoted (RFC 4180).
    expect(r[4]).toBe('Methodology,"per-date gains, annual-avg dividends; amounts in RON"');
  });

  it('uses CRLF line endings (Excel-friendly, RFC 4180)', () => {
    const csv = generateAuditTrailCsv(
      { result: makeResult(), securities: [], transactions: [makeTx()], taxYear: 2025, fileName: 'f', brokerLabel: 'b' },
      labels,
    );
    expect(csv).toContain('\r\n');
    expect(csv).not.toMatch(/[^\r]\n/); // no bare LF
  });

  describe('per-trade detail (CSV flow)', () => {
    it('emits one row per tax-relevant trade with its own BNR rate + date', () => {
      const csv = generateAuditTrailCsv(
        {
          result: makeResult(),
          securities: [],
          transactions: [
            makeTx({ action: 'sell', transactionDate: new Date('2025-03-15T00:00:00Z'), exchangeRateToLocal: 4.5123, totalAmountLocal: 6768.45 }),
            makeTx({ action: 'dividend', ticker: 'MSFT', isin: 'US5949181045', securityName: 'Microsoft', transactionDate: new Date('2025-02-01T00:00:00Z'), shares: 0, pricePerShare: 0, totalAmountOriginal: 20, exchangeRateToLocal: 4.47, totalAmountLocal: 89.4, withholdingTaxOriginal: 2, withholdingTaxLocal: 8.94 }),
          ],
          taxYear: 2025,
          fileName: 'f',
          brokerLabel: 'b',
        },
        labels,
      );
      const r = rows(csv);
      expect(r).toContain('TRADES');
      // Header row present.
      expect(r).toContain('Date,Type,Ticker,ISIN,Name,Shares,Price,Currency,AmountOrig,BnrRate,AmountRon,WhtOrig,WhtRon');
      // Sorted ascending by date: dividend (Feb) precedes sell (Mar).
      const divIdx = r.findIndex((l) => l.startsWith('2025-02-01'));
      const sellIdx = r.findIndex((l) => l.startsWith('2025-03-15'));
      expect(divIdx).toBeGreaterThan(-1);
      expect(sellIdx).toBeGreaterThan(divIdx);
      // BNR rate formatted to 4 decimals; RON amount to 2.
      expect(r[sellIdx]).toContain(',4.5123,6768.45,');
      // Action label localized.
      expect(r[divIdx]).toContain(',ACT_DIV,');
      expect(r[sellIdx]).toContain(',ACT_SELL,');
    });

    it('excludes deposit and withdrawal cash movements from the detail rows', () => {
      const csv = generateAuditTrailCsv(
        {
          result: makeResult(),
          securities: [],
          transactions: [
            makeTx({ action: 'deposit', securityName: 'CASH-DEP' }),
            makeTx({ action: 'withdrawal', securityName: 'CASH-WD' }),
            makeTx({ action: 'sell', securityName: 'KEEP-SELL' }),
          ],
          taxYear: 2025,
          fileName: 'f',
          brokerLabel: 'b',
        },
        labels,
      );
      expect(csv).toContain('KEEP-SELL');
      expect(csv).not.toContain('CASH-DEP');
      expect(csv).not.toContain('CASH-WD');
    });

    it('falls back to per-security rows when only cash movements remain', () => {
      const csv = generateAuditTrailCsv(
        {
          result: makeResult(),
          securities: [makeSec()],
          transactions: [makeTx({ action: 'deposit' })],
          taxYear: 2025,
          fileName: 'f',
          brokerLabel: 'b',
        },
        labels,
      );
      // No tax-relevant trades -> the per-security section is used instead.
      expect(csv).toContain('SECURITIES');
      expect(csv).not.toContain('TRADES');
    });

    it('quotes fields containing commas or quotes (RFC 4180)', () => {
      const csv = generateAuditTrailCsv(
        {
          result: makeResult(),
          securities: [],
          transactions: [makeTx({ securityName: 'Alphabet, Inc. "Class A"' })],
          taxYear: 2025,
          fileName: 'f',
          brokerLabel: 'b',
        },
        labels,
      );
      expect(csv).toContain('"Alphabet, Inc. ""Class A"""');
    });

    it('renders fractional shares trimmed and a RON-trade rate of 1.0000', () => {
      const csv = generateAuditTrailCsv(
        {
          result: makeResult(),
          securities: [],
          transactions: [makeTx({ shares: 1.2345, priceCurrency: 'RON', exchangeRateToLocal: 1 })],
          taxYear: 2025,
          fileName: 'f',
          brokerLabel: 'b',
        },
        labels,
      );
      const tradeRow = rows(csv).find((l) => l.includes('ACT_SELL'))!;
      expect(tradeRow).toContain(',1.2345,');
      expect(tradeRow).toContain(',1.0000,');
    });

    it('formats an unparseable transaction date by passing the raw value through', () => {
      const csv = generateAuditTrailCsv(
        {
          result: makeResult(),
          securities: [],
          transactions: [makeTx({ transactionDate: 'not-a-date' as unknown as Date })],
          taxYear: 2025,
          fileName: 'f',
          brokerLabel: 'b',
        },
        labels,
      );
      expect(csv).toContain('not-a-date');
    });

    it('labels every transaction action type', () => {
      const actions: TransactionAction[] = ['buy', 'sell', 'dividend', 'interest'];
      const csv = generateAuditTrailCsv(
        {
          result: makeResult(),
          securities: [],
          transactions: actions.map((action, i) => makeTx({ action, transactionDate: new Date(`2025-0${i + 1}-01T00:00:00Z`) })),
          taxYear: 2025,
          fileName: 'f',
          brokerLabel: 'b',
        },
        labels,
      );
      expect(csv).toContain('ACT_BUY');
      expect(csv).toContain('ACT_SELL');
      expect(csv).toContain('ACT_DIV');
      expect(csv).toContain('ACT_INT');
    });
  });

  describe('per-trade detail (PDF flow, audit rows)', () => {
    it('renders PDF audit rows as one row per trade, not per security', () => {
      const csv = generateAuditTrailCsv(
        {
          result: makeResult(),
          securities: [makeSec()],
          transactions: [],
          pdfTrades: [
            makePdfRow({ action: 'sell', date: '2025-03-15', exchangeRateToLocal: 4.4705, amountLocal: 6705.75 }),
            makePdfRow({ action: 'dividend', ticker: 'MSFT', isin: 'US5949181045', securityName: 'Microsoft', date: '2025-02-01', shares: 0, pricePerShare: 0, currency: 'USD', amountOriginal: 20, exchangeRateToLocal: 4.47, amountLocal: 89.4, withholdingTaxOriginal: 2, withholdingTaxLocal: 8.94 }),
          ],
          taxYear: 2025,
          fileName: 'statement.pdf',
          brokerLabel: 'Trading 212',
        },
        labels,
      );
      const r = rows(csv);
      // The recommended (PDF) path now gets the per-trade table, not per-security.
      expect(r).toContain('TRADES');
      expect(r).not.toContain('SECURITIES');
      expect(r).toContain('Date,Type,Ticker,ISIN,Name,Shares,Price,Currency,AmountOrig,BnrRate,AmountRon,WhtOrig,WhtRon');
      // Sorted ascending: the Feb dividend precedes the Mar sell.
      const divIdx = r.findIndex((l) => l.startsWith('2025-02-01'));
      const sellIdx = r.findIndex((l) => l.startsWith('2025-03-15'));
      expect(divIdx).toBeGreaterThan(-1);
      expect(sellIdx).toBeGreaterThan(divIdx);
      // Sell row carries its own per-date BNR rate + RON amount.
      expect(r[sellIdx]).toContain(',ACT_SELL,');
      expect(r[sellIdx]).toContain(',4.4705,6705.75,');
      // Dividend row carries the withholding tax in both currencies.
      expect(r[divIdx]).toContain(',ACT_DIV,');
      expect(r[divIdx]).toContain(',2.00,8.94');
    });

    it('adds the net-from-overview note only when pdfNetFromOverview is set', () => {
      const withNote = generateAuditTrailCsv(
        { result: makeResult(), securities: [], transactions: [], pdfTrades: [makePdfRow()], pdfNetFromOverview: true, taxYear: 2025, fileName: 'f', brokerLabel: 'b' },
        labels,
      );
      expect(withNote).toContain('NET_FROM_OVERVIEW_NOTE');

      const withoutNote = generateAuditTrailCsv(
        { result: makeResult(), securities: [], transactions: [], pdfTrades: [makePdfRow()], taxYear: 2025, fileName: 'f', brokerLabel: 'b' },
        labels,
      );
      expect(withoutNote).not.toContain('NET_FROM_OVERVIEW_NOTE');
    });

    it('prefers CSV transactions over pdfTrades when both are present', () => {
      const csv = generateAuditTrailCsv(
        {
          result: makeResult(),
          securities: [],
          transactions: [makeTx({ securityName: 'CSV-ROW' })],
          pdfTrades: [makePdfRow({ securityName: 'PDF-ROW' })],
          taxYear: 2025,
          fileName: 'f',
          brokerLabel: 'b',
        },
        labels,
      );
      expect(csv).toContain('CSV-ROW');
      expect(csv).not.toContain('PDF-ROW');
    });

    it('does not mutate the caller pdfTrades array when sorting', () => {
      const pdfTrades = [
        makePdfRow({ date: '2025-03-15', securityName: 'LATER' }),
        makePdfRow({ date: '2025-01-02', securityName: 'EARLIER' }),
      ];
      generateAuditTrailCsv(
        { result: makeResult(), securities: [], transactions: [], pdfTrades, taxYear: 2025, fileName: 'f', brokerLabel: 'b' },
        labels,
      );
      // Original order preserved (the serializer sorts a copy).
      expect(pdfTrades.map((p) => p.securityName)).toEqual(['LATER', 'EARLIER']);
    });
  });

  describe('per-security detail (fallback: no per-trade rows)', () => {
    it('emits one row per security with RON figures', () => {
      const csv = generateAuditTrailCsv(
        {
          result: makeResult(),
          securities: [makeSec({ ticker: 'AAPL', realizedGainLoss: 750.5, totalDividends: 100.25 })],
          transactions: [],
          taxYear: 2025,
          fileName: 'f',
          brokerLabel: 'b',
        },
        labels,
      );
      const r = rows(csv);
      expect(r).toContain('SECURITIES');
      expect(r).toContain('Ticker,ISIN,Name,Sold,AvgCost,Proceeds,CostBasis,GainLoss,Dividends,WhtRon');
      const secRow = r.find((l) => l.startsWith('AAPL,'))!;
      expect(secRow).toContain(',750.50,');
      expect(secRow).toContain(',100.25,');
    });

    it('emits only headers when there are no securities and no transactions', () => {
      const csv = generateAuditTrailCsv(
        { result: makeResult(), securities: [], transactions: [], taxYear: 2025, fileName: 'f', brokerLabel: 'b' },
        labels,
      );
      expect(csv).toContain('SECURITIES');
      // The summary still renders.
      expect(csv).toContain('SUMMARY');
    });
  });

  describe('summary block', () => {
    it('reconciles every derived figure to the result', () => {
      const result = makeResult({
        capitalGains: { totalProceeds: 12345.67, totalCostBasis: 10000, netGains: 2345.67, losses: 0, taxRate: 0.1, taxOwed: 234.57 },
        dividends: { grossTotal: 500, taxBeforeCredit: 50, withholdingTaxPaid: 30, foreignTaxCredit: 20, taxOwed: 30, taxRate: 0.1 },
        healthContribution: { totalNonSalaryIncome: 2845.67, thresholdHit: 'none', amountOwed: 0 },
        totals: { totalTaxOwed: 264.57, earlyFilingDiscount: 13.23, totalAfterDiscount: 251.34 },
      });
      const csv = generateAuditTrailCsv(
        { result, securities: [], transactions: [], taxYear: 2025, fileName: 'f', brokerLabel: 'b' },
        labels,
      );
      expect(csv).toContain('CG proceeds,12345.67');
      expect(csv).toContain('CG net,2345.67');
      expect(csv).toContain('CG rate,10%');
      expect(csv).toContain('CG tax,234.57');
      expect(csv).toContain('Div credit,20.00');
      expect(csv).toContain('CASS base,2845.67');
      expect(csv).toContain('Early discount,13.23');
      expect(csv).toContain('Total after discount,251.34');
    });

    it('renders a non-round rate as a trimmed percent', () => {
      const csv = generateAuditTrailCsv(
        { result: makeResult({ capitalGains: { ...makeResult().capitalGains, taxRate: 0.16 } }), securities: [], transactions: [], taxYear: 2026, fileName: 'f', brokerLabel: 'b' },
        labels,
      );
      expect(csv).toContain('CG rate,16%');
    });
  });

  it('reconciles to the live engine output (audit CSV echoes the computed total)', () => {
    // End-to-end: run the real CSV engine, feed its output to the serializer, and
    // assert the summary total equals the engine total to the bani. The engine is
    // never touched by this module, so the golden numbers are echoed faithfully.
    const cfg = getTaxConfigForYear(romaniaTaxConfig, 2025);
    const txs: Transaction[] = [
      makeTx({ action: 'buy', transactionDate: new Date('2025-01-10T00:00:00Z'), shares: 10, totalAmountOriginal: 1000, exchangeRateToLocal: 4.5, totalAmountLocal: 4500 }),
      makeTx({ action: 'sell', transactionDate: new Date('2025-06-10T00:00:00Z'), shares: 10, totalAmountOriginal: 1500, exchangeRateToLocal: 4.6, totalAmountLocal: 6900 }),
    ];
    const { taxResult, securities } = calculateTaxes(txs, cfg, 2025);
    const csv = generateAuditTrailCsv(
      { result: taxResult, securities, transactions: txs, taxYear: 2025, fileName: 'real.csv', brokerLabel: 'Trading 212' },
      labels,
    );
    expect(csv).toContain(`Total after discount,${taxResult.totals.totalAfterDiscount.toFixed(2)}`);
    expect(csv).toContain(`CG net,${taxResult.capitalGains.netGains.toFixed(2)}`);
  });
});
