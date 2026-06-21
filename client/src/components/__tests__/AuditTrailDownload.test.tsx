import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { TaxCalculationResult, SecurityBreakdown, Transaction } from '@shared/index';
import AuditTrailDownload from '../AuditTrailDownload';
import { analytics } from '../../lib/analytics';

const result: TaxCalculationResult = {
  taxYearId: '2025',
  capitalGains: { totalProceeds: 5000, totalCostBasis: 4000, netGains: 1000, losses: 0, taxRate: 0.1, taxOwed: 100 },
  dividends: { grossTotal: 200, taxBeforeCredit: 20, withholdingTaxPaid: 20, foreignTaxCredit: 20, taxOwed: 0, taxRate: 0.1 },
  healthContribution: { totalNonSalaryIncome: 1200, thresholdHit: 'none', amountOwed: 0 },
  totals: { totalTaxOwed: 100, earlyFilingDiscount: 5, totalAfterDiscount: 95 },
  calculatedAt: new Date('2026-01-01'),
};

const securities: SecurityBreakdown[] = [
  {
    isin: 'US0378331005', ticker: 'AAPL', securityName: 'Apple Inc',
    totalBoughtShares: 10, totalSoldShares: 10, remainingShares: 0,
    weightedAvgCostLocal: 400, totalProceeds: 5000, totalCostBasis: 4000,
    realizedGainLoss: 1000, totalDividends: 200, totalWithholdingTax: 20,
  },
];

const transactions: Transaction[] = [
  {
    id: 't1', csvUploadId: 'u', taxYearId: '2025', action: 'sell',
    transactionDate: new Date('2025-06-10T00:00:00Z'), isin: 'US0378331005', ticker: 'AAPL',
    securityName: 'Apple Inc', shares: 10, pricePerShare: 150, priceCurrency: 'USD',
    totalAmountOriginal: 1500, exchangeRateToLocal: 4.6, totalAmountLocal: 6900,
    withholdingTaxOriginal: 0, withholdingTaxCurrency: 'USD', withholdingTaxLocal: 0, brokerTransactionId: 'b1',
  },
];

async function clickDownload() {
  const user = userEvent.setup();
  await user.click(screen.getByTestId('audit-trail-download-button'));
}

function lastBlob(): Blob {
  return (URL.createObjectURL as ReturnType<typeof vi.fn>).mock.calls[0][0] as Blob;
}

describe('AuditTrailDownload', () => {
  beforeEach(() => {
    (URL as unknown as { createObjectURL: unknown }).createObjectURL = vi.fn(() => 'blob:mock');
    (URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    vi.spyOn(analytics, 'auditTrailDownloaded').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the card and the download button', () => {
    render(
      <AuditTrailDownload result={result} securities={securities} transactions={transactions} taxYear={2025} fileName="statement.csv" brokerLabel="Trading 212" />,
    );
    expect(screen.getByTestId('audit-trail-download')).toBeInTheDocument();
    expect(screen.getByTestId('audit-trail-download-button')).toBeInTheDocument();
  });

  it('downloads a UTF-8 CSV with per-trade rows + summary, and fires analytics', async () => {
    render(
      <AuditTrailDownload result={result} securities={securities} transactions={transactions} taxYear={2025} fileName="statement.csv" brokerLabel="Trading 212" />,
    );
    await clickDownload();

    await waitFor(() => expect(screen.getByTestId('audit-trail-success')).toBeInTheDocument());
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    expect(analytics.auditTrailDownloaded).toHaveBeenCalledTimes(1);

    const blob = lastBlob();
    expect(blob.type).toContain('text/csv');
    // UTF-8 BOM (EF BB BF) so Excel on Windows reads the diacritics. Checked at the
    // byte level because Blob.text() UTF-8-decodes and may strip a leading BOM.
    const bytes = new Uint8Array(await blob.arrayBuffer());
    expect([bytes[0], bytes[1], bytes[2]]).toEqual([0xef, 0xbb, 0xbf]);
    const text = await blob.text();
    expect(text).toContain('InvesTax tax-calculation audit trail');
    expect(text).toContain('Transactions (per trade)');
    // The per-trade row carries its own BNR rate + RON amount.
    expect(text).toContain('2025-06-10');
    expect(text).toContain(',4.6000,6900.00,');
    // Summary reconciles to the result.
    expect(text).toContain('Total after discount,95.00');
  });

  it('uses the per-security section for the PDF flow (no transactions)', async () => {
    render(
      <AuditTrailDownload result={result} securities={securities} transactions={[]} taxYear={2025} fileName="statement.pdf" brokerLabel="Trading 212" />,
    );
    await clickDownload();
    const text = await lastBlob().text();
    expect(text).toContain('Per-security breakdown');
    expect(text).not.toContain('Transactions (per trade)');
    expect(text).toContain('AAPL');
  });
});
