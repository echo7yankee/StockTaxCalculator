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

// Pre-pay parse gate (backlog #24B Phase 2, PR-2): the buyer parses their statement
// FREE on /verifica-extras, that parse is stashed in sessionStorage on the unlock
// click, and /upload?welcome=1 rehydrates it and runs the engine WITHOUT a re-upload.
// The load-bearing assertion is PARITY: the rehydrated total equals the re-upload
// total for the same fixture (the 28,053 lei founder case must not drift).
test.describe('Pre-pay parse persist + rehydrate (PR-2)', () => {
  const uid2 = Date.now() + 1;
  const REHYDRATE_EMAIL = `e2e-rehydrate-paid-${uid2}@example.com`;

  test.beforeAll(async ({ request }) => {
    const res = await request.post('/api/auth/signup', {
      data: { email: REHYDRATE_EMAIL, password: PASSWORD, name: 'Rehydrate Paid User' },
    });
    expect(res.status()).toBe(201);
    const { user } = await res.json();
    const prisma = new PrismaClient({ datasources: { db: { url: `file:${DB_PATH}` } } });
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

  /** Run the classic re-upload path and return the displayed Total Tax Owed. */
  async function reuploadTotal(page: Page): Promise<string> {
    await login(page, REHYDRATE_EMAIL);
    await page.goto('/upload');
    await page.locator('input[type="file"]').setInputFiles(PDF_PATH);
    await expect(page.getByText('annual-statement-2025.pdf')).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: /Calculate Taxes/i }).click();
    await page.waitForURL(/\/results/, { timeout: 15_000 });
    return (await page.getByTestId('total-tax-owed-value').textContent())?.trim() ?? '';
  }

  test('a persisted parse lands /upload?welcome=1 on results WITHOUT a re-upload', async ({ page }) => {
    await login(page, REHYDRATE_EMAIL);

    // Parse the fixture FREE on the public checker, then click unlock: this writes
    // the pending parse to sessionStorage (PreviewPage.goToUnlock) and navigates on.
    await page.goto('/verifica-extras');
    await page.locator('input[type="file"]').setInputFiles(PDF_PATH);
    await expect(page.getByTestId('preview-unlock-cta')).toBeVisible({ timeout: 15_000 });
    await page.getByTestId('preview-unlock-cta').click();

    // Simulate the post-pay redirect landing. The rehydration runs the engine from
    // the stashed parse; no drop zone interaction happens.
    await page.goto('/upload?welcome=1');
    await page.waitForURL(/\/results/, { timeout: 15_000 });
    await expect(page.locator('h1')).toContainText('Tax Results');
    await expect(page.getByText('Total Tax Owed')).toBeVisible();
    // The key is consumed after a successful run: a refresh must not re-run it.
    const stored = await page.evaluate(() => window.sessionStorage.getItem('investax.pendingParse'));
    expect(stored).toBeNull();
  });

  test('PARITY: the rehydrated total equals the re-upload total for the same fixture', async ({ page }) => {
    // 1) Baseline: the classic re-upload path total.
    const reupload = await reuploadTotal(page);
    expect(reupload).toMatch(/\d/);

    // 2) Rehydrated path total for the identical fixture.
    await page.goto('/verifica-extras');
    await page.locator('input[type="file"]').setInputFiles(PDF_PATH);
    await expect(page.getByTestId('preview-unlock-cta')).toBeVisible({ timeout: 15_000 });
    await page.getByTestId('preview-unlock-cta').click();
    await page.goto('/upload?welcome=1');
    await page.waitForURL(/\/results/, { timeout: 15_000 });
    const rehydrated = (await page.getByTestId('total-tax-owed-value').textContent())?.trim() ?? '';

    // The engine input is byte-identical, so the number must match exactly. This is
    // the 28,053 lei non-drift guarantee expressed on the fixture statement.
    expect(rehydrated).toBe(reupload);
  });

  test('absent sessionStorage: /upload?welcome=1 degrades to the normal re-upload flow', async ({ page }) => {
    await login(page, REHYDRATE_EMAIL);
    // Land post-pay with NO pending parse (nothing stashed): the drop zone renders
    // and the buyer can re-upload, exactly as before Phase 2.
    await page.goto('/upload?welcome=1');
    await expect(page.getByText('Drop your PDF statement here')).toBeVisible({ timeout: 15_000 });
    await expect(page).not.toHaveURL(/\/results/);

    // Re-upload still works end to end.
    await page.locator('input[type="file"]').setInputFiles(PDF_PATH);
    await expect(page.getByText('annual-statement-2025.pdf')).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: /Calculate Taxes/i }).click();
    await page.waitForURL(/\/results/, { timeout: 15_000 });
    await expect(page.getByText('Total Tax Owed')).toBeVisible();
  });
});
