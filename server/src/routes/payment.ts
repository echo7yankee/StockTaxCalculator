import { Router } from 'express';
import prisma from '../lib/prisma.js';

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
    res.status(500).json({ error: 'Failed to fetch promo status' });
  }
});

// GET /api/payment/checkout — requires auth, returns Lemon Squeezy checkout URL
paymentRouter.get('/checkout', async (req, res) => {
  if (!req.isAuthenticated() || !req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const storeId = process.env.LEMON_SQUEEZY_STORE_ID;
  const variantId = process.env.LEMON_SQUEEZY_VARIANT_ID;

  if (!storeId || !variantId) {
    res.status(503).json({ error: 'Payment system not configured yet' });
    return;
  }

  // Check if user already has an active paid plan
  const user = req.user;
  if (user.plan === 'paid' && user.planExpiresAt && new Date(user.planExpiresAt) > new Date()) {
    res.status(400).json({ error: 'You already have an active paid plan' });
    return;
  }

  // Build Lemon Squeezy checkout URL with custom data
  const checkoutUrl = new URL(`https://investax.lemonsqueezy.com/checkout/buy/${variantId}`);
  checkoutUrl.searchParams.set('checkout[custom][user_id]', user.id);
  checkoutUrl.searchParams.set('checkout[email]', user.email);
  if (user.name) {
    checkoutUrl.searchParams.set('checkout[name]', user.name);
  }
  checkoutUrl.searchParams.set('embed', '0'); // Hosted checkout page

  res.json({ checkoutUrl: checkoutUrl.toString() });
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
