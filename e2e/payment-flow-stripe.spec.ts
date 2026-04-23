import { test, expect, type Page } from '@playwright/test';
import { createHmac } from 'crypto';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
// Mirrors payment-flow.spec.ts but for the Stripe parallel track.
// Skip behaviour matches LS: when STRIPE_WEBHOOK_SECRET is not in server/.env
// the paid-user + signature-valid + idempotency suites skip rather than fail.

function getStripeWebhookSecret(): string | null {
  try {
    const envPath = resolve(__dirname, '..', 'server', '.env');
    const content = readFileSync(envPath, 'utf-8');
    const match = content.match(/^STRIPE_WEBHOOK_SECRET=(.+)$/m);
    return match?.[1]?.trim() || null;
  } catch {
    return null;
  }
}

/** Build a Stripe-format signature header: `t=<unix>,v1=<hmac>`. */
function signStripePayload(body: string, secret: string): string {
  const timestamp = Math.floor(Date.now() / 1000);
  const signedPayload = `${timestamp}.${body}`;
  const sig = createHmac('sha256', secret).update(signedPayload, 'utf8').digest('hex');
  return `t=${timestamp},v1=${sig}`;
}

const WEBHOOK_SECRET = getStripeWebhookSecret();
const uid = Date.now();
const PASSWORD = 'TestPass123!';

async function login(page: Page, email: string) {
  await page.goto('/login');
  await page.getByPlaceholder('you@example.com').fill(email);
  await page.getByPlaceholder('Enter your password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL(/dashboard|pricing/, { timeout: 10_000 });
}

// ---------------------------------------------------------------------------
// 1. Paid user access via simulated Stripe webhook
// ---------------------------------------------------------------------------

(WEBHOOK_SECRET ? test.describe : test.describe.skip)(
  'Payment Flow (Stripe) — Paid User Access',
  () => {
    const email = `e2e-stripe-paid-${uid}@example.com`;
    let userId: string;

    test.beforeAll(async ({ request }) => {
      const signupRes = await request.post('/api/auth/signup', {
        data: { email, password: PASSWORD, name: 'Stripe Paid User' },
      });
      const signupBody = await signupRes.json();
      userId = signupBody.user?.id;
      expect(userId).toBeTruthy();

      // Simulate checkout.session.completed webhook
      const eventId = `evt_stripe_paid_${uid}`;
      const payload = JSON.stringify({
        id: eventId,
        object: 'event',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: `cs_test_${uid}`,
            object: 'checkout.session',
            client_reference_id: userId,
            customer: `cus_test_${uid}`,
            payment_intent: `pi_test_${uid}`,
            metadata: { user_id: userId, discount_code: 'LAUNCH2026' },
            total_details: { amount_discount: 700 },
          },
        },
      });
      const sig = signStripePayload(payload, WEBHOOK_SECRET!);

      const whRes = await request.post('/api/webhooks/stripe', {
        headers: { 'Content-Type': 'application/json', 'stripe-signature': sig },
        data: payload,
      });
      expect(whRes.status()).toBe(200);
    });

    test('paid user (via Stripe webhook) can access /upload without redirect', async ({ page }) => {
      await login(page, email);
      await page.goto('/upload');
      await expect(page).toHaveURL(/upload/);
      await expect(page.locator('h1')).toBeVisible();
    });

    test('paid user (via Stripe webhook) can access /dashboard without redirect', async ({ page }) => {
      await login(page, email);
      await page.goto('/dashboard');
      await expect(page).toHaveURL(/dashboard/);
    });

    test('payment status API returns paid plan after Stripe webhook', async ({ page }) => {
      await login(page, email);
      const res = await page.request.get('/api/payment/status');
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.plan).toBe('paid');
      expect(body.isActive).toBe(true);
      expect(body.planExpiresAt).toBeTruthy();
    });

    test('uploads API returns 200 for Stripe-paid user', async ({ page }) => {
      await login(page, email);
      const res = await page.request.get('/api/uploads');
      expect(res.status()).toBe(200);
    });

    test('tax-years API returns 200 for Stripe-paid user', async ({ page }) => {
      await login(page, email);
      const res = await page.request.get('/api/tax-years');
      expect(res.status()).toBe(200);
    });
  },
);

// ---------------------------------------------------------------------------
// 2. Stripe webhook security
// ---------------------------------------------------------------------------

test.describe('Payment Flow (Stripe) — Webhook Security', () => {
  test('stripe webhook rejects missing signature', async ({ request }) => {
    const res = await request.post('/api/webhooks/stripe', {
      headers: { 'Content-Type': 'application/json' },
      data: JSON.stringify({
        id: `evt_no_sig_${uid}`,
        type: 'checkout.session.completed',
        data: { object: {} },
      }),
    });
    expect([401, 500]).toContain(res.status());
  });

  test('stripe webhook rejects invalid signature', async ({ request }) => {
    const res = await request.post('/api/webhooks/stripe', {
      headers: {
        'Content-Type': 'application/json',
        'stripe-signature': 't=1700000000,v1=deadbeef',
      },
      data: JSON.stringify({
        id: `evt_bad_sig_${uid}`,
        type: 'checkout.session.completed',
        data: { object: {} },
      }),
    });
    expect([401, 500]).toContain(res.status());
  });

  (WEBHOOK_SECRET ? test : test.skip)(
    'stripe webhook accepts valid signature',
    async ({ request }) => {
      const payload = JSON.stringify({
        id: `evt_valid_sig_${uid}`,
        object: 'event',
        type: 'payment_intent.created', // unhandled but signed → 200
        data: { object: { id: `pi_test_${uid}` } },
      });
      const sig = signStripePayload(payload, WEBHOOK_SECRET!);
      const res = await request.post('/api/webhooks/stripe', {
        headers: { 'Content-Type': 'application/json', 'stripe-signature': sig },
        data: payload,
      });
      expect(res.status()).toBe(200);
    },
  );

  (WEBHOOK_SECRET ? test : test.skip)(
    'stripe webhook handles duplicate events idempotently',
    async ({ request }) => {
      const eventId = `evt_idem_stripe_${uid}`;
      const payload = JSON.stringify({
        id: eventId,
        object: 'event',
        type: 'payment_intent.created',
        data: { object: { id: `pi_idem_${uid}` } },
      });
      const sig = signStripePayload(payload, WEBHOOK_SECRET!);
      const headers = { 'Content-Type': 'application/json', 'stripe-signature': sig };

      const res1 = await request.post('/api/webhooks/stripe', { headers, data: payload });
      expect(res1.status()).toBe(200);

      // NOTE: Stripe signatures embed a timestamp, so sending the exact same payload+sig twice
      // still hits the same eventId (our namespaced WebhookEvent row), so idempotency short-circuits.
      const res2 = await request.post('/api/webhooks/stripe', { headers, data: payload });
      expect(res2.status()).toBe(200);
      const body2 = await res2.json();
      expect(body2.message).toContain('Already processed');
    },
  );
});
