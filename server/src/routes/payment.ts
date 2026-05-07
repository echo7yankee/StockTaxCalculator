import { Router } from 'express';
import * as Sentry from '@sentry/node';
import prisma from '../lib/prisma.js';
import { createStripeCheckoutSession, isStripeEnabled, StripeCheckoutError } from '../services/stripe.js';

// Single user-facing message for "the payment provider tripped on something
// that is almost certainly transient." Client translates by status code; this
// English fallback is for non-i18n consumers (curl, tests, future API users).
const CHECKOUT_UNAVAILABLE_MESSAGE =
  'Payment provider temporarily unavailable, please try again in a moment';

export const paymentRouter = Router();

// GET /api/payment/promo-status — public, returns launch promo counter
paymentRouter.get('/promo-status', async (_req, res) => {
  try {
    let counter = await prisma.promoCounter.findUnique({ where: { id: 'launch_2026' } });
    if (!counter) {
      counter = await prisma.promoCounter.create({
        data: { id: 'launch_2026', count: 0, limit: 100 },
      });
    }
    res.json({ count: counter.count, limit: counter.limit, remaining: counter.limit - counter.count });
  } catch (err) {
    console.error('Promo status error:', err);
    Sentry.captureException(err, { tags: { endpoint: 'payment.promoStatus' } });
    res.status(500).json({ error: 'Failed to fetch promo status' });
  }
});

// GET /api/payment/checkout — requires auth, returns a Stripe checkout URL.
paymentRouter.get('/checkout', async (req, res) => {
  if (!req.isAuthenticated() || !req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const user = req.user;
  if (user.plan === 'paid' && user.planExpiresAt && new Date(user.planExpiresAt) > new Date()) {
    res.status(400).json({ error: 'You already have an active paid plan' });
    return;
  }

  if (!isStripeEnabled()) {
    res.status(503).json({ error: 'Payment system not configured yet' });
    return;
  }

  // Pre-apply the launch coupon server-side when promo spots remain.
  let applyLaunchCoupon = false;
  try {
    const counter = await prisma.promoCounter.findUnique({ where: { id: 'launch_2026' } });
    if (counter && counter.count < counter.limit) applyLaunchCoupon = true;
  } catch {
    applyLaunchCoupon = false;
  }

  try {
    const result = await createStripeCheckoutSession({
      userId: user.id,
      email: user.email,
      name: user.name || undefined,
      applyLaunchCoupon,
    });
    if (!result) {
      res.status(503).json({ error: 'Payment system not configured yet' });
      return;
    }
    res.json({ checkoutUrl: result.url });
  } catch (err) {
    console.error('Stripe checkout error:', err);
    // StripeCheckoutError is already captured in services/stripe.ts; only
    // capture here for unexpected non-Stripe errors so we don't double-fire.
    if (!(err instanceof StripeCheckoutError)) {
      Sentry.captureException(err, {
        tags: { endpoint: 'payment.checkout' },
        extra: { userId: user.id, applyLaunchCoupon },
      });
    }
    res.status(502).json({ error: CHECKOUT_UNAVAILABLE_MESSAGE });
  }
});

// GET /api/payment/status — requires auth, returns user's plan status
paymentRouter.get('/status', async (req, res) => {
  if (!req.isAuthenticated() || !req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const user = req.user;
  const isActive = user.plan === 'paid' && user.planExpiresAt && new Date(user.planExpiresAt) > new Date();

  res.json({
    plan: user.plan,
    isActive,
    planPurchasedAt: user.planPurchasedAt,
    planExpiresAt: user.planExpiresAt,
    launchPriceUsed: user.launchPriceUsed,
  });
});
