import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import * as Sentry from '@sentry/node';
import { sendContactMessageNotification } from '../services/email.js';

const isProd = process.env.NODE_ENV === 'production';

// Tight rate limit per IP. 3 messages per 15 min in prod handles the legitimate
// "user submits, realizes typo, resubmits, asks follow-up" pattern without
// inviting bot-driven abuse on a public form.
const contactLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isProd ? 3 : 50,
  message: { error: 'Too many messages, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

const contactSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100, 'Name too long'),
  email: z.string().trim().email('Invalid email address').max(254, 'Email too long'),
  topic: z.enum(['support', 'general', 'business']),
  message: z.string().trim().min(10, 'Message too short').max(5000, 'Message too long'),
  language: z.enum(['ro', 'en']).default('ro'),
});

export const contactRouter = Router();

// POST /api/contact — send a message to the operator inbox.
// On success: 200 { ok: true }. The contact-form caller treats this as a friendly
// "thanks for your message" regardless of whether the admin email was actually
// delivered, so a missing ADMIN_NOTIFICATION_EMAIL env var doesn't surface as a
// user error. Sentry catches real delivery failures.
contactRouter.post('/', contactLimiter, async (req, res) => {
  const parseResult = contactSchema.safeParse(req.body);
  if (!parseResult.success) {
    const firstIssue = parseResult.error.issues[0];
    res.status(400).json({
      error: 'Invalid input',
      field: firstIssue.path.join('.'),
      message: firstIssue.message,
    });
    return;
  }

  const { name, email, topic, message, language } = parseResult.data;

  // express-rate-limit + trust proxy already populates req.ip from the
  // X-Forwarded-For header in production. In dev it's the loopback address.
  const ipAddress = typeof req.ip === 'string' ? req.ip : null;
  const userAgent =
    typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : null;

  try {
    await sendContactMessageNotification({
      fromName: name,
      fromEmail: email,
      topic,
      message,
      language,
      ipAddress,
      userAgent,
    });
    res.json({ ok: true });
  } catch (err) {
    console.error('[Contact] sendContactMessageNotification failed:', err);
    Sentry.captureException(err, {
      tags: { endpoint: 'contact.submit' },
      extra: { fromEmail: email, topic },
    });
    res.status(500).json({ error: 'Failed to send message. Please try again later.' });
  }
});
