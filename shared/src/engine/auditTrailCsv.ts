/**
 * Audit-trail CSV generator for a finished tax calculation (Romania).
 *
 * Turns the engine's output for a parsed broker statement into a downloadable,
 * ANAF-defensible CSV that shows HOW each number was derived: which trade
 * converted at which BNR rate on which date, and how the net gain + CASS + the
 * declared totals follow from those rows. This is the "determinism + auditability
 * as a user-facing surface" moat artifact (2026-06-16 directive item #2): the
 * same statement always produces the same number, and now the user can see and
 * defend every step.
 *
 * Two detail granularities, picked from the data the flow actually has:
 *
 * - CSV flow: the enriched {@link Transaction}[] carries a per-trade BNR rate
 *   (`exchangeRateToLocal`) + the trade date, so we emit ONE ROW PER TRADE
 *   (the strongest audit: "this trade, this date, this rate, this RON amount").
 * - PDF flow: `calculateTaxesFromPdf` does not retain per-trade rows (it
 *   aggregates into the per-security breakdown), so when no transactions are
 *   present we emit ONE ROW PER SECURITY from {@link SecurityBreakdown}[]. The
 *   per-trade-rate detail for the PDF flow is a future enhancement that would
 *   require the PDF calculator to surface its per-trade rows; out of scope here.
 *
 * Both granularities are followed by the same summary block (capital gains,
 * dividends, CASS, totals) read straight off the {@link TaxCalculationResult}, so
 * the file reconciles to the on-screen numbers and to the D212 lines to the leu.
 *
 * NO engine math happens here. This module consumes a finished result + its
 * transactions/securities and never touches the parser, the calculators, or any
 * rate logic. It is a pure serializer, like {@link generateD212Xml}, so the
 * 28,053 / 28,500.69 golden numbers are untouched by construction.
 *
 * All labels are supplied by the caller ({@link AuditTrailCsvLabels}) so the file
 * is localized (RO/EN) without pulling i18n into the shared package. The numbers
 * are formatted here, deterministically, with a `.` decimal and a `,` field
 * separator (RFC 4180); the caller prepends a UTF-8 BOM on download so Excel on
 * Windows reads the diacritics correctly.
 */

import type { TaxCalculationResult, SecurityBreakdown } from '../types/tax.js';
import type { Transaction, TransactionAction } from '../types/transaction.js';

/**
 * Localized strings for the audit CSV. The caller (client) builds this from its
 * i18n catalog; tests pass a fixed English set. Every value is a plain label,
 * never interpolated here, so it is safe to drop verbatim into a CSV field.
 */
export interface AuditTrailCsvLabels {
  /** Title line at the very top of the file. */
  heading: string;
  /** Meta block (label/value pairs above the detail table). */
  metaFile: string;
  metaTaxYear: string;
  metaBroker: string;
  metaMethodology: string;
  /** One-line note: per-date capital gains + annual-average dividends, amounts in RON. */
  methodologyNote: string;

  /** Section titles. */
  tradeSectionTitle: string;
  perSecuritySectionTitle: string;
  summaryTitle: string;

  /** Per-trade (CSV flow) column headers. */
  colDate: string;
  colType: string;
  colTicker: string;
  colIsin: string;
  colName: string;
  colShares: string;
  colPrice: string;
  colCurrency: string;
  colAmountOriginal: string;
  colBnrRate: string;
  colAmountRon: string;
  colWhtOriginal: string;
  colWhtRon: string;

  /** Per-security (PDF flow) column headers. */
  colSecSold: string;
  colSecAvgCost: string;
  colSecProceeds: string;
  colSecCostBasis: string;
  colSecGainLoss: string;
  colSecDividends: string;

  /** Transaction-type labels. */
  actionBuy: string;
  actionSell: string;
  actionDividend: string;
  actionInterest: string;
  actionDeposit: string;
  actionWithdrawal: string;

  /** Summary block: column headers + one label per derived figure. */
  summaryColItem: string;
  summaryColValue: string;
  sumCapGainsProceeds: string;
  sumCapGainsCostBasis: string;
  sumCapGainsNet: string;
  sumCapGainsLosses: string;
  sumCapGainsRate: string;
  sumCapGainsTax: string;
  sumDivGross: string;
  sumDivWht: string;
  sumDivCredit: string;
  sumDivTax: string;
  sumCassBase: string;
  sumCassAmount: string;
  sumTotalTax: string;
  sumEarlyDiscount: string;
  sumTotalAfterDiscount: string;
}

/** Everything the serializer needs about the calculation, beyond the labels. */
export interface AuditTrailCsvInput {
  /** The displayed engine result (after any dividend-credit override). */
  result: TaxCalculationResult;
  /** Per-security breakdown (used for the PDF flow detail rows). */
  securities: SecurityBreakdown[];
  /** Enriched per-trade transactions (CSV flow); empty for the PDF flow. */
  transactions: Transaction[];
  /** The income year the result is for. */
  taxYear: number;
  /** The uploaded statement's file name (shown in the meta block). */
  fileName: string;
  /** Human broker label, e.g. "Trading 212". */
  brokerLabel: string;
}

/** Cash movements that do not feed the tax calculation are left out of the detail rows. */
const NON_TAX_ACTIONS: ReadonlySet<TransactionAction> = new Set<TransactionAction>([
  'deposit',
  'withdrawal',
]);

/**
 * Escapes a value for one RFC-4180 CSV field: wraps it in double quotes and
 * doubles any embedded quote when it contains a comma, quote, or line break
 * (security names carry commas; everything else passes through unquoted).
 */
function csvField(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** Joins already-escaped or numeric cells into one CSV row. */
function row(cells: Array<string | number>): string {
  return cells.map((c) => csvField(String(c))).join(',');
}

/** Whole-and-bani money string (2 decimals). */
function money(n: number): string {
  return n.toFixed(2);
}

/** BNR rate string (4 decimals, e.g. 4.4705). A rate of 1 (RON trades) shows as 1.0000. */
function rate(n: number): string {
  return n.toFixed(4);
}

/** Percent string for a fractional rate, e.g. 0.1 -> "10%". */
function percent(fraction: number): string {
  return `${+(fraction * 100).toFixed(2)}%`;
}

/** Share/price count, trimmed to at most 4 decimals (T212 supports fractional shares). */
function qty(n: number): string {
  return String(Math.round(n * 10000) / 10000);
}

/** ISO `YYYY-MM-DD` for a Date or date string; falls back to the raw value if unparseable. */
function isoDate(value: Date | string): string {
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toISOString().slice(0, 10);
}

/** Maps a transaction action to its localized label. */
function actionLabel(action: TransactionAction, labels: AuditTrailCsvLabels): string {
  switch (action) {
    case 'buy':
      return labels.actionBuy;
    case 'sell':
      return labels.actionSell;
    case 'dividend':
      return labels.actionDividend;
    case 'interest':
      return labels.actionInterest;
    case 'deposit':
      return labels.actionDeposit;
    case 'withdrawal':
      return labels.actionWithdrawal;
  }
}

/**
 * Generates the audit-trail CSV string for a finished tax calculation.
 *
 * The file is: a title + meta block, then a detail table (one row per trade when
 * transactions are present, else one row per security), then a summary block that
 * reconciles to the engine totals. Numbers are formatted deterministically; no
 * engine math is performed.
 *
 * @param input The calculation result plus its transactions/securities + context.
 * @param labels Localized strings for every header and label.
 * @returns A CSV document string (CRLF line endings, no BOM; the caller adds the BOM).
 */
export function generateAuditTrailCsv(
  input: AuditTrailCsvInput,
  labels: AuditTrailCsvLabels,
): string {
  const { result, securities, transactions, taxYear, fileName, brokerLabel } = input;
  const lines: string[] = [];

  // --- Title + meta block (label/value pairs) ---
  lines.push(row([labels.heading]));
  lines.push(row([labels.metaFile, fileName]));
  lines.push(row([labels.metaTaxYear, taxYear]));
  lines.push(row([labels.metaBroker, brokerLabel]));
  lines.push(row([labels.metaMethodology, labels.methodologyNote]));
  lines.push('');

  // --- Detail table ---
  // CSV flow: one row per tax-relevant trade, each with its own BNR rate + date.
  // Cash movements (deposit/withdrawal) do not feed the calculation, so they are
  // excluded to keep the audit focused on what produced the numbers.
  const detailTxs = transactions
    .filter((tx) => !NON_TAX_ACTIONS.has(tx.action))
    .slice()
    .sort((a, b) => isoDate(a.transactionDate).localeCompare(isoDate(b.transactionDate)));

  if (detailTxs.length > 0) {
    lines.push(row([labels.tradeSectionTitle]));
    lines.push(
      row([
        labels.colDate,
        labels.colType,
        labels.colTicker,
        labels.colIsin,
        labels.colName,
        labels.colShares,
        labels.colPrice,
        labels.colCurrency,
        labels.colAmountOriginal,
        labels.colBnrRate,
        labels.colAmountRon,
        labels.colWhtOriginal,
        labels.colWhtRon,
      ]),
    );
    for (const tx of detailTxs) {
      lines.push(
        row([
          isoDate(tx.transactionDate),
          actionLabel(tx.action, labels),
          tx.ticker,
          tx.isin,
          tx.securityName,
          qty(tx.shares),
          qty(tx.pricePerShare),
          tx.priceCurrency,
          money(tx.totalAmountOriginal),
          rate(tx.exchangeRateToLocal),
          money(tx.totalAmountLocal),
          money(tx.withholdingTaxOriginal),
          money(tx.withholdingTaxLocal),
        ]),
      );
    }
  } else {
    // PDF flow: no per-trade list, so emit the per-security breakdown (RON).
    lines.push(row([labels.perSecuritySectionTitle]));
    lines.push(
      row([
        labels.colTicker,
        labels.colIsin,
        labels.colName,
        labels.colSecSold,
        labels.colSecAvgCost,
        labels.colSecProceeds,
        labels.colSecCostBasis,
        labels.colSecGainLoss,
        labels.colSecDividends,
        labels.colWhtRon,
      ]),
    );
    for (const sec of securities) {
      lines.push(
        row([
          sec.ticker,
          sec.isin,
          sec.securityName,
          qty(sec.totalSoldShares),
          money(sec.weightedAvgCostLocal),
          money(sec.totalProceeds),
          money(sec.totalCostBasis),
          money(sec.realizedGainLoss),
          money(sec.totalDividends),
          money(sec.totalWithholdingTax),
        ]),
      );
    }
  }
  lines.push('');

  // --- Summary block (reconciles to the on-screen numbers + the D212 lines) ---
  lines.push(row([labels.summaryTitle]));
  lines.push(row([labels.summaryColItem, labels.summaryColValue]));
  lines.push(row([labels.sumCapGainsProceeds, money(result.capitalGains.totalProceeds)]));
  lines.push(row([labels.sumCapGainsCostBasis, money(result.capitalGains.totalCostBasis)]));
  lines.push(row([labels.sumCapGainsNet, money(result.capitalGains.netGains)]));
  lines.push(row([labels.sumCapGainsLosses, money(result.capitalGains.losses)]));
  lines.push(row([labels.sumCapGainsRate, percent(result.capitalGains.taxRate)]));
  lines.push(row([labels.sumCapGainsTax, money(result.capitalGains.taxOwed)]));
  lines.push(row([labels.sumDivGross, money(result.dividends.grossTotal)]));
  lines.push(row([labels.sumDivWht, money(result.dividends.withholdingTaxPaid)]));
  lines.push(row([labels.sumDivCredit, money(result.dividends.foreignTaxCredit)]));
  lines.push(row([labels.sumDivTax, money(result.dividends.taxOwed)]));
  lines.push(row([labels.sumCassBase, money(result.healthContribution.totalNonSalaryIncome)]));
  lines.push(row([labels.sumCassAmount, money(result.healthContribution.amountOwed)]));
  lines.push(row([labels.sumTotalTax, money(result.totals.totalTaxOwed)]));
  lines.push(row([labels.sumEarlyDiscount, money(result.totals.earlyFilingDiscount)]));
  lines.push(row([labels.sumTotalAfterDiscount, money(result.totals.totalAfterDiscount)]));

  return lines.join('\r\n');
}
