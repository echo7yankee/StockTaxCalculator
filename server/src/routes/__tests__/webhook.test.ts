import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import { Server } from 'http';
import crypto from 'crypto';
import prisma from '../../lib/prisma.js';
import { webhookRouter } from '../webhook.js';

// Tests for the LS webhook idempotency-row placement fix.
//
// Background: prior to this PR, the WebhookEvent idempotency row was written
// BEFORE the business-logic try/catch. If business logic threw, the row
// remained committed. Lemon Squeezy's retry would then find it via the
// fast-path findUnique check and return "Already processed" — leaving the
// user's plan permanently unupgraded despite the original failure.
//
// Fix: wrap the WebhookEvent insert + business logic in a single
// `prisma.$transaction(...)`. If anything throws, the row rolls back and
// retries can succeed.
//
// The Stripe webhook handler (server/src/routes/webhook.stripe.ts) received
// the identical structural fix. It is exercised by the existing Playwright
// E2E suite (e2e/payment-flow-stripe.spec.ts) and was verified end-to-end
// by Phase 1 real-money test in session #19 (€12 charge + refund both fired
// correctly with the new transactional code path live in production).
//
// These unit tests directly verify the LS contract; the same contract holds
// for Stripe by code-pattern symmetry.

const TEST_SECRET = 'test-ls-webhook-secret-not-real';
const TEST_USER_ID = 'test-user-webhook-ls-00000';
const TEST_USER_EMAIL = 'test-webhook-ls@test.com';

const PORT = 3097;
const BASE = `http://localhost:${PORT}`;
let server: Server;

function makeOrderCreatedPayload(eventId: string, userId = TEST_USER_ID): string {
  return JSON.stringify({
    meta: {
      event_name: 'order_created',
      webhook_id: eventId,
      custom_data: { user_id: userId, discount_code: 'LAUNCH2026' },
    },
    data: {
      id: `order-${eventId}`,
      attributes: { customer_id: `cust-${eventId}`, discount_total_formatted: '-€7' },
    },
  });
}

function sign(body: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

beforeAll(async () => {
  process.env.LEMON_SQUEEZY_WEBHOOK_SECRET = TEST_SECRET;

  // Ensure test user + PromoCounter row exist
  await prisma.user.upsert({
    where: { email: TEST_USER_EMAIL },
    update: { plan: 'free', launchPriceUsed: false, planExpiresAt: null, lemonOrderId: null },
    create: { id: TEST_USER_ID, email: TEST_USER_EMAIL, name: 'Test User Webhook', plan: 'free' },
  });
  await prisma.promoCounter.upsert({
    where: { id: 'launch_2026' },
    update: {},
    create: { id: 'launch_2026', count: 0, limit: 100 },
  });

  const app = express();
  app.use('/api/webhooks/lemon', express.raw({ type: 'application/json' }), webhookRouter);
  server = app.listen(PORT);
});

afterAll(async () => {
  // Clean up: webhook events created during tests + reset user
  await prisma.webhookEvent.deleteMany({
    where: { id: { startsWith: 'webhook-test-' } },
  });
  await prisma.user.update({
    where: { id: TEST_USER_ID },
    data: { plan: 'free', launchPriceUsed: false, planExpiresAt: null, planPurchasedAt: null, lemonOrderId: null, lemonCustomerId: null },
  });
  await prisma.user.deleteMany({ where: { id: TEST_USER_ID } });
  server?.close();
});

describe('LS webhook (POST /api/webhooks/lemon) — idempotency-row transaction safety', () => {
  it('happy path: signed valid webhook upgrades user and writes WebhookEvent row', async () => {
    const eventId = `webhook-test-happy-${Date.now()}`;
    const payload = makeOrderCreatedPayload(eventId);
    const signature = sign(payload, TEST_SECRET);

    const res = await fetch(`${BASE}/api/webhooks/lemon`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-signature': signature },
      body: payload,
    });
    expect(res.status).toBe(200);

    const row = await prisma.webhookEvent.findUnique({ where: { id: eventId } });
    expect(row).not.toBeNull();
    expect(row?.eventName).toBe('order_created');

    const user = await prisma.user.findUnique({ where: { id: TEST_USER_ID } });
    expect(user?.plan).toBe('paid');
    expect(user?.launchPriceUsed).toBe(true);

    // Reset user for next test
    await prisma.user.update({
      where: { id: TEST_USER_ID },
      data: { plan: 'free', launchPriceUsed: false, planExpiresAt: null, lemonOrderId: null },
    });
    await prisma.promoCounter.update({ where: { id: 'launch_2026' }, data: { count: 0 } });
  });

  it('idempotency: same eventId twice returns "Already processed", does not double-write', async () => {
    const eventId = `webhook-test-idem-${Date.now()}`;
    const payload = makeOrderCreatedPayload(eventId);
    const signature = sign(payload, TEST_SECRET);

    const first = await fetch(`${BASE}/api/webhooks/lemon`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-signature': signature },
      body: payload,
    });
    expect(first.status).toBe(200);

    const second = await fetch(`${BASE}/api/webhooks/lemon`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-signature': signature },
      body: payload,
    });
    expect(second.status).toBe(200);
    const secondBody = await second.json();
    expect(secondBody.message).toBe('Already processed');

    const rows = await prisma.webhookEvent.findMany({ where: { id: eventId } });
    expect(rows).toHaveLength(1);

    // Reset for next test
    await prisma.user.update({
      where: { id: TEST_USER_ID },
      data: { plan: 'free', launchPriceUsed: false, planExpiresAt: null, lemonOrderId: null },
    });
    await prisma.promoCounter.update({ where: { id: 'launch_2026' }, data: { count: 0 } });
  });

  // For the failure-mode + retry tests we inject a REAL failure (delete the
  // PromoCounter row so the launch-price branch's tx.promoCounter.update
  // throws inside the transaction). This exercises the actual catch + rollback
  // path rather than mocking $transaction itself — vi.spyOn doesn't restore
  // PrismaClient's Proxy methods cleanly, so monkey-patching causes follow-on
  // tests to see "$transaction is not a function".

  it('failure mode: when business logic throws inside the transaction, NO WebhookEvent row is written', async () => {
    const eventId = `webhook-test-fail-${Date.now()}`;
    const payload = makeOrderCreatedPayload(eventId);
    const signature = sign(payload, TEST_SECRET);

    // Delete the launch counter to force tx.promoCounter.update to throw
    // (P2025: record to update not found) inside the transaction's launch-price
    // branch. The handler's outer catch returns 500 and the transaction rolls
    // back, including the WebhookEvent row.
    await prisma.promoCounter.delete({ where: { id: 'launch_2026' } });
    try {
      const res = await fetch(`${BASE}/api/webhooks/lemon`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-signature': signature },
        body: payload,
      });
      expect(res.status).toBe(500);

      // CORE assertion: no WebhookEvent row exists. Before the fix the row
      // was written before the try/catch and would have stayed committed,
      // permanently masking the failure from retry deliveries.
      const row = await prisma.webhookEvent.findUnique({ where: { id: eventId } });
      expect(row).toBeNull();

      // User must NOT have been upgraded — transaction rolled back fully.
      const user = await prisma.user.findUnique({ where: { id: TEST_USER_ID } });
      expect(user?.plan).toBe('free');
    } finally {
      // Restore the PromoCounter so subsequent tests aren't broken
      await prisma.promoCounter.upsert({
        where: { id: 'launch_2026' },
        update: { count: 0 },
        create: { id: 'launch_2026', count: 0, limit: 100 },
      });
    }
  });

  it('retry succeeds after transient failure: same eventId reprocessed cleanly (proves rollback enables recovery)', async () => {
    const eventId = `webhook-test-retry-${Date.now()}`;
    const payload = makeOrderCreatedPayload(eventId);
    const signature = sign(payload, TEST_SECRET);

    // First delivery: real failure via missing PromoCounter
    await prisma.promoCounter.delete({ where: { id: 'launch_2026' } });
    const first = await fetch(`${BASE}/api/webhooks/lemon`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-signature': signature },
      body: payload,
    });
    expect(first.status).toBe(500);
    expect(await prisma.webhookEvent.findUnique({ where: { id: eventId } })).toBeNull();

    // Restore the PromoCounter (simulating "transient failure resolved")
    await prisma.promoCounter.create({
      data: { id: 'launch_2026', count: 0, limit: 100 },
    });

    // Second delivery (the "retry"): real transaction runs and succeeds
    const second = await fetch(`${BASE}/api/webhooks/lemon`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-signature': signature },
      body: payload,
    });
    expect(second.status).toBe(200);

    // Row exists AND user upgraded — proving the retry path is actually clean
    const row = await prisma.webhookEvent.findUnique({ where: { id: eventId } });
    expect(row).not.toBeNull();
    const user = await prisma.user.findUnique({ where: { id: TEST_USER_ID } });
    expect(user?.plan).toBe('paid');

    // Reset state for any subsequent tests in this file
    await prisma.user.update({
      where: { id: TEST_USER_ID },
      data: { plan: 'free', launchPriceUsed: false, planExpiresAt: null, lemonOrderId: null },
    });
    await prisma.promoCounter.update({ where: { id: 'launch_2026' }, data: { count: 0 } });
  });
});
