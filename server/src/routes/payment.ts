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

  // Create checkout via Lemon Squeezy API (returns a unique checkout URL)
  const apiKey = process.env.LEMON_SQUEEZY_API_KEY;
  if (!apiKey) {
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
