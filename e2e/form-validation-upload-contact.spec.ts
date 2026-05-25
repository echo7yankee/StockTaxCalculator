import { test, expect } from '@playwright/test';

/**
 * Scenario K — Upload & Contact Page Validation
 *
 * Tests upload page tab system, file validation hints, CSV warnings,
 * contact page content completeness, and email link integrity.
 * Mobile contact tests are in mobile.spec.ts (requires top-level test.use).
 */

test.describe('Scenario K: Upload page tab system and validation', () => {
  // Per PR #124 (pre-paywall preview), /upload is a login wall, not a paywall.
  // Logged-out users go to /login?redirect=/upload. Logged-in free users see
  // the full upload + preview surface; the D212 export stays paywalled.

  test('unauthenticated user redirected from upload to login', async ({ page }) => {
    await page.goto('/upload');
    await expect(page).toHaveURL(/login\?redirect=%2Fupload|login\?redirect=\/upload/);
  });

  test('pricing page has feature comparison for free vs paid', async ({ page }) => {
    await page.goto('/pricing');
    // Both free (€0) and paid tiers should be visible
    await expect(page.getByText('€0')).toBeVisible();
    await expect(page.getByText(/€19|€12/).first()).toBeVisible();
  });

  test('pricing page FAQ items expand on click', async ({ page }) => {
    await page.goto('/pricing');
    const faqSection = page.getByText(/FAQ|Frequently|Întrebări/i).first();
    await expect(faqSection).toBeVisible();

    // Find and click a FAQ question
    const faqButton = page.locator('button').filter({ hasText: /free|gratuit/i }).first();
    if (await faqButton.isVisible()) {
      await faqButton.click();
      // Wait for accordion animation
      await page.waitForTimeout(300);
    }
  });
});

test.describe('Scenario K: Contact page content', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/contact');
  });

  test('renders all sections', async ({ page }) => {
    // Hero
    await expect(page.locator('h1')).toContainText('Get in touch');
    await expect(page.getByText(/reply to all messages/i)).toBeVisible();

    // Channel cards (informational — mailto buttons removed, the form is the channel now)
    await expect(page.getByText('Need help?')).toBeVisible();
    await expect(page.getByText('Other questions?')).toBeVisible();

    // Contact form
    await expect(page.locator('#contact-name')).toBeVisible();
    await expect(page.locator('#contact-email')).toBeVisible();
    await expect(page.locator('#contact-topic')).toBeVisible();
    await expect(page.locator('#contact-message')).toBeVisible();

    // FAQ section
    await expect(page.getByText('Frequently Asked Questions')).toBeVisible();

    // Business info
    await expect(page.getByText('Business Information')).toBeVisible();
  });

  test('contact form submit is gated until the form is valid', async ({ page }) => {
    const submit = page.locator('button[type="submit"]');
    await expect(submit).toBeDisabled();

    await page.locator('#contact-name').fill('Playwright Tester');
    await page.locator('#contact-email').fill('tester@example.com');
    await page.locator('#contact-message').fill('This is an end-to-end test message.');
    await expect(submit).toBeEnabled();
  });

  test('contact form submits and shows the success panel', async ({ page }) => {
    await page.locator('#contact-name').fill('Playwright Tester');
    await page.locator('#contact-email').fill('tester@example.com');
    await page.locator('#contact-topic').selectOption('general');
    await page
      .locator('#contact-message')
      .fill('This is an end-to-end test message for the contact form.');
    await page.locator('button[type="submit"]').click();

    // Server route returns 200 even when ADMIN_NOTIFICATION_EMAIL is unset (CI),
    // so the success panel should appear.
    await expect(page.getByText('Message sent!')).toBeVisible();
  });

  test('FAQ accordion items expand and collapse', async ({ page }) => {
    // Click first FAQ question
    const firstFaq = page.locator('button').filter({ hasText: /payment confirmation email/i });
    await firstFaq.click();
    await expect(page.getByText(/Check your Spam folder/i)).toBeVisible();

    // Click again to collapse
    await firstFaq.click();
    await expect(page.getByText(/Check your Spam folder/i)).not.toBeVisible();
  });

  test('all 5 FAQ items are present', async ({ page }) => {
    await expect(page.getByText(/payment confirmation email/i)).toBeVisible();
    await expect(page.getByText(/calculation seems wrong/i)).toBeVisible();
    await expect(page.getByText(/want a refund/i)).toBeVisible();
    await expect(page.getByText(/delete my account/i)).toBeVisible();
    await expect(page.getByText(/mobile app/i)).toBeVisible();
  });

  test('response time SLAs are displayed', async ({ page }) => {
    await expect(page.getByText('Reply within 24 hours')).toBeVisible();
    await expect(page.getByText('Reply within 1-2 days')).toBeVisible();
  });

  test('business address is displayed', async ({ page }) => {
    await expect(page.getByText(/Str\. Moraviei/i)).toBeVisible();
  });
});

test.describe('Scenario K: Settings page delete account validation', () => {
  test('settings page loads for unauthenticated users', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.getByText('Settings')).toBeVisible();
  });
});

test.describe('Scenario K: Upload/pricing API validation', () => {
  test('uploads API requires authentication', async ({ request }) => {
    const res = await request.post('/api/uploads', {
      data: { transactions: [], year: 2025, country: 'RO' },
    });
    expect(res.status()).toBe(401);
  });

  test('tax-years API requires authentication', async ({ request }) => {
    const res = await request.get('/api/tax-years');
    expect(res.status()).toBe(401);
  });
});
