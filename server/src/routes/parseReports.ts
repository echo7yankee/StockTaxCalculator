import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import * as Sentry from '@sentry/node';
import { sendParseAlertNotification } from '../services/email.js';

const isProd = process.env.NODE_ENV === 'production';

// A customer retrying a failing upload a handful of times is legitimate; a
// runaway loop spamming the operator inbox is not. 30 reports / 15 min per IP
// sits far above any honest upload cadence and still caps an accidental storm.
const parseReportLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isProd ? 30 : 200,
  message: { error: 'Too many reports' },
  standardHeaders: true,
  legacyHeaders: false,
});

const countField = z.number().int().min(0).max(1_000_000).optional();

const parseReportSchema = z.object({
  fileType: z.enum(['pdf', 'csv']),
  outcome: z.enum(['success', 'warning', 'error']),
  fileName: z.string().trim().max(255).nullish(),
  errorMessage: z.string().trim().max(2000).nullish(),
  warnings: z.array(z.string().trim().max(500)).max(50).default([]),
  summary: z
    .object({
      buys: countField,
      sells: countField,
      dividends: countField,
      distributions: countField,
      skipped: countField,
      totalRows: countField,
      pages: z.number().int().min(0).max(10_000).optional(),
      year: z.number().int().min(2000).max(2100).optional(),
    })
    .default({}),
});

export const parseReportsRouter = Router();

// POST /api/parse-reports — a paying customer's client reports the outcome of a
// PDF/CSV parse so a failure or invariant warning reaches the operator inbox in
// minutes instead of staying invisible. Mounted behind requirePaidPlan, so
// req.user is guaranteed. The client fires this fire-and-forget.
parseReportsRouter.post('/', parseReportLimiter, async (req, res) => {
  const parseResult = parseReportSchema.safeParse(req.body);
  if (!parseResult.success) {
    const firstIssue = parseResult.error.issues[0];
    res.status(400).json({
      error: 'Invalid input',
      field: firstIssue.path.join('.'),
      message: firstIssue.message,
    });
    return;
  }

  const { fileType, outcome, fileName, errorMessage, warnings, summary } = parseResult.data;
  const user = req.user!;

  try {
    await sendParseAlertNotification({
      userEmail: user.email,
      userName: user.name,
      fileType,
      outcome,
      fileName: fileName ?? null,
      errorMessage: errorMessage ?? null,
      warnings,
      summary,
    });
    res.json({ ok: true });
  } catch (err) {
    console.error('[ParseReports] sendParseAlertNotification failed:', err);
    Sentry.captureException(err, {
      tags: { endpoint: 'parse-reports.submit' },
      extra: { userEmail: user.email, fileType, outcome },
    });
    res.status(500).json({ error: 'Failed to record report' });
  }
});
