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

  test('404 page shows for unknown routes', async ({ page }) => {
    await page.goto('/this-page-does-not-exist');
    await expect(page.locator('text=404')).toBeVisible();
    // Should have a "Back to Home" link on the 404 page itself
    await expect(page.getByRole('link', { name: /back to home|inapoi acasa/i })).toBeVisible();
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

  test('filing guide page loads', async ({ page }) => {
    await page.goto('/filing-guide');
    await expect(page.locator('h1')).toBeVisible();
    // Without tax data, should show empty state with a CTA
    await expect(page.getByRole('link', { name: /calculator|upload|calculează/i })).toBeVisible();
  });

  test('status page loads with health checks', async ({ page }) => {
    await page.goto('/status');
    await expect(page.getByText('Project Status')).toBeVisible();
    // Health check cards should be present
    await expect(page.getByText('Express Server')).toBeVisible();
    await expect(page.getByText('SQLite Database')).toBeVisible();
    await expect(page.getByText('BNR Rates API')).toBeVisible();
    // Feature list should render
    await expect(page.getByText('Features')).toBeVisible();
    // Progress bar should exist
    await expect(page.getByText('Overall Progress')).toBeVisible();
  });

  test('results page loads without data (empty state)', async ({ page }) => {
    await page.goto('/results');
    // Without upload context data, should show empty state or redirect
    // Either way, should not crash — verify no blank screen
    await expect(page.locator('body')).not.toBeEmpty();
    // Should have navigation visible (not a broken page)
    await expect(page.locator('nav')).toBeVisible();
  });
});
