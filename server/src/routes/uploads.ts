import { Router } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma.js';

const securitySchema = z.object({
  isin: z.string().optional(),
  ticker: z.string().optional(),
  securityName: z.string().optional(),
  totalBoughtShares: z.number().optional(),
  totalSoldShares: z.number().optional(),
  remainingShares: z.number().optional(),
  weightedAvgCostLocal: z.number().optional(),
  totalProceeds: z.number().optional(),
  totalCostBasis: z.number().optional(),
  realizedGainLoss: z.number().optional(),
  totalDividends: z.number().optional(),
  totalWithholdingTax: z.number().optional(),
});

const uploadSchema = z.object({
  year: z.number().int().min(2000).max(2100),
  country: z.string().max(10).optional(),
  broker: z.string().max(50).optional(),
  fileName: z.string().max(255).optional(),
  taxResult: z.object({
    capitalGains: z.object({
      totalProceeds: z.number(),
      totalCostBasis: z.number(),
      netGains: z.number(),
      losses: z.number(),
      taxRate: z.number(),
      taxOwed: z.number(),
    }).optional(),
    dividends: z.object({
      grossTotal: z.number(),
      withholdingTaxPaid: z.number(),
      taxOwed: z.number(),
    }).optional(),
    healthContribution: z.object({
      totalNonSalaryIncome: z.number(),
      thresholdHit: z.string(),
      amountOwed: z.number(),
    }).optional(),
    totals: z.object({
      totalTaxOwed: z.number(),
      earlyFilingDiscount: z.number(),
      totalAfterDiscount: z.number(),
    }).optional(),
  }),
  securities: z.array(securitySchema).optional(),
});

export const uploadsRouter = Router();

// POST /api/uploads — save a tax calculation (requires auth)
uploadsRouter.post('/', async (req, res) => {
  try {
    const parsed = uploadSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid upload data', details: parsed.error.issues });
      return;
    }
    const { year, country, broker, fileName, taxResult, securities } = parsed.data;

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
