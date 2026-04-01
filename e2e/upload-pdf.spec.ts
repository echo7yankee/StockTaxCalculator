import { test, expect } from '@playwright/test';
import path from 'path';

test.describe('PDF Upload Flow', () => {
  test('uploads PDF and shows preview', async ({ page }) => {
    await page.goto('/upload');

    // Upload the test PDF
    const pdfPath = path.resolve('test-data/annual-statement-2025.pdf');
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(pdfPath);

    // Should show file name in the preview
    await expect(page.getByText('annual-statement-2025.pdf')).toBeVisible({ timeout: 10_000 });

    // Should show year as text (exact match to avoid multiple hits)
    await expect(page.getByText('2025', { exact: true })).toBeVisible();
  });

  test('uploads PDF, calculates taxes, and navigates to results', async ({ page }) => {
    await page.goto('/upload');

    const pdfPath = path.resolve('test-data/annual-statement-2025.pdf');
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(pdfPath);

    // Wait for preview to appear
    await expect(page.getByText('annual-statement-2025.pdf')).toBeVisible({ timeout: 10_000 });

    // Click calculate button
    await page.getByRole('button', { name: /Calculate/i }).click();

    // Should navigate to results page
    await expect(page.locator('h1')).toContainText(/Tax Results/, { timeout: 15_000 });

    // Should show capital gains tax
    await expect(page.getByText('Capital Gains Tax')).toBeVisible();
    // Should show CASS
    await expect(page.getByText('Health Contribution (CASS)')).toBeVisible();
    // Should show per-security breakdown with at least PLTR
    await expect(page.getByText('PLTR').first()).toBeVisible();
  });
});
