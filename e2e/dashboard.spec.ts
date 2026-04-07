import { test, expect } from '@playwright/test';

test.describe('Dashboard', () => {
  test('shows dashboard with action cards', async ({ page }) => {
    await page.goto('/dashboard');

    await expect(page.locator('h1')).toContainText('Dashboard');
    await expect(page.getByText('Upload Statement')).toBeVisible();
    await expect(page.getByText('Quick Calculator')).toBeVisible();
  });

  test('shows saved calculations section', async ({ page }) => {
    await page.goto('/dashboard');

    await expect(page.getByRole('heading', { name: 'Saved Calculations' })).toBeVisible();
  });

  test('upload statement link navigates to upload page', async ({ page }) => {
    await page.goto('/dashboard');

    await page.getByText('Upload Statement').click();
    await expect(page).toHaveURL(/upload/);
  });

  test('quick calculator link navigates to calculator', async ({ page }) => {
    await page.goto('/dashboard');

    await page.getByText('Quick Calculator').click();
    await expect(page).toHaveURL(/calculator/);
  });
});
