import { Router } from 'express';
import crypto from 'crypto';
import type { Prisma } from '@prisma/client';
import prisma from '../lib/prisma.js';

export const webhookRouter = Router();

interface LemonSqueezyWebhookPayload {
  meta?: {
    event_name?: string;
    webhook_id?: string;
    custom_data?: {
      user_id?: string;
      discount_code?: string;
    };
  };
  data?: {
    id?: string | number;
    attributes?: {
      customer_id?: string | number;
      discount_total_formatted?: string;
    };
  };
}

function verifySignature(rawBody: Buffer, signature: string | undefined, secret: string): boolean {
  if (!signature) return false;
  const hmac = crypto.createHmac('sha256', secret);
  const digest = hmac.update(rawBody).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest));
}

// POST /api/webhooks/lemon — Lemon Squeezy webhook handler
webhookRouter.post('/', async (req, res) => {
  const secret = process.env.LEMON_SQUEEZY_WEBHOOK_SECRET;
  if (!secret) {
    console.error('LEMON_SQUEEZY_WEBHOOK_SECRET not configured');
    res.status(500).json({ error: 'Webhook not configured' });
    return;
  }

  const rawBody = req.body as Buffer;
  const signature = req.headers['x-signature'] as string | undefined;

  if (!verifySignature(rawBody, signature, secret)) {
    console.warn('Invalid webhook signature');
    res.status(401).json({ error: 'Invalid signature' });
    return;
  }

  let payload: LemonSqueezyWebhookPayload;
  try {
    payload = JSON.parse(rawBody.toString());
  } catch {
    res.status(400).json({ error: 'Invalid JSON' });
    return;
  }

  const eventName = payload.meta?.event_name;
  const eventId = payload.meta?.webhook_id || payload.data?.id;

  if (!eventName || !eventId) {
    res.status(400).json({ error: 'Missing event metadata' });
    return;
  }

  // Idempotency check — skip if already processed
  const existing = await prisma.webhookEvent.findUnique({ where: { id: String(eventId) } });
  if (existing) {
    res.json({ ok: true, message: 'Already processed' });
    return;
  }

  // Store event for idempotency + audit trail
  await prisma.webhookEvent.create({
    data: {
      id: String(eventId),
      eventName,
      payload: JSON.stringify(payload),
    },
  });

  try {
    switch (eventName) {
      case 'order_created': {
        const userId = payload.meta?.custom_data?.user_id;
        if (!userId) {
          console.error('order_created webhook missing user_id in custom_data');
          break;
        }

        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) {
          console.error(`order_created: user ${userId} not found`);
          break;
        }

        const now = new Date();
        const expiresAt = new Date(now);
        expiresAt.setFullYear(expiresAt.getFullYear() + 1);

        // Check if launch discount was used
        const isLaunchPrice = payload.data?.attributes?.discount_total_formatted
          || payload.meta?.custom_data?.discount_code === 'LAUNCH2026';

        const updateData: Prisma.UserUpdateInput = {
          plan: 'paid',
          planPurchasedAt: now,
          planExpiresAt: expiresAt,
          lemonCustomerId: String(payload.data?.attributes?.customer_id || ''),
          lemonOrderId: String(payload.data?.id || ''),
        };

        // Increment promo counter if launch price was used
        if (isLaunchPrice && !user.launchPriceUsed) {
          updateData.launchPriceUsed = true;
          await prisma.promoCounter.update({
            where: { id: 'launch_2026' },
            data: { count: { increment: 1 } },
          });
        }

        await prisma.user.update({ where: { id: userId }, data: updateData });
        console.log(`User ${userId} upgraded to paid plan (expires ${expiresAt.toISOString()})`);
        break;
      }

      case 'order_refunded': {
        const userId = payload.meta?.custom_data?.user_id;
        if (!userId) {
          console.error('order_refunded webhook missing user_id in custom_data');
          break;
        }

        await prisma.user.update({
          where: { id: userId },
          data: {
            plan: 'free',
            planExpiresAt: null,
          },
        });
        console.log(`User ${userId} plan reverted to free (refund)`);
        break;
      }

      default:
        console.log(`Unhandled webhook event: ${eventName}`);
    }

    res.json({ ok: true });
  } catch (err) {
    console.error(`Webhook processing error (${eventName}):`, err);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});
