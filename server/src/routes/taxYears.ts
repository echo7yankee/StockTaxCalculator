import { Router } from 'express';
import prisma from '../lib/prisma.js';

export const taxYearsRouter = Router();

// GET /api/tax-years — list current user's saved calculations
taxYearsRouter.get('/', async (req, res) => {
  try {
    const userId = req.user!.id;

    const taxYears = await prisma.taxYear.findMany({
      where: { userId },
      include: {
        calculation: {
          select: {
            totalTaxOwed: true,
            capitalGainsTax: true,
            dividendTaxOwed: true,
            cassOwed: true,
            earlyFilingDiscount: true,
            calculatedAt: true,
          },
        },
        csvUploads: {
          select: { filename: true, broker: true, uploadedAt: true },
          orderBy: { uploadedAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { year: 'desc' },
    });

    const result = taxYears.map(ty => ({
      id: ty.id,
      year: ty.year,
      country: ty.country,
      status: ty.status,
      totalTaxOwed: ty.calculation?.totalTaxOwed ?? null,
      capitalGainsTax: ty.calculation?.capitalGainsTax ?? null,
      dividendTaxOwed: ty.calculation?.dividendTaxOwed ?? null,
      cassOwed: ty.calculation?.cassOwed ?? null,
      earlyFilingDiscount: ty.calculation?.earlyFilingDiscount ?? null,
      calculatedAt: ty.calculation?.calculatedAt ?? null,
      fileName: ty.csvUploads[0]?.filename ?? null,
      broker: ty.csvUploads[0]?.broker ?? null,
    }));

    res.json(result);
  } catch (err) {
    console.error('Tax years list error:', err);
    res.status(500).json({ error: 'Failed to fetch tax years' });
  }
});

// GET /api/tax-years/:id — detailed view (ownership checked)
taxYearsRouter.get('/:id', async (req, res) => {
  try {
    const taxYear = await prisma.taxYear.findUnique({
      where: { id: req.params.id },
      include: {
        calculation: {
          include: {
            securities: true,
          },
        },
        csvUploads: {
          select: { filename: true, broker: true, uploadedAt: true },
        },
      },
    });

    if (!taxYear || taxYear.userId !== req.user!.id) {
      res.status(404).json({ error: 'Tax year not found' });
      return;
    }

    res.json(taxYear);
  } catch (err) {
    console.error('Tax year detail error:', err);
    res.status(500).json({ error: 'Failed to fetch tax year' });
  }
});

// DELETE /api/tax-years/:id — delete a saved calculation (ownership checked)
taxYearsRouter.delete('/:id', async (req, res) => {
  try {
    const taxYear = await prisma.taxYear.findUnique({
      where: { id: req.params.id },
      include: { calculation: true, csvUploads: true },
    });

    if (!taxYear || taxYear.userId !== req.user!.id) {
      res.status(404).json({ error: 'Tax year not found' });
      return;
    }

    // Delete in order: securities -> calculation -> transactions -> uploads -> taxYear
    if (taxYear.calculation) {
      await prisma.securityCalculation.deleteMany({
        where: { taxCalculationId: taxYear.calculation.id },
      });
      await prisma.taxCalculation.delete({ where: { id: taxYear.calculation.id } });
    }
    await prisma.transaction.deleteMany({ where: { taxYearId: taxYear.id } });
    await prisma.csvUpload.deleteMany({ where: { taxYearId: taxYear.id } });
    await prisma.taxYear.delete({ where: { id: taxYear.id } });

    res.json({ deleted: true });
  } catch (err) {
    console.error('Tax year delete error:', err);
    res.status(500).json({ error: 'Failed to delete tax year' });
  }
});
