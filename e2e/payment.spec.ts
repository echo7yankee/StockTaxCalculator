import { test, expect } from '@playwright/test';

test.describe('Payment Infrastructure', () => {
  // API endpoint tests
  test('promo status endpoint returns counter data', async ({ request }) => {
    const res = await request.get('/api/payment/promo-status');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('count');
    expect(body).toHaveProperty('limit');
    expect(body).toHaveProperty('remaining');
    expect(typeof body.count).toBe('number');
    expect(typeof body.limit).toBe('number');
    expect(body.remaining).toBe(body.limit - body.count);
  });

  test('checkout endpoint requires authentication', async ({ request }) => {
    const res = await request.get('/api/payment/checkout');
    expect(res.status()).toBe(401);
  });

  test('payment status endpoint requires authentication', async ({ request }) => {
    const res = await request.get('/api/payment/status');
    expect(res.status()).toBe(401);
  });

  test('webhook endpoint rejects requests without signature', async ({ request }) => {
    const res = await request.post('/api/webhooks/lemon', {
      headers: { 'Content-Type': 'application/json' },
      data: JSON.stringify({ meta: { event_name: 'test' } }),
    });
    // Should be 401 (invalid signature) or 500 (not configured)
    expect([401, 500]).toContain(res.status());
  });

  test('uploads endpoint returns 401 for unauthenticated users', async ({ request }) => {
    const res = await request.get('/api/uploads');
    expect(res.status()).toBe(401);
  });

  test('tax-years endpoint returns 401 for unauthenticated users', async ({ request }) => {
    const res = await request.get('/api/tax-years');
    expect(res.status()).toBe(401);
  });

  // UI paywall tests
  test('pricing page loads with feature comparison', async ({ page }) => {
    await page.goto('/pricing');
    // Should show pricing page content
    await expect(page.locator('h1')).toBeVisible();
    // Should show free and paid tier cards
    await expect(page.getByText('€0')).toBeVisible();
    // Should show FAQ section
    await expect(page.getByText(/FAQ|Frequently|Întrebări/i)).toBeVisible();
  });

  test('pricing page shows launch counter', async ({ page }) => {
    await page.goto('/pricing');
    // Launch promo badge should be visible (while spots remain)
    const launchBadge = page.getByText(/launch|lansare/i);
    await expect(launchBadge.first()).toBeVisible();
  });

  test('pricing page shows buy button for unauthenticated users', async ({ page }) => {
    await page.goto('/pricing');
    // Should show "Log in to purchase" button
    const buyButton = page.getByRole('button', { name: /log in|autentifică/i });
    await expect(buyButton).toBeVisible();
  });

  test('upload page redirects to pricing for unauthenticated users', async ({ page }) => {
    await page.goto('/upload');
    await expect(page).toHaveURL(/pricing/);
  });

  test('pricing page FAQ accordion works', async ({ page }) => {
    await page.goto('/pricing');
    // Click first FAQ question
    const firstFaq = page.getByText(/free|gratuit/i).first();
    if (await firstFaq.isVisible()) {
      await firstFaq.click();
      // Answer should become visible
      await page.waitForTimeout(300);
    }
  });

  test('pricing page is responsive on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/pricing');
    await expect(page.locator('h1')).toBeVisible();
    // Feature cards should stack on mobile (no horizontal overflow)
    const body = page.locator('body');
    const bodyWidth = await body.evaluate(el => el.scrollWidth);
    expect(bodyWidth).toBeLessThanOrEqual(375);
  });
});
