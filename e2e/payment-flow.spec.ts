import { test, expect, type Page } from '@playwright/test';
import { createHmac } from 'crypto';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Read webhook secret from server/.env so we can simulate signed webhooks. */
function getWebhookSecret(): string | null {
  try {
    const envPath = resolve(__dirname, '..', 'server', '.env');
    const content = readFileSync(envPath, 'utf-8');
    const match = content.match(/^LEMON_SQUEEZY_WEBHOOK_SECRET=(.+)$/m);
    return match?.[1]?.trim() || null;
  } catch {
    return null;
  }
}

function signPayload(body: string, secret: string): string {
  return createHmac('sha256', secret).update(body).digest('hex');
}

const WEBHOOK_SECRET = getWebhookSecret();
const uid = Date.now();
const PASSWORD = 'TestPass123!';

/** Log in via the UI and wait for redirect. */
async function login(page: Page, email: string) {
  await page.goto('/login');
  await page.getByPlaceholder('you@example.com').fill(email);
  await page.getByPlaceholder('Enter your password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL(/dashboard|pricing/, { timeout: 10_000 });
}

// ---------------------------------------------------------------------------
// 1. Authenticated FREE user — paywall enforcement
// ---------------------------------------------------------------------------

test.describe('Payment Flow — Free User Paywall', () => {
  const email = `e2e-payflow-free-${uid}@example.com`;

  test.beforeAll(async ({ request }) => {
    await request.post('/api/auth/signup', {
      data: { email, password: PASSWORD, name: 'Free User' },
    });
  });

  test('free user is redirected from /upload to /pricing', async ({ page }) => {
    await login(page, email);
    await page.goto('/upload');
    await expect(page).toHaveURL(/pricing/);
  });

  test('free user is redirected from /dashboard to /pricing', async ({ page }) => {
    await login(page, email);
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/pricing/);
  });

  test('pricing page shows buy button (not log-in variant) for authenticated free user', async ({ page }) => {
    await login(page, email);
    await page.goto('/pricing');
    // Authenticated → button text should be "Get full access" / "Obține acces complet"
    const buyBtn = page.getByRole('button', { name: /full access|acces complet/i });
    await expect(buyBtn).toBeVisible();
    // Should NOT show the "Log in to purchase" variant
    await expect(page.getByRole('button', { name: /log in to purchase|autentifică-te/i })).not.toBeVisible();
  });

  test('checkout button calls /api/payment/checkout', async ({ page }) => {
    await login(page, email);
    await page.goto('/pricing');

    // Mock the checkout endpoint so we don't hit LS and don't navigate away
    let checkoutCalled = false;
    await page.route('**/api/payment/checkout', async (route) => {
      checkoutCalled = true;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ checkoutUrl: 'https://example.com/mock-checkout' }),
      });
    });
    // Prevent the external redirect
    await page.route('https://example.com/**', (route) => route.abort());

    await page.getByRole('button', { name: /full access|acces complet/i }).click();
    // Give time for the async fetch + redirect attempt
    await page.waitForTimeout(1500);
    expect(checkoutCalled).toBe(true);
  });

  test('payment status API returns free plan for free user', async ({ page }) => {
    await login(page, email);
    const res = await page.request.get('/api/payment/status');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.plan).toBe('free');
    expect(body.isActive).toBe(false);
  });

  test('uploads API returns 403 for authenticated free user', async ({ page }) => {
    await login(page, email);
    const res = await page.request.get('/api/uploads');
    expect(res.status()).toBe(403);
    const body = await res.json();
    expect(body.code).toBe('PLAN_REQUIRED');
  });

  test('tax-years API returns 403 for authenticated free user', async ({ page }) => {
    await login(page, email);
    const res = await page.request.get('/api/tax-years');
    expect(res.status()).toBe(403);
    const body = await res.json();
    expect(body.code).toBe('PLAN_REQUIRED');
  });
});

// ---------------------------------------------------------------------------
// 2. Authenticated PAID user — access granted
//    Requires LEMON_SQUEEZY_WEBHOOK_SECRET in server/.env to simulate webhook.
// ---------------------------------------------------------------------------

(WEBHOOK_SECRET ? test.describe : test.describe.skip)(
  'Payment Flow — Paid User Access',
  () => {
    const email = `e2e-payflow-paid-${uid}@example.com`;
    let userId: string;

    test.beforeAll(async ({ request }) => {
      // Create user
      const signupRes = await request.post('/api/auth/signup', {
        data: { email, password: PASSWORD, name: 'Paid User' },
      });
      const signupBody = await signupRes.json();
      userId = signupBody.user?.id;
      expect(userId).toBeTruthy();

      // Upgrade via simulated webhook
      const eventId = `evt-paid-${uid}`;
      const payload = JSON.stringify({
        meta: {
          event_name: 'order_created',
          webhook_id: eventId,
          custom_data: { user_id: userId },
        },
        data: {
          id: `order-${eventId}`,
          attributes: {
            customer_id: `cust-${eventId}`,
            discount_total_formatted: '$7.00',
          },
        },
      });
      const sig = signPayload(payload, WEBHOOK_SECRET!);

      const whRes = await request.post('/api/webhooks/lemon', {
        headers: { 'Content-Type': 'application/json', 'x-signature': sig },
        data: payload,
      });
      expect(whRes.status()).toBe(200);
    });

    test('paid user can access /upload without redirect', async ({ page }) => {
      await login(page, email);
      await page.goto('/upload');
      await expect(page).toHaveURL(/upload/);
      await expect(page.locator('h1')).toBeVisible();
    });

    test('paid user can access /dashboard without redirect', async ({ page }) => {
      await login(page, email);
      await page.goto('/dashboard');
      await expect(page).toHaveURL(/dashboard/);
    });

    test('pricing page shows active-plan indicator for paid user', async ({ page }) => {
      await login(page, email);
      await page.goto('/pricing');
      // PricingPage renders t('alreadyPaid') for paid users
      await expect(page.getByText(/active|activ|already/i)).toBeVisible();
    });

    test('payment status API returns paid plan', async ({ page }) => {
      await login(page, email);
      const res = await page.request.get('/api/payment/status');
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.plan).toBe('paid');
      expect(body.isActive).toBe(true);
      expect(body.planExpiresAt).toBeTruthy();
    });

    test('uploads API returns 200 for paid user', async ({ page }) => {
      await login(page, email);
      const res = await page.request.get('/api/uploads');
      expect(res.status()).toBe(200);
    });

    test('tax-years API returns 200 for paid user', async ({ page }) => {
      await login(page, email);
      const res = await page.request.get('/api/tax-years');
      expect(res.status()).toBe(200);
    });

    test('/upload?welcome=1 shows post-payment welcome banner', async ({ page }) => {
      await login(page, email);
      await page.goto('/upload?welcome=1');
      await expect(page).toHaveURL(/upload/);
      // Welcome toast: "Welcome to InvesTax!" or localised equivalent
      await expect(
        page.getByText(/welcome to investax|bine ai venit/i),
      ).toBeVisible({ timeout: 5_000 });
    });
  },
);

// ---------------------------------------------------------------------------
// 3. Promo counter display
// ---------------------------------------------------------------------------

test.describe('Payment Flow — Promo Counter', () => {
  test('promo counter API returns valid data', async ({ request }) => {
    const res = await request.get('/api/payment/promo-status');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.count).toBeGreaterThanOrEqual(0);
    expect(body.limit).toBe(100);
    expect(body.remaining).toBe(body.limit - body.count);
  });

  test('pricing page renders promo badge with remaining spots', async ({ page }) => {
    await page.goto('/pricing');
    // Badge shows "<remaining>/<limit>" or localised "X spots left"
    const badge = page.getByText(/\d+\/100|\d+ (spots|locuri)/i);
    await expect(badge.first()).toBeVisible({ timeout: 5_000 });
  });

  test('pricing page shows launch price when spots remain', async ({ page }) => {
    // Fetch counter first to know if launch price should display
    const res = await page.request.get('/api/payment/promo-status');
    const { remaining } = await res.json();

    await page.goto('/pricing');
    if (remaining > 0) {
      await expect(page.getByText('€12')).toBeVisible();
      // Regular price shown as strikethrough
      await expect(page.getByText('€19')).toBeVisible();
    } else {
      await expect(page.getByText('€19')).toBeVisible();
    }
  });
});

// ---------------------------------------------------------------------------
// 4. Webhook security (extended)
// ---------------------------------------------------------------------------

test.describe('Payment Flow — Webhook Security', () => {
  test('webhook rejects missing signature', async ({ request }) => {
    const res = await request.post('/api/webhooks/lemon', {
      headers: { 'Content-Type': 'application/json' },
      data: JSON.stringify({
        meta: { event_name: 'order_created', webhook_id: `no-sig-${uid}` },
      }),
    });
    expect([401, 500]).toContain(res.status());
  });

  test('webhook rejects invalid signature', async ({ request }) => {
    const res = await request.post('/api/webhooks/lemon', {
      headers: {
        'Content-Type': 'application/json',
        'x-signature': 'deadbeef',
      },
      data: JSON.stringify({
        meta: { event_name: 'order_created', webhook_id: `bad-sig-${uid}` },
      }),
    });
    expect([401, 500]).toContain(res.status());
  });

  (WEBHOOK_SECRET ? test : test.skip)(
    'webhook accepts valid HMAC signature',
    async ({ request }) => {
      const payload = JSON.stringify({
        meta: {
          event_name: 'test_event',
          webhook_id: `valid-sig-${uid}`,
          custom_data: {},
        },
        data: { id: `test-${uid}` },
      });
      const sig = signPayload(payload, WEBHOOK_SECRET!);
      const res = await request.post('/api/webhooks/lemon', {
        headers: { 'Content-Type': 'application/json', 'x-signature': sig },
        data: payload,
      });
      expect(res.status()).toBe(200);
    },
  );

  (WEBHOOK_SECRET ? test : test.skip)(
    'webhook handles duplicate events idempotently',
    async ({ request }) => {
      const eventId = `idem-${uid}`;
      const payload = JSON.stringify({
        meta: {
          event_name: 'test_idempotency',
          webhook_id: eventId,
          custom_data: {},
        },
        data: { id: `order-idem-${uid}` },
      });
      const sig = signPayload(payload, WEBHOOK_SECRET!);
      const headers = { 'Content-Type': 'application/json', 'x-signature': sig };

      // First request
      const res1 = await request.post('/api/webhooks/lemon', { headers, data: payload });
      expect(res1.status()).toBe(200);

      // Duplicate — should succeed with "Already processed"
      const res2 = await request.post('/api/webhooks/lemon', { headers, data: payload });
      expect(res2.status()).toBe(200);
      const body2 = await res2.json();
      expect(body2.message).toContain('Already processed');
    },
  );
});
