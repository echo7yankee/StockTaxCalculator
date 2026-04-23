import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { createStripeCheckoutSession, isStripeEnabled } from '../services/stripe.js';

export const paymentRouter = Router();

function currentPaymentProvider(): 'lemon' | 'stripe' {
  const v = (process.env.PAYMENT_PROVIDER || 'lemon').toLowerCase();
  return v === 'stripe' ? 'stripe' : 'lemon';
}

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

// GET /api/payment/checkout — requires auth, returns a provider-specific checkout URL.
// Provider selected via PAYMENT_PROVIDER env var ("lemon" default, "stripe" alternate).
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

  const provider = currentPaymentProvider();

  if (provider === 'stripe') {
    if (!isStripeEnabled()) {
      res.status(503).json({ error: 'Payment system not configured yet' });
      return;
    }

    // For Stripe we pre-apply the launch coupon server-side when spots remain.
    // LS flow differs: user types LAUNCH2026 at LS-hosted checkout, we don't branch here.
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
      res.status(502).json({ error: 'Failed to create checkout session' });
    }
    return;
  }

  // Default: Lemon Squeezy flow
  const storeId = process.env.LEMON_SQUEEZY_STORE_ID;
  const variantId = process.env.LEMON_SQUEEZY_VARIANT_ID;
  const apiKey = process.env.LEMON_SQUEEZY_API_KEY;

  if (!storeId || !variantId || !apiKey) {
    res.status(503).json({ error: 'Payment system not configured yet' });
    return;
  }

  try {
    const response = await fetch('https://api.lemonsqueezy.com/v1/checkouts', {
      method: 'POST',
      headers: {
        'Accept': 'application/vnd.api+json',
        'Content-Type': 'application/vnd.api+json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        data: {
          type: 'checkouts',
          attributes: {
            checkout_data: {
              email: user.email,
              name: user.name || undefined,
              custom: {
                user_id: user.id,
              },
            },
            product_options: {
              redirect_url: `${process.env.CLIENT_URL || 'https://investax.app'}/upload?welcome=1`,
            },
          },
          relationships: {
            store: {
              data: { type: 'stores', id: storeId },
            },
            variant: {
              data: { type: 'variants', id: variantId },
            },
          },
        },
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error('Lemon Squeezy checkout API error:', response.status, errorBody);
      res.status(502).json({ error: 'Failed to create checkout session' });
      return;
    }

    const result = await response.json();
    const checkoutUrl = result.data?.attributes?.url;

    if (!checkoutUrl) {
      console.error('Lemon Squeezy checkout response missing URL:', JSON.stringify(result));
      res.status(502).json({ error: 'Failed to create checkout session' });
      return;
    }

    res.json({ checkoutUrl });
  } catch (err) {
    console.error('Lemon Squeezy checkout error:', err);
    res.status(502).json({ error: 'Failed to create checkout session' });
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
