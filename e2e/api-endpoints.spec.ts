import { test, expect } from '@playwright/test';

test.describe('API Endpoints', () => {
  test('health check returns 200', async ({ request }) => {
    const res = await request.get('/api/health');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
    expect(body.timestamp).toBeTruthy();
  });

  test('Google OAuth endpoint returns redirect (not 404)', async ({ request }) => {
    const res = await request.get('/api/auth/google', { maxRedirects: 0 });
    // Should be 302 redirect to Google, NOT 404
    expect(res.status()).toBe(302);
  });

  test('Google OAuth callback is registered (not 404)', async ({ request }) => {
    // Calling callback without valid OAuth state should fail, but NOT with 404
    const res = await request.get('/api/auth/google/callback');
    expect(res.status()).not.toBe(404);
  });

  test('protected route returns 401 when unauthenticated', async ({ request }) => {
    const res = await request.get('/api/uploads');
    expect(res.status()).toBe(401);
  });

  test('protected tax-years route returns 401 when unauthenticated', async ({ request }) => {
    const res = await request.get('/api/tax-years');
    expect(res.status()).toBe(401);
  });

  test('calculator endpoint accepts POST', async ({ request }) => {
    const res = await request.post('/api/calculator/quick', {
      data: {
        capitalGains: 10000,
        dividends: 500,
        withholdingTaxPaid: 50,
        otherNonSalaryIncome: 0,
        country: 'RO',
      },
    });
    expect(res.status()).toBe(200);
  });

  test('exchange rates endpoint responds', async ({ request }) => {
    const res = await request.get('/api/exchange-rates/2025/average?currency=EUR');
    // May return 200 or a fallback, but should never be 404
    expect(res.status()).not.toBe(404);
  });
});
