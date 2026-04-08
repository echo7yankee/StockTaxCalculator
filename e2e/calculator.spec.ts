import { test, expect } from '@playwright/test';

test.describe('Quick Calculator', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/calculator');
  });

  test('calculates tax for capital gains', async ({ page }) => {
    // Fill capital gains
    const inputs = page.locator('input[inputmode="decimal"]');
    await inputs.nth(0).fill('50000'); // capital gains

    await page.getByText('Calculate').click();

    // Should show results
    await expect(page.getByText('Results')).toBeVisible();
    // Capital gains tax at 10%
    await expect(page.getByText('5000.00')).toBeVisible();
    await expect(page.getByText('Total tax owed')).toBeVisible();
  });

  test('calculates with dividends and withholding', async ({ page }) => {
    const inputs = page.locator('input[inputmode="decimal"]');
    await inputs.nth(0).fill('30000'); // capital gains
    await inputs.nth(1).fill('5000');  // dividends
    await inputs.nth(2).fill('500');   // withholding tax paid

    await page.getByText('Calculate').click();

    await expect(page.getByText('Results')).toBeVisible();
    // Should show early filing discount info
    await expect(page.getByText(/3% discount/)).toBeVisible();
  });

  test('hits CASS 24x bracket for high income', async ({ page }) => {
    const inputs = page.locator('input[inputmode="decimal"]');
    await inputs.nth(0).fill('100000');

    await page.getByText('Calculate').click();

    await expect(page.getByText(/bracket: 24x/)).toBeVisible();
    // Health contribution row contains 9720.00
    const cassRow = page.getByText(/bracket: 24x/).locator('..');
    await expect(cassRow).toContainText('9720.00');
  });

  test('shows no CASS for low income', async ({ page }) => {
    const inputs = page.locator('input[inputmode="decimal"]');
    await inputs.nth(0).fill('5000');

    await page.getByText('Calculate').click();

    await expect(page.getByText(/bracket: none/)).toBeVisible();
  });
});
