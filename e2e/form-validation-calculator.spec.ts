import { test, expect } from '@playwright/test';

/**
 * Scenario J — Calculator Form Validation
 *
 * Tests decimal separator handling (comma vs period), zero/empty inputs,
 * negative values, large numbers, and CASS bracket thresholds.
 *
 * Romania CASS brackets:
 *   0–24,299: none
 *   24,300–48,599: 6x (2,430 RON)
 *   48,600–97,199: 12x (4,860 RON)
 *   97,200+: 24x (9,720 RON)
 */

test.describe('Scenario J: Calculator decimal input handling', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/calculator');
    // Dismiss cookie banner if visible so it doesn't overlap results
    const cookieBtn = page.getByRole('button', { name: /Got it/i });
    if (await cookieBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await cookieBtn.click();
    }
  });

  test('accepts period as decimal separator', async ({ page }) => {
    const inputs = page.locator('input[inputmode="decimal"]');
    await inputs.nth(0).fill('10000.50');

    await page.getByText('Calculate').click();

    const results = page.getByText('Results');
    await expect(results).toBeVisible();
    await results.scrollIntoViewIfNeeded();
    // 10000.50 * 10% = 1000.05 (appears in both row and total)
    await expect(page.getByText('1000.05').first()).toBeVisible();
  });

  test('accepts comma as decimal separator (Romanian format)', async ({ page }) => {
    const inputs = page.locator('input[inputmode="decimal"]');
    await inputs.nth(0).fill('10000,50');

    await page.getByText('Calculate').click();

    const results = page.getByText('Results');
    await expect(results).toBeVisible();
    await results.scrollIntoViewIfNeeded();
    // Comma is replaced with period: 10000.50 * 10% = 1000.05
    await expect(page.getByText('1000.05').first()).toBeVisible();
  });

  test('empty fields show validation error — no empty results', async ({ page }) => {
    // Don't fill anything, just calculate
    await page.getByText('Calculate').click();

    // Should show validation error, not zero results
    await expect(page.getByText(/Enter at least one value/)).toBeVisible();
    await expect(page.getByText('Results')).not.toBeVisible();
  });

  test('all zero inputs show validation error', async ({ page }) => {
    const inputs = page.locator('input[inputmode="decimal"]');
    await inputs.nth(0).fill('0');
    await inputs.nth(1).fill('0');
    await inputs.nth(2).fill('0');
    await inputs.nth(3).fill('0');

    await page.getByText('Calculate').click();

    await expect(page.getByText(/Enter at least one value/)).toBeVisible();
  });

  test('handles text in numeric fields gracefully (NaN → 0, shows error)', async ({ page }) => {
    const inputs = page.locator('input[inputmode="decimal"]');
    await inputs.nth(0).fill('abc');

    await page.getByText('Calculate').click();

    // parseFloat("abc") → NaN → fallback to 0, so all inputs are 0 → validation error
    await expect(page.getByText(/Enter at least one value/)).toBeVisible();
  });

  test('handles very large numbers', async ({ page }) => {
    const inputs = page.locator('input[inputmode="decimal"]');
    await inputs.nth(0).fill('5000000');

    await page.getByText('Calculate').click();

    await expect(page.getByText('Results')).toBeVisible();
    // 5,000,000 * 10% = 500,000
    await expect(page.getByText('500000.00')).toBeVisible();
    await expect(page.getByText(/bracket: 24x/)).toBeVisible();
  });
});

test.describe('Scenario J: Calculator CASS bracket thresholds', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/calculator');
    const cookieBtn = page.getByRole('button', { name: /Got it/i });
    if (await cookieBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await cookieBtn.click();
    }
  });

  test('no CASS below 24300 threshold', async ({ page }) => {
    const inputs = page.locator('input[inputmode="decimal"]');
    await inputs.nth(0).fill('24299');

    await page.getByText('Calculate').click();

    await expect(page.getByText(/bracket: none/)).toBeVisible();
  });

  test('6x CASS bracket at exactly 24300', async ({ page }) => {
    const inputs = page.locator('input[inputmode="decimal"]');
    await inputs.nth(0).fill('24300');

    await page.getByText('Calculate').click();

    await expect(page.getByText(/bracket: 6x/)).toBeVisible();
    // Health contribution should be 2430
    const cassRow = page.getByText(/bracket: 6x/).locator('..');
    await expect(cassRow).toContainText('2430.00');
  });

  test('12x CASS bracket at exactly 48600', async ({ page }) => {
    const inputs = page.locator('input[inputmode="decimal"]');
    await inputs.nth(0).fill('48600');

    await page.getByText('Calculate').click();

    await expect(page.getByText(/bracket: 12x/)).toBeVisible();
    const cassRow = page.getByText(/bracket: 12x/).locator('..');
    await expect(cassRow).toContainText('4860.00');
  });

  test('24x CASS bracket at exactly 97200', async ({ page }) => {
    const inputs = page.locator('input[inputmode="decimal"]');
    await inputs.nth(0).fill('97200');

    await page.getByText('Calculate').click();

    await expect(page.getByText(/bracket: 24x/)).toBeVisible();
    const cassRow = page.getByText(/bracket: 24x/).locator('..');
    await expect(cassRow).toContainText('9720.00');
  });

  test('CASS considers dividends + other income in total', async ({ page }) => {
    // Capital gains alone = 20000 (below 24300)
    // But with dividends = 5000, total = 25000 (above 24300 → 6x bracket)
    const inputs = page.locator('input[inputmode="decimal"]');
    await inputs.nth(0).fill('20000');
    await inputs.nth(1).fill('5000');

    await page.getByText('Calculate').click();

    await expect(page.getByText(/bracket: 6x/)).toBeVisible();
  });

  test('early filing discount calculated correctly', async ({ page }) => {
    const inputs = page.locator('input[inputmode="decimal"]');
    await inputs.nth(0).fill('100000'); // capital gains tax = 10000

    await page.getByText('Calculate').click();

    // 3% discount on capital gains tax + dividend tax (but no dividends)
    // 10000 * 0.03 = 300
    await expect(page.getByText(/3% discount/)).toBeVisible();
    await expect(page.getByText('300.00')).toBeVisible();
  });

  test('dividend withholding tax credit reduces tax owed', async ({ page }) => {
    const inputs = page.locator('input[inputmode="decimal"]');
    await inputs.nth(1).fill('10000'); // gross dividends
    await inputs.nth(2).fill('800');   // withholding tax already paid

    await page.getByText('Calculate').click();

    await expect(page.getByText('Results')).toBeVisible();
    // Dividend tax: 10000 * 10% = 1000, minus 800 withholding = 200 owed
    await expect(page.getByText('200.00').first()).toBeVisible();
  });
});

test.describe('Scenario J: Calculator API endpoint validation', () => {
  test('API rejects missing required fields gracefully', async ({ request }) => {
    const res = await request.post('/api/calculator/quick', {
      data: {},
    });
    // Should still return a result (defaults to 0) or reject with validation error
    expect([200, 400]).toContain(res.status());
  });

  test('API returns correct structure for valid input', async ({ request }) => {
    const res = await request.post('/api/calculator/quick', {
      data: {
        capitalGains: 50000,
        dividends: 2000,
        withholdingTaxPaid: 200,
        otherNonSalaryIncome: 0,
        country: 'RO',
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('capitalGainsTax');
    expect(body).toHaveProperty('dividendTax');
    expect(body).toHaveProperty('healthContribution');
    expect(body).toHaveProperty('bracketLabel');
    expect(body).toHaveProperty('totalOwed');
    expect(body).toHaveProperty('earlyFilingDiscount');
    // Capital gains tax = 50000 * 10% = 5000
    expect(body.capitalGainsTax).toBe(5000);
  });
});
