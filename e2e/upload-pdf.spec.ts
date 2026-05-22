import { test, expect, type Page } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import path from 'path';

// The two upload tests below need a paid-plan user. We set that precondition
// directly: sign the user up via the API, then flip plan='paid' on the DB row.
// passport.deserializeUser re-reads the user from the DB on every request, so
// the upgrade applies with no re-login. Routing through a signed Stripe webhook
// instead would need STRIPE_WEBHOOK_SECRET, which is absent in CI, and the
// payment/webhook path already has its own coverage (server payment.test.ts
// plus payment-flow-stripe.spec.ts). PDF parsing and tax calc are 100%
// client-side; the only server dependency here is /api/auth/me reflecting the
// paid plan.

const uid = Date.now();
const PASSWORD = 'TestPass123!';
const PAID_EMAIL = `e2e-upload-paid-${uid}@example.com`;
const PDF_PATH = path.resolve(__dirname, '..', 'test-data', 'annual-statement-2025.pdf');
const DB_PATH = path.resolve(__dirname, '..', 'server', 'prisma', 'dev.db');

/** Log in via the UI and wait for the post-login redirect. */
async function login(page: Page, email: string) {
  await page.goto('/login');
  await page.getByPlaceholder('you@example.com').fill(email);
  await page.getByPlaceholder('Enter your password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL(/dashboard|pricing/, { timeout: 10_000 });
}

test.describe('PDF Upload Flow', () => {
  test.beforeAll(async ({ request }) => {
    const res = await request.post('/api/auth/signup', {
      data: { email: PAID_EMAIL, password: PASSWORD, name: 'Upload Paid User' },
    });
    expect(res.status()).toBe(201);
    const { user } = await res.json();
    expect(user?.id).toBeTruthy();

    const prisma = new PrismaClient({
      datasources: { db: { url: `file:${DB_PATH}` } },
    });
    try {
      const planExpiresAt = new Date();
      planExpiresAt.setFullYear(planExpiresAt.getFullYear() + 1);
      await prisma.user.update({
        where: { id: user.id },
        data: { plan: 'paid', planPurchasedAt: new Date(), planExpiresAt },
      });
    } finally {
      await prisma.$disconnect();
    }
  });

  test('paid user uploads a PDF and sees the parsed preview', async ({ page }) => {
    await login(page, PAID_EMAIL);
    await page.goto('/upload');
    await expect(page.getByRole('heading', { name: 'Upload Broker Statement' })).toBeVisible();

    await page.locator('input[type="file"]').setInputFiles(PDF_PATH);

    // Preview card: filename, parsed statement year, and the stat badges.
    await expect(page.getByText('annual-statement-2025.pdf')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Annual Statement 2025')).toBeVisible();
    await expect(page.getByText('Sell Trades')).toBeVisible();
  });

  test('paid user uploads a PDF, calculates taxes, and lands on results', async ({ page }) => {
    await login(page, PAID_EMAIL);
    await page.goto('/upload');

    await page.locator('input[type="file"]').setInputFiles(PDF_PATH);
    await expect(page.getByText('annual-statement-2025.pdf')).toBeVisible({ timeout: 15_000 });

    await page.getByRole('button', { name: /Calculate Taxes/i }).click();

    await page.waitForURL(/\/results/, { timeout: 15_000 });
    await expect(page.locator('h1')).toContainText('Tax Results');
    await expect(page.getByText('Capital Gains Tax')).toBeVisible();
    await expect(page.getByText('Health Contribution (CASS)')).toBeVisible();
    await expect(page.getByText('Total Tax Owed')).toBeVisible();
    // PLTR is one of the sell-trade tickers in the fixture statement.
    await expect(page.getByText('PLTR').first()).toBeVisible();
  });

  // Free / unauthenticated users must not reach the upload page.
  test('unauthenticated user is redirected to pricing', async ({ page }) => {
    await page.goto('/upload');
    await expect(page).toHaveURL(/pricing/);
  });
});
