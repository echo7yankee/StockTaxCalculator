import { test, expect } from '@playwright/test';
import path from 'path';

test.describe('PDF Upload Flow', () => {
  // Upload page requires paid plan — these tests need a paid user session
  // which requires Lemon Squeezy integration. Skipping until LS is configured.
  // TODO: Re-enable when payment integration is live (set user.plan='paid' in test setup)

  test.skip('uploads PDF and shows preview', async ({ page }) => {
    await page.goto('/upload');

    const pdfPath = path.resolve('test-data/annual-statement-2025.pdf');
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(pdfPath);

    await expect(page.getByText('annual-statement-2025.pdf')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('2025', { exact: true })).toBeVisible();
  });

  test.skip('uploads PDF, calculates taxes, and navigates to results', async ({ page }) => {
    await page.goto('/upload');

    const pdfPath = path.resolve('test-data/annual-statement-2025.pdf');
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(pdfPath);

    await expect(page.getByText('annual-statement-2025.pdf')).toBeVisible({ timeout: 10_000 });

    await page.getByRole('button', { name: /Calculate/i }).click();
    await expect(page.locator('h1')).toContainText(/Tax Results/, { timeout: 15_000 });
    await expect(page.getByText('Capital Gains Tax')).toBeVisible();
    await expect(page.getByText('Health Contribution (CASS)')).toBeVisible();
    await expect(page.getByText('PLTR').first()).toBeVisible();
  });

  // Verify paywall redirect works
  test('unauthenticated user is redirected to pricing', async ({ page }) => {
    await page.goto('/upload');
    await expect(page).toHaveURL(/pricing/);
  });
});
