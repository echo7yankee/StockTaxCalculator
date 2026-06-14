import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { recordError } from '../lib/errorMonitor.js';

const isProd = process.env.NODE_ENV === 'production';

// Client error beacons are rarer than pageviews (a healthy session emits zero),
// so this gets a tighter limiter than /api/track but still its own, and is
// skipped from the global limiter in index.ts: a client error-storm must not eat
// the per-IP budget that protects login/checkout. Still bounded so the open
// endpoint cannot flood the table from a single IP.
const errorsLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isProd ? 120 : 1200,
  standardHeaders: true,
  legacyHeaders: false,
});

// Bounded strings as defense-in-depth: recordError truncates again server-side,
// but capping here keeps an oversized payload from ever entering the pipeline.
const errorSchema = z.object({
  name: z.string().max(200).optional(),
  message: z.string().max(2000).optional(),
  stack: z.string().max(10000).optional(),
  context: z.string().max(200).optional(),
});

// Obvious crawler UAs are dropped (inspected here, never stored). Capturing JS
// needs a real browser, so bots rarely fire this, but headless crawlers can.
const BOT_UA = /bot|crawl|spider|slurp|bingpreview|headless|lighthouse|pingdom|uptimerobot|monitor|preview/i;

export const errorsRouter = Router();

// POST /api/errors: ingest one client-side captured error into the grouped
// ErrorEvent table. Best-effort by design. The client sends this via
// navigator.sendBeacon and ignores the response, and an error beacon must never
// be able to error the page, so this ALWAYS resolves to 204 once the body is
// valid - even if the DB write fails. recordError junk-filters, normalizes,
// PII-scrubs and never throws on its own. We force source='client' and never
// trust a source field from the wire.
errorsRouter.post('/', errorsLimiter, async (req, res) => {
  const ua = req.get('user-agent') ?? '';
  if (BOT_UA.test(ua)) {
    res.status(204).end();
    return;
  }

  const parsed = errorSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).end();
    return;
  }

  // recordError already swallows its own failures, but a client error beacon must
  // be guaranteed never to error the page, so a defensive catch keeps the 204
  // contract even if recordError's no-throw guarantee ever regressed.
  try {
    await recordError({
      name: parsed.data.name,
      message: parsed.data.message,
      stack: parsed.data.stack,
      context: parsed.data.context,
      source: 'client',
    });
  } catch (err) {
    console.error('[errors] recordError failed:', err);
  }

  res.status(204).end();
});
