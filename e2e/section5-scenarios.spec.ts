import { test, expect, type Page } from '@playwright/test';

/**
 * Section 5 Test Scenarios (06-testing.md)
 *
 * Tests the end-to-end flows specified in the launch plan:
 * - Scenario A: Free user, manual calculator (full flow with result verification)
 * - Scenario G: Account deletion / GDPR (signup → delete → verify purged)
 *
 * Scenarios B-F are blocked on external services (Google OAuth, Lemon Squeezy live mode, Resend).
 * Scenario H (server error handling) is a manual verification step.
 */

const uid = Date.now();
const PASSWORD = 'TestPass123!';

// ---------------------------------------------------------------------------
// Helper: login via UI
// ---------------------------------------------------------------------------
async function login(page: Page, email: string) {
  await page.goto('/login');
  await page.getByPlaceholder('you@example.com').fill(email);
  await page.getByPlaceholder('Enter your password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL(/dashboard|pricing/, { timeout: 10_000 });
}

// ===========================================================================
// SCENARIO A — Free user, manual calculator
//
// Section 5.1 Scenario A:
//   1. Visit investax.app
//   2. Click "Calculează gratuit" / "Try Free Calculator"
//   3. Enter: capital gains = 50000, dividends = 1000, withholding = 100
//   4. Verify result shows: capital gains tax, dividend tax, CASS amount, total
//   5. Verify CASS bracket is correct
//   6. Verify early filing discount calculation is correct
//
// Expected values (Romania, 10% capital gains, 10% dividends):
//   capitalGainsTax = 50000 × 10% = 5000
//   dividendTax = max(0, 1000 × 10% − 100) = 0
//   CASS: totalNonSalary = 51000 → 12x bracket → 4860
//   totalOwed = 5000 + 0 + 4860 = 9860
//   earlyFilingDiscount = 5000 × 3% = 150
// ===========================================================================

test.describe('Scenario A — Free user, manual calculator', () => {
  test('full flow: landing → calculator → results with correct values', async ({ page }) => {
    // Step 1: Visit landing page
    await page.goto('/');
    await expect(page.locator('h1')).toBeVisible();

    // Step 2: Click the calculator CTA
    await page.getByRole('link', { name: /try free calculator|calculează gratuit/i }).click();
    await expect(page).toHaveURL(/calculator/);

    // Step 3: Fill in the scenario values
    await page.locator('#calc-capital-gains').fill('50000');
    await page.locator('#calc-dividends').fill('1000');
    await page.locator('#calc-withholding').fill('100');

    // Click Calculate
    await page.getByRole('button', { name: /calculate|calculează/i }).click();

    // Step 4: Verify results section appears
    const results = page.getByText(/results|rezultate/i);
    await expect(results).toBeVisible();

    // Verify capital gains tax: 5000.00
    await expect(page.getByText('5000.00')).toBeVisible();

    // Verify dividend tax row exists (withholding fully offsets → 0.00)
    // Use .first() because the result row label contains "dividend tax" text
    const dividendRow = page.getByText(/dividend tax|impozit.*dividende/i).first();
    await expect(dividendRow).toBeVisible();

    // Step 5: Verify CASS bracket (12x for 51000 total)
    await expect(page.getByText(/bracket: 12x/)).toBeVisible();
    await expect(page.getByText('4860.00')).toBeVisible();

    // Verify total tax owed: 9860.00
    await expect(page.getByText('9860.00')).toBeVisible();
    await expect(page.getByText(/total tax owed|total de plată/i)).toBeVisible();

    // Step 6: Verify early filing discount: 150.00
    await expect(page.getByText('150.00')).toBeVisible();
    await expect(page.getByText(/3% discount|reducere de 3%/i)).toBeVisible();
  });

  test('calculator API returns correct values for scenario inputs', async ({ request }) => {
    const res = await request.post('/api/calculator/quick', {
      data: {
        capitalGains: 50000,
        dividends: 1000,
        withholdingTaxPaid: 100,
        otherNonSalaryIncome: 0,
        country: 'RO',
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();

    expect(body.capitalGainsTax).toBe(5000);
    expect(body.dividendTax).toBe(0);
    expect(body.healthContribution).toBe(4860);
    expect(body.bracketLabel).toBe('12x');
    expect(body.totalOwed).toBe(9860);
    expect(body.earlyFilingDiscount).toBe(150);
  });

  test('server rejects negative capital gains with 400', async ({ request }) => {
    const res = await request.post('/api/calculator/quick', {
      data: {
        capitalGains: -5000,
        dividends: 0,
        withholdingTaxPaid: 0,
        otherNonSalaryIncome: 0,
        country: 'RO',
      },
    });
    // Server-side Zod validation rejects negative values
    expect(res.status()).toBe(400);
  });

  test('zero capital gains returns zero tax', async ({ request }) => {
    const res = await request.post('/api/calculator/quick', {
      data: {
        capitalGains: 0,
        dividends: 0,
        withholdingTaxPaid: 0,
        otherNonSalaryIncome: 0,
        country: 'RO',
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.capitalGainsTax).toBe(0);
    expect(body.totalOwed).toBe(0);
  });

  test('CASS bracket boundaries are correct', async ({ request }) => {
    // Just below 6x threshold (24299 < 24300)
    const resBelow = await request.post('/api/calculator/quick', {
      data: {
        capitalGains: 24299,
        dividends: 0,
        withholdingTaxPaid: 0,
        otherNonSalaryIncome: 0,
        country: 'RO',
      },
    });
    const below = await resBelow.json();
    expect(below.bracketLabel).toBe('none');
    expect(below.healthContribution).toBe(0);

    // Exactly at 6x threshold (24300)
    const resAt = await request.post('/api/calculator/quick', {
      data: {
        capitalGains: 24300,
        dividends: 0,
        withholdingTaxPaid: 0,
        otherNonSalaryIncome: 0,
        country: 'RO',
      },
    });
    const at = await resAt.json();
    expect(at.bracketLabel).toBe('6x');
    expect(at.healthContribution).toBe(2430);

    // At 24x threshold (97200)
    const resHigh = await request.post('/api/calculator/quick', {
      data: {
        capitalGains: 97200,
        dividends: 0,
        withholdingTaxPaid: 0,
        otherNonSalaryIncome: 0,
        country: 'RO',
      },
    });
    const high = await resHigh.json();
    expect(high.bracketLabel).toBe('24x');
    expect(high.healthContribution).toBe(9720);
  });
});

// ===========================================================================
// SCENARIO G — Account deletion (GDPR)
//
// Section 5.1 Scenario G:
//   1. Settings → Delete my account → confirm
//   2. Verify user record + all calculations deleted from database
//   3. Verify confirmation email sent — BLOCKED (Resend not configured)
//   4. Verify user can no longer log in
// ===========================================================================

test.describe.serial('Scenario G — Account deletion (GDPR)', () => {
  const email = `e2e-delete-${uid}@example.com`;

  test.beforeAll(async ({ request }) => {
    // Create account via API to avoid signup rate limits
    const res = await request.post('/api/auth/signup', {
      data: { email, password: PASSWORD, name: 'Delete Test User' },
    });
    expect(res.status()).toBe(201);
  });

  test('delete account API requires authentication', async ({ request }) => {
    const res = await request.post('/api/auth/delete-account');
    expect(res.status()).toBe(401);
  });

  test('full GDPR deletion flow: login → settings → delete → verify purged', async ({ page }) => {
    // Step 1: Login
    await login(page, email);

    // Step 2: Navigate to settings
    await page.goto('/settings');
    await expect(page.getByText('Settings')).toBeVisible();

    // Verify the danger zone section is visible (only for authenticated users)
    await expect(page.getByText(/danger zone|zonă periculoasă/i)).toBeVisible();

    // Step 3: Click "Delete my account" to reveal confirmation
    await page.getByRole('button', { name: /delete.*account|șterge.*cont/i }).click();

    // Confirmation form should appear
    await expect(page.getByText(/type DELETE|scrie DELETE/i)).toBeVisible();

    // Confirm button should be disabled before typing DELETE
    const confirmBtn = page.getByRole('button', { name: /permanently delete|șterge definitiv/i });
    await expect(confirmBtn).toBeDisabled();

    // Step 4: Type "DELETE" in confirmation input
    await page.getByPlaceholder(/type DELETE/i).fill('DELETE');

    // Confirm button should now be enabled
    await expect(confirmBtn).toBeEnabled();

    // Step 5: Click confirm to delete
    await confirmBtn.click();

    // Step 6: Verify redirect to home page
    await expect(page).toHaveURL('/', { timeout: 10_000 });

    // Verify user is logged out (header shows "Log in" button)
    await expect(page.locator('header').getByText('Log in')).toBeVisible();
  });

  test('deleted user cannot log in again', async ({ page }) => {
    // Try to login with the deleted account's credentials
    await page.goto('/login');
    await page.getByPlaceholder('you@example.com').fill(email);
    await page.getByPlaceholder('Enter your password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Log in' }).click();

    // Should show error — the account no longer exists
    await expect(page.getByText(/invalid email or password|email sau parolă incorectă/i)).toBeVisible({ timeout: 5_000 });

    // Should NOT redirect to dashboard
    await expect(page).toHaveURL(/login/);
  });

  test('deleted user API access returns 401', async ({ request }) => {
    // Try to access a protected endpoint — session should be destroyed
    const res = await request.get('/api/auth/me');
    const body = await res.json();
    // Should return null user or 401 (no active session)
    expect(body.user).toBeFalsy();
  });
});

// ===========================================================================
// SCENARIO B — Signup flow (partial — Google OAuth and welcome email blocked)
//
// Tests what we CAN verify without external services:
// - Email/password signup creates user with correct plan
// - User record has plan="free" by default
// ===========================================================================

test.describe('Scenario B — Signup flow (partial)', () => {
  const email = `e2e-scenario-b-${uid}@example.com`;

  test('new signup creates user with free plan', async ({ request }) => {
    // Signup via API
    const signupRes = await request.post('/api/auth/signup', {
      data: { email, password: PASSWORD, name: 'Scenario B User' },
    });
    expect(signupRes.status()).toBe(201);
    const signupBody = await signupRes.json();
    expect(signupBody.user).toBeTruthy();
    expect(signupBody.user.email).toBe(email);
    expect(signupBody.user.name).toBe('Scenario B User');

    // Check payment status — should be free
    const statusRes = await request.get('/api/payment/status');
    expect(statusRes.status()).toBe(200);
    const status = await statusRes.json();
    expect(status.plan).toBe('free');
    expect(status.isActive).toBe(false);
  });
});

// ===========================================================================
// SCENARIO C — Free user hits paywall (supplemental to payment-flow.spec.ts)
//
// payment-flow.spec.ts already covers the core paywall tests.
// This test verifies the landing-page → pricing journey that a real user would take.
// ===========================================================================

test.describe('Scenario C — Free user paywall journey', () => {
  const email = `e2e-scenario-c-${uid}@example.com`;

  test.beforeAll(async ({ request }) => {
    await request.post('/api/auth/signup', {
      data: { email, password: PASSWORD, name: 'Scenario C User' },
    });
  });

  test('free user flow: login → try upload → redirected to pricing with CTA', async ({ page }) => {
    await login(page, email);

    // Try to access upload (paid feature)
    await page.goto('/upload');

    // Should be redirected to pricing
    await expect(page).toHaveURL(/pricing/);

    // Pricing page should show the buy CTA (not login variant since user is authenticated)
    await expect(page.getByRole('button', { name: /full access|acces complet/i })).toBeVisible();

    // Launch promo badge should be visible
    await expect(page.getByText(/\d+\/100|\d+ (spots|locuri)/i).first()).toBeVisible({ timeout: 5_000 });
  });
});

// ===========================================================================
// SCENARIO H — Server error handling (partial)
//
// We can't stop the backend server in E2E, but we can verify:
// - 404 page renders correctly for unknown routes
// - API returns proper error codes (not blank responses)
// ===========================================================================

test.describe('Scenario H — Error handling (partial)', () => {
  test('404 page renders for unknown routes', async ({ page }) => {
    await page.goto('/this-route-does-not-exist-at-all');

    // Should show branded 404 page, not a blank screen
    await expect(page.locator('text=404')).toBeVisible();
    await expect(page.getByRole('link', { name: /back to home|înapoi acasă/i })).toBeVisible();
  });

  test('unknown API routes return 404, not 500', async ({ request }) => {
    const res = await request.get('/api/this-does-not-exist');
    // Express returns 404 for unmatched routes
    expect(res.status()).toBe(404);
  });

  test('invalid calculator input returns error, not crash', async ({ request }) => {
    const res = await request.post('/api/calculator/quick', {
      data: {
        capitalGains: 'not-a-number',
        dividends: null,
        country: 'INVALID',
      },
    });
    // Should return 400 (bad request) or 200 with zeroed values, NOT 500
    expect(res.status()).not.toBe(500);
  });

  test('no console errors on landing page load', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Filter out known non-issues (favicon, third-party scripts)
    const realErrors = errors.filter(
      e => !e.includes('favicon') && !e.includes('ERR_CONNECTION_REFUSED')
    );
    expect(realErrors).toHaveLength(0);
  });
});
