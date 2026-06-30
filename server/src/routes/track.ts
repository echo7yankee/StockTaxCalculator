import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import prisma from '../lib/prisma.js';
import { ANALYTICS_EVENTS } from '../lib/analyticsEvents.js';
import { isPageviewSweep } from '../lib/analyticsBotGuard.js';

const isProd = process.env.NODE_ENV === 'production';

// Telemetry is far chattier than the protected API (one beacon per route change),
// so it gets its own generous limiter and is skipped from the global limiter in
// index.ts (otherwise a normal browsing session's pageviews would eat the same
// per-IP budget that protects login/checkout). Still bounded, so the open
// endpoint cannot be used to flood the table from a single IP.
const trackLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isProd ? 600 : 6000,
  standardHeaders: true,
  legacyHeaders: false,
});

const trackSchema = z.object({
  name: z.enum(ANALYTICS_EVENTS),
  path: z.string().max(512).optional(),
  referrer: z.string().max(512).optional(),
});

// Obvious crawler UAs are dropped (inspected here, never stored). Funnel events
// need JS so bots rarely fire them, but pageviews would otherwise be inflated.
const BOT_UA = /bot|crawl|spider|slurp|bingpreview|headless|lighthouse|pingdom|uptimerobot|monitor|preview/i;

// Keep only the pathname; drop query string + hash, which can carry PII or tokens.
function sanitizePath(raw?: string): string | undefined {
  if (!raw) return undefined;
  try {
    return new URL(raw, 'http://placeholder.invalid').pathname.slice(0, 256);
  } catch {
    return raw.split('?')[0].split('#')[0].slice(0, 256);
  }
}

// Store only the referrer HOST (e.g. "chatgpt.com"), never the full URL.
function sanitizeReferrerHost(raw?: string): string | undefined {
  if (!raw) return undefined;
  try {
    const host = new URL(raw).hostname;
    return host ? host.slice(0, 128) : undefined;
  } catch {
    return undefined;
  }
}

export const trackRouter = Router();

// POST /api/track: record one first-party, cookieless analytics event. Best-effort
// by design. The client sends this via navigator.sendBeacon and ignores the
// response, so the status code is for tests/debugging only and a write failure
// must never surface to the page. Unknown/invalid events are dropped (no row).
trackRouter.post('/', trackLimiter, async (req, res) => {
  const ua = req.get('user-agent') ?? '';
  if (BOT_UA.test(ua)) {
    res.status(204).end();
    return;
  }

  const parsed = trackSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).end();
    return;
  }

  // UA rotation defeats the static BOT_UA list, so also gate the pageview
  // firehose on behaviour: a single IP enumerating the site is a sweep, not a
  // reader. Funnel/other events are left alone (low volume, need real JS).
  if (parsed.data.name === 'pageview' && isPageviewSweep(req.ip ?? 'unknown', Date.now())) {
    res.status(204).end();
    return;
  }

  try {
    await prisma.analyticsEvent.create({
      data: {
        name: parsed.data.name,
        path: sanitizePath(parsed.data.path),
        referrer: sanitizeReferrerHost(parsed.data.referrer),
      },
    });
  } catch (err) {
    // Telemetry is non-critical: log and move on, do not error-spam or 500.
    console.error('[track] write failed:', err);
  }

  res.status(204).end();
});
