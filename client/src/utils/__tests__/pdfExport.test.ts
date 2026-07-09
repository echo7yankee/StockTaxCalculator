import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { TaxCalculationResult } from '@shared/index';

// Capture every autoTable(...) call so we can assert on the summary table body
// without rendering a real PDF. jsPDF is stubbed to a no-op chainable doc.
const autoTableCalls: Array<{ body?: unknown[][] }> = [];

vi.mock('jspdf-autotable', () => ({
  default: (_doc: unknown, opts: { body?: unknown[][] }) => {
    autoTableCalls.push(opts);
  },
}));

vi.mock('jspdf', () => {
  class FakeDoc {
    lastAutoTable = { finalY: 0 };
    setFontSize() { return this; }
    setTextColor() { return this; }
    setDrawColor() { return this; }
    setLineWidth() { return this; }
    text() { return this; }
    line() { return this; }
    addPage() { return this; }
    setPage() { return this; }
    getNumberOfPages() { return 1; }
    save() { return this; }
  }
  return { default: FakeDoc };
});

import { generateTaxSummaryPdf } from '../pdfExport';

const withDiscount: TaxCalculationResult = {
  taxYearId: '2025',
  capitalGains: { totalProceeds: 5000, totalCostBasis: 4000, netGains: 1000, losses: 0, taxRate: 0.1, taxOwed: 100 },
  dividends: { grossTotal: 200, taxBeforeCredit: 20, withholdingTaxPaid: 20, foreignTaxCredit: 20, taxOwed: 0, taxRate: 0.1 },
  healthContribution: { totalNonSalaryIncome: 1200, thresholdHit: 'none', amountOwed: 0 },
  totals: { totalTaxOwed: 100, earlyFilingDiscount: 3, totalAfterDiscount: 97 },
  calculatedAt: new Date('2025-03-01'),
};

// The first autoTable call is the "Tax Overview" summary table.
function summaryLabels(): string[] {
  const body = autoTableCalls[0]?.body ?? [];
  return body.map((row) => String((row as string[])[0]));
}

describe('generateTaxSummaryPdf early-filing discount gating', () => {
  beforeEach(() => {
    autoTableCalls.length = 0;
  });

  it('includes the discount rows when the deadline is still ahead (showEarlyFilingDiscount=true)', () => {
    generateTaxSummaryPdf(withDiscount, 2025, 'RON', true);
    const labels = summaryLabels();
    expect(labels).toContain('Early Filing Discount');
    expect(labels).toContain('Total After Discount');
  });

  it('omits the discount rows once the deadline has passed (showEarlyFilingDiscount=false)', () => {
    generateTaxSummaryPdf(withDiscount, 2025, 'RON', false);
    const labels = summaryLabels();
    expect(labels).not.toContain('Early Filing Discount');
    expect(labels).not.toContain('Total After Discount');
    // The full tax is still reported as the headline total.
    expect(labels).toContain('Total Tax Owed');
  });

  it('defaults to showing the discount rows when the gate arg is omitted (backward compatible)', () => {
    generateTaxSummaryPdf(withDiscount, 2025, 'RON');
    expect(summaryLabels()).toContain('Total After Discount');
  });
});
