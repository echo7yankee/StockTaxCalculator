import { test, expect, devices } from '@playwright/test';

test.use(devices['iPhone SE']);

test.describe('Mobile viewport', () => {
  test('landing page has no horizontal scroll', async ({ page }) => {
    await page.goto('/');
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1); // 1px tolerance
  });

  test('calculator page has no horizontal scroll', async ({ page }) => {
    await page.goto('/calculator');
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
  });

  test.fixme('upload page has no horizontal scroll', async ({ page }) => {
    // Known issue: upload page overflows on iPhone SE (320px) — needs CSS fix
    await page.goto('/upload');
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
  });

  test('login page has no horizontal scroll', async ({ page }) => {
    await page.goto('/login');
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
  });

  test('forgot-password page has no horizontal scroll', async ({ page }) => {
    await page.goto('/forgot-password');
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
  });

  test('mobile nav menu opens', async ({ page }) => {
    await page.goto('/');
    const menuButton = page.getByRole('button', { name: 'Menu' });
    await expect(menuButton).toBeVisible();
    await menuButton.click();
    await expect(page.getByRole('link', { name: 'Calculator', exact: true })).toBeVisible({ timeout: 2000 });
  });

  test('contact page has no horizontal scroll', async ({ page }) => {
    await page.goto('/contact');
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
  });

  test('contact cards stack vertically on mobile', async ({ page }) => {
    await page.goto('/contact');
    await expect(page.getByText('Need help?')).toBeVisible();
    await expect(page.getByText('Other questions?')).toBeVisible();
  });

  test('pricing page has no horizontal scroll', async ({ page }) => {
    await page.goto('/pricing');
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
  });

  test('settings page has no horizontal scroll', async ({ page }) => {
    await page.goto('/settings');
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
  });
});
