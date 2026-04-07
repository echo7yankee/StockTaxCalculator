import { test, expect } from '@playwright/test';

test.describe('Trust & Safety Pages', () => {
  test('privacy policy page loads', async ({ page }) => {
    await page.goto('/privacy');
    await expect(page.locator('h1')).toBeVisible();
    // No console errors
    const errors: string[] = [];
    page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
    await page.waitForTimeout(500);
    expect(errors.filter(e => !e.includes('favicon'))).toHaveLength(0);
  });

  test('terms of service page loads', async ({ page }) => {
    await page.goto('/terms');
    await expect(page.locator('h1')).toBeVisible();
  });

  test('contact page loads', async ({ page }) => {
    await page.goto('/contact');
    await expect(page.locator('h1')).toBeVisible();
  });

  test('footer links to privacy and terms', async ({ page }) => {
    await page.goto('/');
    const footer = page.locator('footer');
    await expect(footer.getByRole('link', { name: /privacy/i })).toBeVisible();
    await expect(footer.getByRole('link', { name: /terms/i })).toBeVisible();
  });

  test('cookie banner appears on first visit', async ({ page, context }) => {
    await context.clearCookies();
    // Clear localStorage by navigating first then clearing
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    // Cookie banner should be visible
    await expect(page.getByText(/cookie/i)).toBeVisible({ timeout: 3000 });
  });
});
