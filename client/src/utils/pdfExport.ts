import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { TaxCalculationResult } from '@shared/types/tax';
import { d212Sections } from '@shared/taxRules/d212Fields';

// jspdf-autotable extends jsPDF instances with lastAutoTable at runtime
type DocWithAutoTable = jsPDF & { lastAutoTable: { finalY: number } };

const ACCENT = [59, 130, 246] as const; // #3B82F6
const DARK = [30, 41, 59] as const;
const GRAY = [100, 116, 139] as const;

export function generateTaxSummaryPdf(
  taxResult: TaxCalculationResult,
  taxYear: number,
  currencySymbol: string,
) {
  const doc = new jsPDF();
  const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const sym = currencySymbol;
  let y = 20;

  // Title
  doc.setFontSize(22);
  doc.setTextColor(...ACCENT);
  doc.text('InvesTax', 14, y);
  doc.setFontSize(10);
  doc.setTextColor(...GRAY);
  doc.text(`Generated ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`, 196, y, { align: 'right' });
  y += 10;

  doc.setFontSize(16);
  doc.setTextColor(...DARK);
  doc.text(`Tax Summary — ${taxYear}`, 14, y);
  y += 4;

  doc.setDrawColor(...ACCENT);
  doc.setLineWidth(0.5);
  doc.line(14, y, 196, y);
  y += 10;

  // Summary box
  doc.setFontSize(12);
  doc.setTextColor(...DARK);
  doc.text('Tax Overview', 14, y);
  y += 6;

  const summaryData = [
    ['Capital Gains Tax', `${fmt(taxResult.capitalGains.taxOwed)} ${sym}`],
    ['Dividend Tax', `${fmt(taxResult.dividends.taxOwed)} ${sym}`],
    ['Health Contribution (CASS)', `${fmt(taxResult.healthContribution.amountOwed)} ${sym}`],
    ['Total Tax Owed', `${fmt(taxResult.totals.totalTaxOwed)} ${sym}`],
  ];

  if (taxResult.totals.earlyFilingDiscount > 0) {
    summaryData.push(
      ['Early Filing Discount', `-${fmt(taxResult.totals.earlyFilingDiscount)} ${sym}`],
      ['Total After Discount', `${fmt(taxResult.totals.totalAfterDiscount)} ${sym}`],
    );
  }

  autoTable(doc, {
    startY: y,
    head: [['Item', 'Amount']],
    body: summaryData,
    theme: 'grid',
    headStyles: { fillColor: [...ACCENT], fontSize: 10 },
    styles: { fontSize: 10 },
    columnStyles: { 1: { halign: 'right', fontStyle: 'bold' } },
    margin: { left: 14, right: 14 },
  });

  y = (doc as DocWithAutoTable).lastAutoTable.finalY + 12;

  // Capital Gains Detail
  doc.setFontSize(12);
  doc.setTextColor(...DARK);
  doc.text('Capital Gains Detail', 14, y);
  y += 6;

  autoTable(doc, {
    startY: y,
    body: [
      ['Total Proceeds', `${fmt(taxResult.capitalGains.totalProceeds)} ${sym}`],
      ['Total Cost Basis', `${fmt(taxResult.capitalGains.totalCostBasis)} ${sym}`],
      ['Net Capital Gains', `${fmt(taxResult.capitalGains.netGains)} ${sym}`],
      ['Losses', `${fmt(taxResult.capitalGains.losses)} ${sym}`],
      [`Tax Rate`, `${(taxResult.capitalGains.taxRate * 100)}%`],
      ['Tax Owed', `${fmt(taxResult.capitalGains.taxOwed)} ${sym}`],
    ],
    theme: 'plain',
    styles: { fontSize: 9 },
    columnStyles: { 1: { halign: 'right' } },
    margin: { left: 14, right: 14 },
  });

  y = (doc as DocWithAutoTable).lastAutoTable.finalY + 12;

  // Dividends Detail
  doc.setFontSize(12);
  doc.setTextColor(...DARK);
  doc.text('Dividends Detail', 14, y);
  y += 6;

  autoTable(doc, {
    startY: y,
    body: [
      ['Gross Dividends', `${fmt(taxResult.dividends.grossTotal)} ${sym}`],
      ['Foreign Withholding Tax', `${fmt(taxResult.dividends.withholdingTaxPaid)} ${sym}`],
      ['Tax Owed in Romania', `${fmt(taxResult.dividends.taxOwed)} ${sym}`],
    ],
    theme: 'plain',
    styles: { fontSize: 9 },
    columnStyles: { 1: { halign: 'right' } },
    margin: { left: 14, right: 14 },
  });

  y = (doc as DocWithAutoTable).lastAutoTable.finalY + 12;

  // D212 Field Reference
  if (y > 240) {
    doc.addPage();
    y = 20;
  }

  doc.setFontSize(14);
  doc.setTextColor(...ACCENT);
  doc.text('D212 Field Reference (for ANAF SPV)', 14, y);
  y += 3;
  doc.setFontSize(8);
  doc.setTextColor(...GRAY);
  doc.text('Use these values when filling in Declaratia Unica online.', 14, y + 4);
  y += 10;

  for (const section of d212Sections) {
    if (y > 260) {
      doc.addPage();
      y = 20;
    }

    const rows = section.fields.map((field) => [
      field.roLabel,
      field.enLabel,
      `${fmt(field.getValue(taxResult))} RON`,
    ]);

    doc.setFontSize(10);
    doc.setTextColor(...DARK);
    doc.text(`${section.fields[0].section} — ${section.roTitle}`, 14, y);
    y += 5;

    autoTable(doc, {
      startY: y,
      head: [['SPV Field (Romanian)', 'Description', 'Value']],
      body: rows,
      theme: 'striped',
      headStyles: { fillColor: [71, 85, 105], fontSize: 8 },
      styles: { fontSize: 8 },
      columnStyles: { 2: { halign: 'right', fontStyle: 'bold' } },
      margin: { left: 14, right: 14 },
    });

    y = (doc as DocWithAutoTable).lastAutoTable.finalY + 8;
  }

  // Footer
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(...GRAY);
    doc.text(
      'Generated by InvesTax — for personal records only, not for ANAF submission.',
      105, 290, { align: 'center' },
    );
    doc.text(`Page ${i} of ${pageCount}`, 196, 290, { align: 'right' });
  }

  doc.save(`investax-${taxYear}-summary.pdf`);
}
