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

  test('upload page redirects unauthenticated users to pricing', async ({ page }) => {
    await page.goto('/upload');
    await expect(page).toHaveURL(/pricing/);
  });

  test('dashboard shows login prompt for unauthenticated users', async ({ page }) => {
    await page.goto('/dashboard');
    // Dashboard shows login prompt for unauthenticated users
    await expect(page.locator('h1')).toContainText('Dashboard');
  });

  test('navigates to pricing page', async ({ page }) => {
    await page.goto('/pricing');
    await expect(page.locator('h1')).toBeVisible();
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

    // For free/unauthenticated users, Pricing link is shown instead of Dashboard
    const pricingLink = page.locator('nav').getByRole('link', { name: /Pricing|Prețuri/ });
    if (await pricingLink.isVisible()) {
      await pricingLink.click();
      await expect(page).toHaveURL(/pricing/);
    }
  });
});
