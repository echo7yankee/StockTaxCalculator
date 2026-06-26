import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod/v4';
import { getCountryConfig, calculateQuickTax, D212_SUPPORTED_TAX_YEAR } from '@investax/shared';

export const calculatorRouter = Router();

const isProd = process.env.NODE_ENV === 'production';
const SITE_URL = 'https://investax.app';

// Public, unauthenticated compute endpoint = the FREE quick-calc only (the same
// manual estimate as the in-app /calculator and the embed widget). The paid moat
// (real broker-statement parsing + Declaratia Unica generation) stays behind
// requirePaidPlan and is NOT exposed here. This endpoint is documented for LLMs /
// ChatGPT Actions (client/public/openapi.json + llms.txt), so calls cluster on a
// few shared provider egress IPs; it gets its own generous limiter and is excluded
// from the global per-IP limiter in index.ts, so one provider IP cannot throttle
// every user of an InvesTax GPT. Still bounded against abuse.
const calculatorLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isProd ? 600 : 6000,
  standardHeaders: true,
  legacyHeaders: false,
});

const quickCalcSchema = z.object({
  capitalGains: z.number().min(0).default(0),
  dividends: z.number().min(0).default(0),
  withholdingTaxPaid: z.number().min(0).default(0),
  otherNonSalaryIncome: z.number().min(0).default(0),
  country: z.string().length(2).default('RO'),
});

calculatorRouter.post('/quick', calculatorLimiter, (req, res) => {
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
    currency: config.currency,
    // Config-driven, so it stays correct when the engine advances tax years
    // (no hardcoded year/rate here).
    taxYear: D212_SUPPORTED_TAX_YEAR,
    capitalGainsTaxRate: config.capitalGainsTaxRate,
    dividendTaxRate: config.dividendTaxRate,
    // Relay-friendly fields: any LLM/agent that surfaces this estimate also
    // surfaces that it is an estimate (not advice) and where the real,
    // statement-based calculation + Declaratia Unica live.
    disclaimer:
      'Estimare orientativă pe baza regulilor fiscale din România, nu consiliere fiscală. Pentru calcul din extrasul real (Trading 212, Revolut, IBKR) și generarea Declarației Unice, vezi investax.app.',
    source: SITE_URL,
  });
});
