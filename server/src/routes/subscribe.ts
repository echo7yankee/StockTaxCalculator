import { Router } from 'express';
import crypto from 'crypto';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import * as Sentry from '@sentry/node';
import prisma from '../lib/prisma.js';
import { sendSubscribeConfirmEmail, sendSubscribeWelcomeEmail } from '../services/email.js';

const isProd = process.env.NODE_ENV === 'production';

// Off-season audience capture is a low-frequency action per visitor. 5/15min in
// prod stops bot-driven list stuffing without blocking a user who subscribes to
// both the filing reminder and a broker waitlist in one sitting.
const subscribeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isProd ? 5 : 50,
  message: { error: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

const TOPICS = ['filing_reminder', 'broker_revolut', 'broker_ibkr'] as const;

const subscribeSchema = z.object({
  email: z.string().trim().email('Invalid email address').max(254, 'Email too long'),
  topic: z.enum(TOPICS),
  language: z.enum(['ro', 'en']).default('ro'),
  source: z.string().trim().max(60).optional(),
  // Honeypot. Real users never fill this hidden field; bots auto-fill it.
  // Accepted by the schema (so a tripped honeypot does not 400 and tip off the
  // bot) and silently dropped in the handler.
  website: z.string().max(200).optional(),
});

function baseUrl(): string {
  // Same-origin in prod (nginx serves /api on investax.app); dev proxies /api
  // through Vite, so the client origin works for both confirm and unsubscribe.
  return process.env.CLIENT_URL || 'http://localhost:5173';
}

export const subscribeRouter = Router();

// POST /api/subscribe: capture an email for a filing reminder or broker waitlist.
// Always returns 200 { ok: true } whether the email is new, pending, or already
// subscribed (no enumeration leak). Double opt-in: a confirm email is sent and
// the row only becomes "confirmed" once the link in it is clicked.
subscribeRouter.post('/', subscribeLimiter, async (req, res) => {
  const parsed = subscribeSchema.safeParse(req.body);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    res.status(400).json({
      error: 'Invalid input',
      field: firstIssue.path.join('.'),
      message: firstIssue.message,
    });
    return;
  }

  const { topic, language, source, website } = parsed.data;
  const email = parsed.data.email.toLowerCase();

  // Honeypot tripped -> pretend success, store nothing, send nothing.
  if (website && website.length > 0) {
    res.json({ ok: true });
    return;
  }

  try {
    const existing = await prisma.emailSubscriber.findUnique({
      where: { email_topic: { email, topic } },
    });

    // Already an active subscriber for this topic -> uniform success, no re-send.
    if (existing?.confirmedAt && !existing.unsubscribedAt) {
      res.json({ ok: true });
      return;
    }

    const confirmToken = crypto.randomBytes(32).toString('hex');
    // Reuse the existing unsubscribe token on re-subscribe so old unsubscribe
    // links stay valid; mint a fresh one for a brand-new row.
    const unsubToken = existing?.unsubToken ?? crypto.randomBytes(32).toString('hex');

    await prisma.emailSubscriber.upsert({
      where: { email_topic: { email, topic } },
      create: { email, topic, language, source, confirmToken, unsubToken },
      // Pending or previously unsubscribed -> reset to a fresh pending state so
      // re-consent is required before we email them again.
      update: { language, source, confirmToken, confirmedAt: null, unsubscribedAt: null },
    });

    const confirmUrl = `${baseUrl()}/api/subscribe/confirm?token=${confirmToken}`;
    await sendSubscribeConfirmEmail({ to: email, confirmUrl, topic, language });

    res.json({ ok: true });
  } catch (err) {
    console.error('[Subscribe] submit failed:', err);
    Sentry.captureException(err, { tags: { endpoint: 'subscribe.submit' }, extra: { topic } });
    res.status(500).json({ error: 'Failed to subscribe. Please try again later.' });
  }
});

// GET /api/subscribe/confirm?token=... is the double opt-in confirmation, clicked
// from the confirm email. Marks the row confirmed, sends the welcome email once,
// and renders a small branded landing page (these are one-off email links, not
// SPA routes, so the server renders them directly).
subscribeRouter.get('/confirm', async (req, res) => {
  const token = typeof req.query.token === 'string' ? req.query.token : '';
  if (!token) {
    res.status(400).type('html').send(landingPage('ro', 'error'));
    return;
  }

  try {
    const sub = await prisma.emailSubscriber.findUnique({ where: { confirmToken: token } });
    if (!sub) {
      res.status(200).type('html').send(landingPage('ro', 'invalid'));
      return;
    }

    const language: 'ro' | 'en' = sub.language === 'en' ? 'en' : 'ro';
    const firstConfirm = !sub.confirmedAt;

    // Confirm only sets confirmedAt; it must NOT clear unsubscribedAt. A genuine
    // first confirm already has unsubscribedAt null (the POST handler resets it),
    // so an explicit reset here only ever resurrected a row whose owner had since
    // unsubscribed (a stale confirm link re-clicked after opting out). Re-subscribing
    // goes through POST /api/subscribe, which re-mints the token and clears
    // unsubscribedAt under fresh consent.
    await prisma.emailSubscriber.update({
      where: { id: sub.id },
      data: { confirmedAt: sub.confirmedAt ?? new Date() },
    });

    if (firstConfirm) {
      const unsubscribeUrl = `${baseUrl()}/api/subscribe/unsubscribe?token=${sub.unsubToken}`;
      await sendSubscribeWelcomeEmail({ to: sub.email, unsubscribeUrl, topic: sub.topic, language });
    }

    res.status(200).type('html').send(landingPage(language, 'confirmed'));
  } catch (err) {
    console.error('[Subscribe] confirm failed:', err);
    Sentry.captureException(err, { tags: { endpoint: 'subscribe.confirm' } });
    res.status(500).type('html').send(landingPage('ro', 'error'));
  }
});

// GET /api/subscribe/unsubscribe?token=... is the one-click unsubscribe from any
// email. Idempotent; renders a branded confirmation page.
subscribeRouter.get('/unsubscribe', async (req, res) => {
  const token = typeof req.query.token === 'string' ? req.query.token : '';
  if (!token) {
    res.status(400).type('html').send(landingPage('ro', 'error'));
    return;
  }

  try {
    const sub = await prisma.emailSubscriber.findUnique({ where: { unsubToken: token } });
    if (!sub) {
      res.status(200).type('html').send(landingPage('ro', 'invalid'));
      return;
    }

    const language: 'ro' | 'en' = sub.language === 'en' ? 'en' : 'ro';
    if (!sub.unsubscribedAt) {
      await prisma.emailSubscriber.update({
        where: { id: sub.id },
        data: { unsubscribedAt: new Date() },
      });
    }

    res.status(200).type('html').send(landingPage(language, 'unsubscribed'));
  } catch (err) {
    console.error('[Subscribe] unsubscribe failed:', err);
    Sentry.captureException(err, { tags: { endpoint: 'subscribe.unsubscribe' } });
    res.status(500).type('html').send(landingPage('ro', 'error'));
  }
});

type LandingKind = 'confirmed' | 'unsubscribed' | 'invalid' | 'error';

// Minimal branded HTML for the email-link landing pages. noindex (one-off links),
// self-contained, RO/EN.
function landingPage(language: 'ro' | 'en', kind: LandingKind): string {
  const ro: Record<LandingKind, { h: string; p: string }> = {
    confirmed: {
      h: 'Abonare confirmată',
      p: 'Gata, ești pe listă. Îți trimitem un email când avem noutăți. Poți închide această filă.',
    },
    unsubscribed: {
      h: 'Te-ai dezabonat',
      p: 'Nu-ți mai trimitem emailuri. Poți închide această filă.',
    },
    invalid: {
      h: 'Link invalid sau expirat',
      p: 'Linkul nu mai e valid, probabil a fost deja folosit. Te poți abona din nou pe investax.app.',
    },
    error: {
      h: 'Ceva n-a mers',
      p: 'A apărut o eroare. Încearcă din nou mai târziu sau scrie-ne la support@investax.app.',
    },
  };
  const en: Record<LandingKind, { h: string; p: string }> = {
    confirmed: {
      h: 'Subscription confirmed',
      p: "You're on the list. We'll email you when there's news. You can close this tab.",
    },
    unsubscribed: {
      h: "You're unsubscribed",
      p: "We won't email you anymore. You can close this tab.",
    },
    invalid: {
      h: 'Invalid or expired link',
      p: 'This link is no longer valid, most likely already used. You can subscribe again at investax.app.',
    },
    error: {
      h: 'Something went wrong',
      p: 'An error occurred. Please try again later or email support@investax.app.',
    },
  };
  const copy = (language === 'ro' ? ro : en)[kind];
  return `<!DOCTYPE html>
<html lang="${language}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex">
  <title>InvesTax</title>
</head>
<body style="font-family:system-ui,sans-serif;background:#0b1426;color:#e2e8f0;margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;">
  <main style="max-width:480px;text-align:center;">
    <h1 style="font-size:22px;margin:0 0 12px;">${copy.h}</h1>
    <p style="font-size:15px;line-height:1.6;color:#94a3b8;margin:0 0 24px;">${copy.p}</p>
    <a href="https://investax.app" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:6px;font-weight:600;font-size:14px;">investax.app</a>
  </main>
</body>
</html>`;
}
