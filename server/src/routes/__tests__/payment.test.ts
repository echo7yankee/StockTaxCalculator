import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import express from 'express';
import type { RequestHandler } from 'express';
import { Server } from 'http';
import type { User as PrismaUser } from '@prisma/client';
import prisma from '../../lib/prisma.js';

// The checkout route exercises the real createStripeCheckoutSession service; only the
// underlying stripe.checkout.sessions.create call is stubbed. The webhook route's
// stripe.webhooks.constructEvent is stubbed so event parsing and signature acceptance
// are controllable without real HMAC. Same module-mock shape as services/__tests__/stripe.test.ts.
const mockSessionsCreate = vi.fn();
const mockConstructEvent = vi.fn();
vi.mock('stripe', () => ({
  default: vi.fn().mockImplementation(() => ({
    checkout: { sessions: { create: mockSessionsCreate } },
    webhooks: { constructEvent: mockConstructEvent },
  })),
}));

vi.mock('@sentry/node', () => ({ captureException: vi.fn() }));

// The webhook fires the payment-confirmation and admin-notification emails fire-and-forget.
// Mocking them keeps the suite off Resend and lets the sends be asserted.
const mockSendPaymentConfirmationEmail = vi.fn().mockResolvedValue(undefined);
const mockSendNewCustomerNotification = vi.fn().mockResolvedValue(undefined);
vi.mock('../../services/email.js', () => ({
  sendPaymentConfirmationEmail: mockSendPaymentConfirmationEmail,
  sendNewCustomerNotification: mockSendNewCustomerNotification,
}));

const { paymentRouter } = await import('../payment.js');
const { stripeWebhookRouter } = await import('../webhook.stripe.js');

let server: Server;
// Listen on an OS-assigned free port so this file can never collide with another
// server test file's hardcoded port. BASE is filled in once the server is listening.
let BASE = '';

// Stubbed auth boundary for the payment routes. payment.ts consults only
// req.isAuthenticated() and req.user; the real passport login round-trip is
// already covered by routes/__tests__/auth.test.ts.
let testUser: PrismaUser | null = null;
const stubAuth: RequestHandler = (req, _res, next) => {
  req.isAuthenticated = (() => testUser !== null) as typeof req.isAuthenticated;
  req.user = testUser ?? undefined;
  next();
};

const ORIGINAL_ENV = { ...process.env };

// Test fixtures share these prefixes so cleanup deletes them in one query each
// without touching other test files' rows. Webhook events are stored namespaced
// as `stripe_<event.id>`.
const USER_PREFIX = 'paytest-';
const EVENT_PREFIX = 'evt_paytest_';

async function cleanup() {
  await prisma.webhookEvent.deleteMany({ where: { id: { startsWith: `stripe_${EVENT_PREFIX}` } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: USER_PREFIX } } });
  await prisma.promoCounter.deleteMany({ where: { id: 'launch_2026' } });
}

beforeAll(async () => {
  const app = express();
  // Mirror index.ts: the webhook needs the raw request body for signature verification.
  app.use('/api/webhooks/stripe', express.raw({ type: 'application/json' }), stripeWebhookRouter);
  app.use('/api/payment', stubAuth, paymentRouter);
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  const address = server.address();
  if (address === null || typeof address === 'string' || address.port === 0) {
    throw new Error('Expected a TCP address with non-zero port from app.listen(0)');
  }
  BASE = `http://localhost:${address.port}`;
});

afterAll(async () => {
  await cleanup();
  server?.close();
});

beforeEach(async () => {
  process.env.STRIPE_SECRET_KEY = 'sk_test_paytest';
  process.env.STRIPE_PRICE_ID = 'price_test_paytest';
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_paytest';
  process.env.STRIPE_LAUNCH_COUPON_ID = 'coupon_test_paytest';
  process.env.CLIENT_URL = 'https://investax.app';
  mockSessionsCreate.mockReset();
  mockConstructEvent.mockReset();
  mockSendPaymentConfirmationEmail.mockClear();
  mockSendNewCustomerNotification.mockClear();
  testUser = null;
  await cleanup();
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

let seq = 0;

interface SeedOpts {
  plan?: string;
  planExpiresAt?: Date | null;
  planPurchasedAt?: Date | null;
  launchPriceUsed?: boolean;
  stripePaymentIntentId?: string | null;
  stripeCustomerId?: string | null;
}

async function seedUser(opts: SeedOpts = {}) {
  seq += 1;
  return prisma.user.create({
    data: {
      email: `${USER_PREFIX}${seq}@test.invalid`,
      name: 'Pay Test',
      plan: opts.plan ?? 'free',
      planExpiresAt: opts.planExpiresAt ?? null,
      planPurchasedAt: opts.planPurchasedAt ?? null,
      launchPriceUsed: opts.launchPriceUsed ?? false,
      stripePaymentIntentId: opts.stripePaymentIntentId ?? null,
      stripeCustomerId: opts.stripeCustomerId ?? null,
    },
  });
}

function daysFromNow(days: number) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

async function setPromoCounter(count: number, limit = 100) {
  return prisma.promoCounter.upsert({
    where: { id: 'launch_2026' },
    create: { id: 'launch_2026', count, limit },
    update: { count, limit },
  });
}

function getJson(path: string) {
  return fetch(`${BASE}${path}`);
}

interface CheckoutOpts {
  id: string;
  userId?: string | null;
  metadataUserId?: string;
  discountCode?: string;
  amountDiscount?: number;
  amountTotal?: number;
  currency?: string;
  locale?: string;
  customer?: string | null;
  paymentIntent?: string | null;
}

function checkoutCompletedEvent(opts: CheckoutOpts) {
  return {
    id: opts.id,
    object: 'event',
    type: 'checkout.session.completed',
    data: {
      object: {
        id: `cs_${opts.id}`,
        object: 'checkout.session',
        client_reference_id: opts.userId ?? null,
        customer: opts.customer === undefined ? `cus_${opts.id}` : opts.customer,
        payment_intent: opts.paymentIntent === undefined ? `pi_${opts.id}` : opts.paymentIntent,
        amount_total: opts.amountTotal ?? 1200,
        currency: opts.currency ?? 'eur',
        locale: opts.locale ?? 'ro',
        metadata: {
          user_id: opts.metadataUserId ?? '',
          discount_code: opts.discountCode ?? '',
        },
        total_details: { amount_discount: opts.amountDiscount ?? 0 },
      },
    },
  };
}

function chargeRefundedEvent(opts: { id: string; paymentIntent: string | null }) {
  return {
    id: opts.id,
    object: 'event',
    type: 'charge.refunded',
    data: {
      object: { id: `ch_${opts.id}`, object: 'charge', payment_intent: opts.paymentIntent },
    },
  };
}

function postWebhook(event: unknown) {
  return fetch(`${BASE}/api/webhooks/stripe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'stripe-signature': 'test-signature' },
    body: JSON.stringify(event),
  });
}

describe('GET /api/payment/promo-status', () => {
  it('creates the launch_2026 counter on first read and reports full remaining spots', async () => {
    expect(await prisma.promoCounter.findUnique({ where: { id: 'launch_2026' } })).toBeNull();

    const res = await getJson('/api/payment/promo-status');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ count: 0, limit: 100, remaining: 100 });

    expect(await prisma.promoCounter.findUnique({ where: { id: 'launch_2026' } })).not.toBeNull();
  });

  it('reports the live count and computed remaining for an existing counter', async () => {
    await setPromoCounter(37);
    const res = await getJson('/api/payment/promo-status');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ count: 37, limit: 100, remaining: 63 });
  });
});

describe('GET /api/payment/checkout', () => {
  it('returns 401 when the request is not authenticated', async () => {
    testUser = null;
    const res = await getJson('/api/payment/checkout');
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe('Authentication required');
  });

  it('returns 400 when the user already holds an active paid plan', async () => {
    testUser = await seedUser({ plan: 'paid', planExpiresAt: daysFromNow(200) });
    const res = await getJson('/api/payment/checkout');
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/already have an active paid plan/i);
  });

  it('returns 503 when Stripe is not configured', async () => {
    testUser = await seedUser();
    delete process.env.STRIPE_PRICE_ID;
    const res = await getJson('/api/payment/checkout');
    expect(res.status).toBe(503);
    expect((await res.json()).error).toMatch(/not configured/i);
  });

  it('returns a checkout URL and applies no coupon when no promo spots exist', async () => {
    testUser = await seedUser();
    // No launch_2026 row, so the route leaves applyLaunchCoupon false.
    mockSessionsCreate.mockResolvedValue({ url: 'https://checkout.stripe.com/c/pay/cs_nopromo' });

    const res = await getJson('/api/payment/checkout');
    expect(res.status).toBe(200);
    expect((await res.json()).checkoutUrl).toBe('https://checkout.stripe.com/c/pay/cs_nopromo');

    const params = mockSessionsCreate.mock.calls[0][0];
    expect(params.discounts).toBeUndefined();
    expect(params.metadata.discount_code).toBe('');
    expect(params.client_reference_id).toBe(testUser.id);
  });

  it('pre-applies the launch coupon when promo spots remain', async () => {
    testUser = await seedUser();
    await setPromoCounter(0);
    mockSessionsCreate.mockResolvedValue({ url: 'https://checkout.stripe.com/c/pay/cs_promo' });

    const res = await getJson('/api/payment/checkout');
    expect(res.status).toBe(200);

    const params = mockSessionsCreate.mock.calls[0][0];
    expect(params.discounts).toEqual([{ coupon: 'coupon_test_paytest' }]);
    expect(params.metadata.discount_code).toBe('LAUNCH2026');
  });

  it('returns 502 when Stripe checkout creation fails', async () => {
    testUser = await seedUser();
    mockSessionsCreate.mockRejectedValue(
      Object.assign(new Error('No such price'), {
        code: 'resource_missing',
        type: 'StripeInvalidRequestError',
      }),
    );
    const res = await getJson('/api/payment/checkout');
    expect(res.status).toBe(502);
    expect((await res.json()).error).toMatch(/temporarily unavailable/i);
  });

  it('allows checkout for a user whose paid plan has already expired', async () => {
    testUser = await seedUser({ plan: 'paid', planExpiresAt: daysFromNow(-5) });
    mockSessionsCreate.mockResolvedValue({ url: 'https://checkout.stripe.com/c/pay/cs_renew' });
    const res = await getJson('/api/payment/checkout');
    expect(res.status).toBe(200);
    expect((await res.json()).checkoutUrl).toBe('https://checkout.stripe.com/c/pay/cs_renew');
  });
});

describe('GET /api/payment/status', () => {
  it('returns 401 when the request is not authenticated', async () => {
    testUser = null;
    const res = await getJson('/api/payment/status');
    expect(res.status).toBe(401);
  });

  it('reports an inactive free plan', async () => {
    testUser = await seedUser({ plan: 'free' });
    const res = await getJson('/api/payment/status');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.plan).toBe('free');
    expect(body.isActive).toBe(false);
  });

  it('reports an active paid plan with a future expiry', async () => {
    testUser = await seedUser({
      plan: 'paid',
      planExpiresAt: daysFromNow(300),
      planPurchasedAt: daysFromNow(-65),
      launchPriceUsed: true,
    });
    const res = await getJson('/api/payment/status');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.plan).toBe('paid');
    expect(body.isActive).toBe(true);
    expect(body.launchPriceUsed).toBe(true);
  });

  it('reports an inactive paid plan once the expiry has passed', async () => {
    testUser = await seedUser({ plan: 'paid', planExpiresAt: daysFromNow(-1) });
    const res = await getJson('/api/payment/status');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.plan).toBe('paid');
    expect(body.isActive).toBe(false);
  });
});

describe('POST /api/webhooks/stripe', () => {
  it('returns 500 when STRIPE_WEBHOOK_SECRET is not configured', async () => {
    delete process.env.STRIPE_WEBHOOK_SECRET;
    const res = await postWebhook(checkoutCompletedEvent({ id: `${EVENT_PREFIX}nosecret` }));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toMatch(/not configured/i);
  });

  it('returns 401 when the signature fails verification', async () => {
    mockConstructEvent.mockImplementation(() => {
      throw new Error('No signatures found matching the expected signature');
    });
    const res = await postWebhook({ id: `${EVENT_PREFIX}badsig` });
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe('Invalid signature');
  });

  it('upgrades the user to the paid plan on checkout.session.completed', async () => {
    const user = await seedUser({ plan: 'free' });
    const event = checkoutCompletedEvent({
      id: `${EVENT_PREFIX}upgrade`,
      userId: user.id,
      customer: 'cus_upgrade_1',
      paymentIntent: 'pi_upgrade_1',
    });
    mockConstructEvent.mockReturnValue(event);

    const res = await postWebhook(event);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });

    const updated = await prisma.user.findUnique({ where: { id: user.id } });
    expect(updated?.plan).toBe('paid');
    expect(updated?.planPurchasedAt).not.toBeNull();
    expect(updated?.stripeCustomerId).toBe('cus_upgrade_1');
    expect(updated?.stripePaymentIntentId).toBe('pi_upgrade_1');
    // The expiry is set one year out.
    const expiry = updated?.planExpiresAt?.getTime() ?? 0;
    expect(expiry).toBeGreaterThan(daysFromNow(360).getTime());
    expect(expiry).toBeLessThan(daysFromNow(370).getTime());
  });

  it('marks the launch price used and increments the promo counter when a discount applied', async () => {
    const user = await seedUser({ plan: 'free', launchPriceUsed: false });
    await setPromoCounter(8);
    const event = checkoutCompletedEvent({
      id: `${EVENT_PREFIX}launch`,
      userId: user.id,
      discountCode: 'LAUNCH2026',
      amountDiscount: 700,
    });
    mockConstructEvent.mockReturnValue(event);

    const res = await postWebhook(event);
    expect(res.status).toBe(200);

    const updated = await prisma.user.findUnique({ where: { id: user.id } });
    expect(updated?.launchPriceUsed).toBe(true);
    const counter = await prisma.promoCounter.findUnique({ where: { id: 'launch_2026' } });
    expect(counter?.count).toBe(9);
  });

  it('does not re-increment the promo counter when the user already used the launch price', async () => {
    const user = await seedUser({ plan: 'free', launchPriceUsed: true });
    await setPromoCounter(20);
    const event = checkoutCompletedEvent({
      id: `${EVENT_PREFIX}nolaunchagain`,
      userId: user.id,
      discountCode: 'LAUNCH2026',
    });
    mockConstructEvent.mockReturnValue(event);

    const res = await postWebhook(event);
    expect(res.status).toBe(200);

    const counter = await prisma.promoCounter.findUnique({ where: { id: 'launch_2026' } });
    expect(counter?.count).toBe(20);
    const updated = await prisma.user.findUnique({ where: { id: user.id } });
    expect(updated?.plan).toBe('paid');
  });

  it('sends the confirmation email and the admin notification on a successful upgrade', async () => {
    const user = await seedUser({ plan: 'free' });
    const event = checkoutCompletedEvent({ id: `${EVENT_PREFIX}emails`, userId: user.id });
    mockConstructEvent.mockReturnValue(event);

    const res = await postWebhook(event);
    expect(res.status).toBe(200);

    expect(mockSendPaymentConfirmationEmail).toHaveBeenCalledTimes(1);
    expect(mockSendPaymentConfirmationEmail.mock.calls[0][0]).toEqual(
      expect.objectContaining({ to: user.email, orderId: event.data.object.id }),
    );
    expect(mockSendNewCustomerNotification).toHaveBeenCalledTimes(1);
    expect(mockSendNewCustomerNotification.mock.calls[0][0]).toEqual(
      expect.objectContaining({ customerEmail: user.email }),
    );
  });

  it('acknowledges a duplicate event without reprocessing it', async () => {
    const user = await seedUser({ plan: 'free', launchPriceUsed: false });
    await setPromoCounter(0);
    const event = checkoutCompletedEvent({
      id: `${EVENT_PREFIX}dup`,
      userId: user.id,
      discountCode: 'LAUNCH2026',
    });
    mockConstructEvent.mockReturnValue(event);

    const first = await postWebhook(event);
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ ok: true });

    const second = await postWebhook(event);
    expect(second.status).toBe(200);
    expect((await second.json()).message).toMatch(/already processed/i);

    // The counter advanced exactly once despite two deliveries.
    const counter = await prisma.promoCounter.findUnique({ where: { id: 'launch_2026' } });
    expect(counter?.count).toBe(1);
    const events = await prisma.webhookEvent.findMany({
      where: { id: `stripe_${EVENT_PREFIX}dup` },
    });
    expect(events).toHaveLength(1);
  });

  it('acknowledges a checkout event with no user reference without upgrading anyone', async () => {
    const event = checkoutCompletedEvent({ id: `${EVENT_PREFIX}nouser`, userId: null });
    mockConstructEvent.mockReturnValue(event);

    const res = await postWebhook(event);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    // The idempotency row is still written so Stripe stops retrying.
    expect(
      await prisma.webhookEvent.findUnique({ where: { id: `stripe_${EVENT_PREFIX}nouser` } }),
    ).not.toBeNull();
  });

  it('acknowledges a checkout event for a non-existent user without erroring', async () => {
    const event = checkoutCompletedEvent({
      id: `${EVENT_PREFIX}ghost`,
      userId: 'user-that-does-not-exist',
    });
    mockConstructEvent.mockReturnValue(event);

    const res = await postWebhook(event);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('reverts the user to the free plan on charge.refunded', async () => {
    const user = await seedUser({
      plan: 'paid',
      planExpiresAt: daysFromNow(300),
      stripePaymentIntentId: 'pi_refund_target',
    });
    const event = chargeRefundedEvent({
      id: `${EVENT_PREFIX}refund`,
      paymentIntent: 'pi_refund_target',
    });
    mockConstructEvent.mockReturnValue(event);

    const res = await postWebhook(event);
    expect(res.status).toBe(200);

    const updated = await prisma.user.findUnique({ where: { id: user.id } });
    expect(updated?.plan).toBe('free');
    expect(updated?.planExpiresAt).toBeNull();
  });

  it('acknowledges a refund for an unknown payment intent without erroring', async () => {
    const event = chargeRefundedEvent({
      id: `${EVENT_PREFIX}refundghost`,
      paymentIntent: 'pi_never_seen',
    });
    mockConstructEvent.mockReturnValue(event);

    const res = await postWebhook(event);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('acknowledges an unhandled event type with 200', async () => {
    const event = {
      id: `${EVENT_PREFIX}unhandled`,
      object: 'event',
      type: 'payment_intent.created',
      data: { object: { id: 'pi_unhandled' } },
    };
    mockConstructEvent.mockReturnValue(event);

    const res = await postWebhook(event);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('returns 500 and rolls back the idempotency row when processing throws', async () => {
    // A launch-price checkout with no launch_2026 counter row makes the
    // promoCounter.update inside the transaction throw. The WebhookEvent insert
    // must roll back with it so Stripe can retry the delivery.
    const user = await seedUser({ plan: 'free', launchPriceUsed: false });
    expect(await prisma.promoCounter.findUnique({ where: { id: 'launch_2026' } })).toBeNull();

    const event = checkoutCompletedEvent({
      id: `${EVENT_PREFIX}rollback`,
      userId: user.id,
      discountCode: 'LAUNCH2026',
    });
    mockConstructEvent.mockReturnValue(event);

    const res = await postWebhook(event);
    expect(res.status).toBe(500);

    // The idempotency row rolled back, so a retry will reprocess.
    expect(
      await prisma.webhookEvent.findUnique({ where: { id: `stripe_${EVENT_PREFIX}rollback` } }),
    ).toBeNull();
    // The user upgrade rolled back too.
    const updated = await prisma.user.findUnique({ where: { id: user.id } });
    expect(updated?.plan).toBe('free');
  });
});
