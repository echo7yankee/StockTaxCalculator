import { test, expect } from '@playwright/test';

test.describe('Navigation', () => {
  test('landing page loads with hero section', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1')).toBeVisible();
    // Should have navigation links
    await expect(page.locator('nav')).toBeVisible();
  });

  test('navigates to calculator page', async ({ page }) => {
    await page.goto('/calculator');
    await expect(page.getByText('Tax Calculator')).toBeVisible();
    await expect(page.getByText('Calculate')).toBeVisible();
  });

  test('navigates to upload page', async ({ page }) => {
    await page.goto('/upload');
    await expect(page.locator('h1')).toContainText(/Upload/i);
  });

  test('navigates to dashboard', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.locator('h1')).toContainText('Dashboard');
  });

  test('navigates to settings page', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.getByText('Settings')).toBeVisible();
  });

  test('header links work', async ({ page }) => {
    await page.goto('/');

    // Click Calculator link in nav header
    await page.locator('nav').getByRole('link', { name: 'Calculator' }).click();
    await expect(page).toHaveURL(/calculator/);

    // Click Dashboard link in nav header
    await page.locator('nav').getByRole('link', { name: 'Dashboard' }).click();
    await expect(page).toHaveURL(/dashboard/);
  });
});
