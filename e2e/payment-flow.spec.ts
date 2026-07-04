import { test, expect, type Page } from '@playwright/test';
import path from 'path';

// Provider-agnostic payment flow E2E.
//
// Webhook security + paid-user-access tests live in `payment-flow-stripe.spec.ts`,
// which simulates a signed Stripe webhook to upgrade users and exercises the
// signature-validation + idempotency paths against the live Stripe webhook
// route. This file covers the parts of the flow that don't depend on a
// specific processor: paywall enforcement on free users, the checkout button
// calling `/api/payment/checkout`, and promo-counter rendering.
//
// Pre-pay parse gate (backlog #24B Phase 2, PR-3): the Pricing "Buy" click is now
// gated on a verified parse this session (a pendingParse token in sessionStorage,
// written by the checker's green unlock). Without it, Buy routes to the free checker
// (/verifica-extras) and does NOT start checkout. The checkout-calls test below was
// updated to establish that token via the checker first (the new parse-first flow).

const uid = Date.now();
const PASSWORD = 'TestPass123!';
const PDF_PATH = path.resolve(__dirname, '..', 'test-data', 'annual-statement-2025.pdf');

/** Establish the pre-pay gate token the honest way: parse the fixture FREE on the
 *  public checker and click the green unlock, which writes the pendingParse into
 *  sessionStorage (and navigates on). Same-tab sessionStorage then survives a later
 *  page.goto('/pricing'), so the Buy click finds an open gate. */
async function verifyParseViaChecker(page: Page) {
  await page.goto('/verifica-extras');
  await page.locator('input[type="file"]').setInputFiles(PDF_PATH);
  await expect(page.getByTestId('preview-unlock-cta')).toBeVisible({ timeout: 15_000 });
  await page.getByTestId('preview-unlock-cta').click();
}

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

  test('Buy WITHOUT a verified parse routes to the checker, not checkout (gate closed)', async ({ page }) => {
    await login(page, email);
    await page.goto('/pricing');

    // Guard: if the gate were bypassed, checkout would be hit. Fail the test if so.
    let checkoutCalled = false;
    await page.route('**/api/payment/checkout', async (route) => {
      checkoutCalled = true;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ checkoutUrl: 'https://example.com/mock-checkout' }),
      });
    });

    // No pending parse this session: the Buy CTA reads as a free pre-check and routes
    // to the checker. No charge is ever started for a file we have not read.
    await expect(page.getByTestId('pricing-check-first-note')).toBeVisible();
    await page.getByTestId('pricing-buy-cta').click();
    await expect(page).toHaveURL(/verifica-extras/);
    expect(checkoutCalled).toBe(false);
  });

  test('checkout button calls /api/payment/checkout AFTER a verified parse (parse-first flow)', async ({ page }) => {
    await login(page, email);

    // Establish the gate token by parsing the fixture on the free checker first.
    await verifyParseViaChecker(page);

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

    // The gate is now open (pendingParse present + logged in), so the Buy click
    // proceeds into checkout instead of routing back to the checker.
    await page.goto('/pricing');
    await page.getByTestId('pricing-buy-cta').click();
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
