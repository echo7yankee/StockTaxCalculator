import { Router } from 'express';
import prisma from '../lib/prisma.js';

export const uploadsRouter = Router();

// POST /api/uploads — save a tax calculation (requires auth)
uploadsRouter.post('/', async (req, res) => {
  try {
    const { year, country, broker, fileName, taxResult, securities } = req.body;

    if (!year || !taxResult) {
      res.status(400).json({ error: 'year and taxResult are required' });
      return;
    }

    const userId = req.user!.id;

    // Upsert tax year (replace existing calculation for same year)
    let taxYear = await prisma.taxYear.findUnique({
      where: { userId_year: { userId, year } },
      include: { calculation: true },
    });

    if (taxYear?.calculation) {
      // Delete existing calculation + securities
      await prisma.securityCalculation.deleteMany({
        where: { taxCalculationId: taxYear.calculation.id },
      });
      await prisma.taxCalculation.delete({
        where: { id: taxYear.calculation.id },
      });
    }

    if (!taxYear) {
      taxYear = await prisma.taxYear.create({
        data: {
          userId,
          year,
          country: country || 'RO',
          status: 'calculated',
        },
        include: { calculation: true },
      });
    } else {
      await prisma.taxYear.update({
        where: { id: taxYear.id },
        data: { status: 'calculated' },
      });
    }

    // Create upload record
    await prisma.csvUpload.create({
      data: {
        taxYearId: taxYear.id,
        broker: broker || 'trading212',
        filename: fileName,
        processed: true,
        rowCount: (securities || []).length,
      },
    });

    // Create tax calculation
    const calc = await prisma.taxCalculation.create({
      data: {
        taxYearId: taxYear.id,
        totalCapitalGains: taxResult.capitalGains?.totalProceeds,
        totalCapitalLosses: taxResult.capitalGains?.losses,
        netCapitalGains: taxResult.capitalGains?.netGains,
        capitalGainsTax: taxResult.capitalGains?.taxOwed,
        totalDividendsGross: taxResult.dividends?.grossTotal,
        totalWithholdingTax: taxResult.dividends?.withholdingTaxPaid,
        dividendTaxOwed: taxResult.dividends?.taxOwed,
        totalNonSalaryIncome: taxResult.healthContribution?.totalNonSalaryIncome,
        cassOwed: taxResult.healthContribution?.amountOwed,
        cassThresholdHit: taxResult.healthContribution?.thresholdHit,
        totalTaxOwed: taxResult.totals?.totalTaxOwed,
        earlyFilingDiscount: taxResult.totals?.earlyFilingDiscount,
      },
    });

    // Create security calculations
    if (securities && Array.isArray(securities)) {
      for (const sec of securities) {
        await prisma.securityCalculation.create({
          data: {
            taxCalculationId: calc.id,
            isin: sec.isin,
            ticker: sec.ticker,
            securityName: sec.securityName,
            totalBoughtShares: sec.totalBoughtShares,
            totalSoldShares: sec.totalSoldShares,
            remainingShares: sec.remainingShares,
            weightedAvgCost: sec.weightedAvgCostLocal,
            totalProceeds: sec.totalProceeds,
            totalCostBasis: sec.totalCostBasis,
            realizedGainLoss: sec.realizedGainLoss,
            totalDividends: sec.totalDividends,
            totalWithholdingTax: sec.totalWithholdingTax,
          },
        });
      }
    }

    res.status(201).json({ id: taxYear.id, year, status: 'calculated' });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: 'Failed to save calculation' });
  }
});
