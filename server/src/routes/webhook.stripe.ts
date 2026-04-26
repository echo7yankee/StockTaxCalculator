import { Router } from 'express';
import type Stripe from 'stripe';
import type { Prisma } from '@prisma/client';
import prisma from '../lib/prisma.js';
import { getStripeInstance } from '../services/stripe.js';

export const stripeWebhookRouter = Router();

// POST /api/webhooks/stripe — Stripe webhook handler (mirror of webhook.ts for LS)
stripeWebhookRouter.post('/', async (req, res) => {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const stripe = getStripeInstance();

  if (!secret || !stripe) {
    console.error('STRIPE_WEBHOOK_SECRET or STRIPE_SECRET_KEY not configured');
    res.status(500).json({ error: 'Webhook not configured' });
    return;
  }

  const rawBody = req.body as Buffer;
  const signature = req.headers['stripe-signature'] as string | undefined;

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature || '', secret);
  } catch (err) {
    console.warn('Invalid Stripe webhook signature:', err instanceof Error ? err.message : err);
    res.status(401).json({ error: 'Invalid signature' });
    return;
  }

  // Namespace event IDs to avoid collision with LS webhook events in the same WebhookEvent table.
  const eventId = `stripe_${event.id}`;

  // Fast-path idempotency check (avoids opening a transaction for already-processed events).
  // Real ordering guarantee comes from the unique constraint on WebhookEvent.id inside the
  // transaction below — two concurrent deliveries can't both insert the same id.
  const existing = await prisma.webhookEvent.findUnique({ where: { id: eventId } });
  if (existing) {
    res.json({ ok: true, message: 'Already processed' });
    return;
  }

  // Wrap the idempotency-row insert AND the business logic in a single transaction.
  // If anything throws (Prisma error, unexpected payload shape, etc.), the WebhookEvent
  // row rolls back along with the rest of the writes. Stripe will then retry the delivery,
  // pass the fast-path check (no row exists), and reprocess. Without this, a failure mid-
  // processing would leave the idempotency row committed and permanently mask the failure
  // from retries — the user's plan would never upgrade despite a successful charge.
  try {
    await prisma.$transaction(async (tx) => {
      await tx.webhookEvent.create({
        data: {
          id: eventId,
          eventName: event.type,
          payload: JSON.stringify(event),
        },
      });

      switch (event.type) {
        case 'checkout.session.completed': {
          const session = event.data.object as Stripe.Checkout.Session;
          const userId = session.client_reference_id || session.metadata?.user_id;
          if (!userId) {
            console.error('[Stripe] checkout.session.completed missing client_reference_id/metadata.user_id');
            break;
          }

          const user = await tx.user.findUnique({ where: { id: userId } });
          if (!user) {
            console.error(`[Stripe] checkout.session.completed: user ${userId} not found`);
            break;
          }

          const now = new Date();
          const expiresAt = new Date(now);
          expiresAt.setFullYear(expiresAt.getFullYear() + 1);

          const isLaunchPrice =
            session.metadata?.discount_code === 'LAUNCH2026' ||
            (session.total_details?.amount_discount ?? 0) > 0;

          const updateData: Prisma.UserUpdateInput = {
            plan: 'paid',
            planPurchasedAt: now,
            planExpiresAt: expiresAt,
            stripeCustomerId: typeof session.customer === 'string' ? session.customer : null,
            stripePaymentIntentId:
              typeof session.payment_intent === 'string' ? session.payment_intent : null,
          };

          if (isLaunchPrice && !user.launchPriceUsed) {
            updateData.launchPriceUsed = true;
            await tx.promoCounter.update({
              where: { id: 'launch_2026' },
              data: { count: { increment: 1 } },
            });
          }

          await tx.user.update({ where: { id: userId }, data: updateData });
          console.log(`[Stripe] User ${userId} upgraded to paid plan (expires ${expiresAt.toISOString()})`);
          break;
        }

        case 'charge.refunded': {
          const charge = event.data.object as Stripe.Charge;
          const paymentIntentId = typeof charge.payment_intent === 'string' ? charge.payment_intent : null;
          if (!paymentIntentId) {
            console.error('[Stripe] charge.refunded missing payment_intent');
            break;
          }

          const user = await tx.user.findFirst({
            where: { stripePaymentIntentId: paymentIntentId },
          });
          if (!user) {
            console.error(`[Stripe] charge.refunded: no user with stripePaymentIntentId=${paymentIntentId}`);
            break;
          }

          await tx.user.update({
            where: { id: user.id },
            data: {
              plan: 'free',
              planExpiresAt: null,
            },
          });
          console.log(`[Stripe] User ${user.id} plan reverted to free (refund)`);
          break;
        }

        default:
          console.log(`[Stripe] Unhandled webhook event: ${event.type}`);
      }
    });

    res.json({ ok: true });
  } catch (err) {
    console.error(`[Stripe] Webhook processing error (${event.type}):`, err);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});
