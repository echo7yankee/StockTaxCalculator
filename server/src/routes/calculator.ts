import { Router } from 'express';
import { z } from 'zod/v4';
import { getCountryConfig, calculateQuickTax } from '@investax/shared';

export const calculatorRouter = Router();

const quickCalcSchema = z.object({
  capitalGains: z.number().min(0).default(0),
  dividends: z.number().min(0).default(0),
  withholdingTaxPaid: z.number().min(0).default(0),
  otherNonSalaryIncome: z.number().min(0).default(0),
  country: z.string().length(2).default('RO'),
});

calculatorRouter.post('/quick', (req, res) => {
  const parsed = quickCalcSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0].message });
    return;
  }

  const { country, ...input } = parsed.data;

  const config = getCountryConfig(country);
  if (!config) {
    res.status(400).json({ error: 'Unsupported country' });
    return;
  }

  const result = calculateQuickTax(input, config);

  res.json({
    ...result,
    totalAfterDiscount: result.totalOwed - result.earlyFilingDiscount,
  });
});
