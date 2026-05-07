import { test, expect, type Page } from '@playwright/test';

// Provider-agnostic payment flow E2E.
//
// Webhook security + paid-user-access tests live in `payment-flow-stripe.spec.ts`,
// which simulates a signed Stripe webhook to upgrade users and exercises the
// signature-validation + idempotency paths against the live Stripe webhook
// route. This file covers the parts of the flow that don't depend on a
// specific processor: paywall enforcement on free users, the checkout button
// calling `/api/payment/checkout`, and promo-counter rendering.

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

    // Mock the checkout endpoint so we don't hit the real provider and don't
    // navigate away.
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
// 2. Promo counter display
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
