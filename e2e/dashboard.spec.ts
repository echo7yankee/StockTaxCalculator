import { test, expect } from '@playwright/test';

test.describe('Dashboard', () => {
  test('shows dashboard heading for unauthenticated users', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.locator('h1')).toContainText('Dashboard');
  });

  test('shows login prompt for unauthenticated users', async ({ page }) => {
    await page.goto('/dashboard');
    // Unauthenticated users see login links (in header and/or main content)
    await expect(page.locator('main').getByRole('link', { name: /log in/i }).first()).toBeVisible();
  });

  test('quick calculator link navigates to calculator', async ({ page }) => {
    await page.goto('/dashboard');
    const calcLink = page.getByText('Quick Calculator');
    if (await calcLink.isVisible()) {
      await calcLink.click();
      await expect(page).toHaveURL(/calculator/);
    }
  });
});
