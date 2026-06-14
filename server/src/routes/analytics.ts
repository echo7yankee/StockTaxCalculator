import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { parseReportArgs, summarize } from '../scripts/analytics-report.js';
import { summarizeErrors } from '../scripts/errors-report.js';

// Read-only analytics summary for the admin dashboard. This is the HTTP sibling
// of the `npm run analytics` CLI: it reuses the SAME pure parseReportArgs() +
// summarize() from analytics-report.ts, so the browser view and the CLI can
// never drift in how they window or aggregate the data.
//
// Mounted behind requireAdmin in index.ts (operator allowlist via ADMIN_EMAILS),
// so this router never has to do its own auth. It only ever reads.
export const analyticsRouter = Router();

// GET /api/analytics/summary?days=N | since=YYYY-MM-DD | all
// No window param defaults to the last 30 days, matching the CLI default.
analyticsRouter.get('/summary', async (req, res) => {
  // Translate the query params into the CLI's argv form so the exact same parser
  // (and its validation) governs both surfaces. days wins over since wins over all.
  const argv: string[] = [];
  if (typeof req.query.days === 'string') argv.push('--days', req.query.days);
  else if (typeof req.query.since === 'string') argv.push('--since', req.query.since);
  else if (req.query.all !== undefined) argv.push('--all');

  let opts;
  try {
    opts = parseReportArgs(argv, new Date());
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Invalid window' });
    return;
  }

  try {
    const rows = await prisma.analyticsEvent.findMany({
      where: opts.since ? { createdAt: { gte: opts.since } } : undefined,
      select: { name: true, path: true, referrer: true, createdAt: true },
    });
    res.json(summarize(rows, opts.label));
  } catch (err) {
    console.error('[analytics] summary read failed:', err);
    res.status(500).json({ error: 'Failed to read analytics' });
  }
});

// GET /api/analytics/errors?days=N | since=YYYY-MM-DD | all
// The HTTP sibling of the `npm run errors` CLI: reuses the SAME parseReportArgs()
// window logic and the SAME pure summarizeErrors() from errors-report.ts, so the
// dashboard's Errors section and the CLI can never drift. The window filters on
// when an issue was LAST seen (lastSeen), matching the CLI. No window param
// defaults to the last 30 days.
analyticsRouter.get('/errors', async (req, res) => {
  // Same query-to-argv translation as /summary: days wins over since wins over all.
  const argv: string[] = [];
  if (typeof req.query.days === 'string') argv.push('--days', req.query.days);
  else if (typeof req.query.since === 'string') argv.push('--since', req.query.since);
  else if (req.query.all !== undefined) argv.push('--all');

  let opts;
  try {
    opts = parseReportArgs(argv, new Date());
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Invalid window' });
    return;
  }

  try {
    const rows = await prisma.errorEvent.findMany({
      where: opts.since ? { lastSeen: { gte: opts.since } } : undefined,
      select: {
        fingerprint: true,
        source: true,
        name: true,
        message: true,
        context: true,
        count: true,
        firstSeen: true,
        lastSeen: true,
      },
    });
    res.json(summarizeErrors(rows, opts.label));
  } catch (err) {
    console.error('[analytics] errors read failed:', err);
    res.status(500).json({ error: 'Failed to read errors' });
  }
});
