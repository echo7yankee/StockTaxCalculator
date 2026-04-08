import { test, expect } from '@playwright/test';

// Use a unique email per test run to avoid conflicts with existing accounts
const uniqueId = Date.now();
const TEST_PASSWORD = 'TestPass123!';

test.describe('Signup', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/signup');
  });

  test('renders signup form with all fields', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('Create your account');
    await expect(page.getByPlaceholder('Your name')).toBeVisible();
    await expect(page.getByPlaceholder('you@example.com')).toBeVisible();
    await expect(page.getByPlaceholder('Min. 8 characters')).toBeVisible();
    await expect(page.getByPlaceholder('Repeat your password')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create your account' })).toBeVisible();
    await expect(page.getByText('Continue with Google')).toBeVisible();
  });

  test('blocks submission for short password (browser validation)', async ({ page }) => {
    await page.getByPlaceholder('you@example.com').fill('test@example.com');
    await page.getByPlaceholder('Min. 8 characters').fill('short');
    await page.getByPlaceholder('Repeat your password').fill('short');

    await page.getByRole('button', { name: 'Create your account' }).click();

    // Browser's native minLength validation prevents submission
    await expect(page).toHaveURL(/signup/);
  });

  test('shows client-side error for mismatched passwords', async ({ page }) => {
    await page.getByPlaceholder('you@example.com').fill('test@example.com');
    await page.getByPlaceholder('Min. 8 characters').fill('ValidPass123!');
    await page.getByPlaceholder('Repeat your password').fill('DifferentPass123!');

    await page.getByRole('button', { name: 'Create your account' }).click();

    await expect(page.getByText('Passwords do not match')).toBeVisible();
    await expect(page).toHaveURL(/signup/);
  });

  test('has link to login page', async ({ page }) => {
    await page.getByRole('link', { name: 'Log in' }).click();
    await expect(page).toHaveURL(/login/);
  });
});

// Serial because signup + duplicate test share state, and we want to minimize signup API calls
// to avoid hitting the rate limiter (5 req/15min)
test.describe.serial('Signup flow (serial)', () => {
  const signupEmail = `e2e-signup-${uniqueId}@example.com`;

  test('successful signup redirects to dashboard or pricing', async ({ page }) => {
    await page.goto('/signup');
    await page.getByPlaceholder('Your name').fill('E2E Test User');
    await page.getByPlaceholder('you@example.com').fill(signupEmail);
    await page.getByPlaceholder('Min. 8 characters').fill(TEST_PASSWORD);
    await page.getByPlaceholder('Repeat your password').fill(TEST_PASSWORD);

    await page.getByRole('button', { name: 'Create your account' }).click();

    // Free users get redirected from dashboard to pricing
    await expect(page).toHaveURL(/dashboard|pricing/, { timeout: 10_000 });
    // Header should show avatar (not "Log in" / "Sign up" buttons)
    await expect(page.locator('header').getByText('Log in')).not.toBeVisible();
  });

  test('shows error for duplicate email', async ({ page }) => {
    // Logout first (previous test left us logged in)
    await page.goto('/signup');
    await page.getByPlaceholder('Your name').fill('Duplicate');
    await page.getByPlaceholder('you@example.com').fill(signupEmail);
    await page.getByPlaceholder('Min. 8 characters').fill(TEST_PASSWORD);
    await page.getByPlaceholder('Repeat your password').fill(TEST_PASSWORD);

    await page.getByRole('button', { name: 'Create your account' }).click();

    await expect(page.getByText('An account with this email already exists')).toBeVisible({ timeout: 5_000 });
  });
});

test.describe('Login', () => {
  // Create test account via API to avoid consuming signup rate limit
  const loginEmail = `e2e-login-${uniqueId}@example.com`;

  test.beforeAll(async ({ request }) => {
    await request.post('/api/auth/signup', {
      data: { email: loginEmail, password: TEST_PASSWORD, name: 'Login Test' },
    });
  });

  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
  });

  test('renders login form with forgot password link', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('Welcome back');
    await expect(page.getByPlaceholder('you@example.com')).toBeVisible();
    await expect(page.getByPlaceholder('Enter your password')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Log in' })).toBeVisible();
    await expect(page.getByText('Continue with Google')).toBeVisible();
    await expect(page.getByText('Forgot password?')).toBeVisible();
  });

  test('shows error for wrong password', async ({ page }) => {
    await page.getByPlaceholder('you@example.com').fill(loginEmail);
    await page.getByPlaceholder('Enter your password').fill('WrongPassword123!');

    await page.getByRole('button', { name: 'Log in' }).click();

    await expect(page.getByText('Invalid email or password')).toBeVisible({ timeout: 5_000 });
    await expect(page).toHaveURL(/login/);
  });

  test('shows error for non-existent email', async ({ page }) => {
    await page.getByPlaceholder('you@example.com').fill('doesnotexist@example.com');
    await page.getByPlaceholder('Enter your password').fill(TEST_PASSWORD);

    await page.getByRole('button', { name: 'Log in' }).click();

    await expect(page.getByText('Invalid email or password')).toBeVisible({ timeout: 5_000 });
  });

  test('successful login redirects to dashboard or pricing', async ({ page }) => {
    await page.getByPlaceholder('you@example.com').fill(loginEmail);
    await page.getByPlaceholder('Enter your password').fill(TEST_PASSWORD);

    await page.getByRole('button', { name: 'Log in' }).click();

    // Free users get redirected from dashboard to pricing
    await expect(page).toHaveURL(/dashboard|pricing/, { timeout: 10_000 });
    await expect(page.locator('header').getByText('Log in')).not.toBeVisible();
  });

  test('logout returns to home and shows login button', async ({ page }) => {
    // Login first
    await page.getByPlaceholder('you@example.com').fill(loginEmail);
    await page.getByPlaceholder('Enter your password').fill(TEST_PASSWORD);
    await page.getByRole('button', { name: 'Log in' }).click();
    await expect(page).toHaveURL(/dashboard|pricing/, { timeout: 10_000 });

    // Open avatar menu and logout
    await page.locator('header button[title]').click();
    await page.getByText('Log out').click();

    await expect(page).toHaveURL('/');
    await expect(page.locator('header').getByText('Log in')).toBeVisible();
  });

  test('has link to signup page', async ({ page }) => {
    await page.locator('main').getByRole('link', { name: 'Sign up' }).click();
    await expect(page).toHaveURL(/signup/);
  });

  test('forgot password link navigates to forgot-password page', async ({ page }) => {
    await page.getByText('Forgot password?').click();
    await expect(page).toHaveURL(/forgot-password/);
    await expect(page.locator('h1')).toContainText('Reset your password');
  });
});

test.describe('Forgot Password', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/forgot-password');
  });

  test('renders forgot password form', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('Reset your password');
    await expect(page.getByPlaceholder('you@example.com')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Send reset link' })).toBeVisible();
    await expect(page.getByText('Back to login')).toBeVisible();
  });

  test('submitting email shows confirmation message', async ({ page }) => {
    await page.getByPlaceholder('you@example.com').fill('test@example.com');
    await page.getByRole('button', { name: 'Send reset link' }).click();
    await expect(page.getByText('Check your email')).toBeVisible({ timeout: 5_000 });
  });

  test('back to login link works', async ({ page }) => {
    await page.getByRole('link', { name: 'Back to login' }).click();
    await expect(page).toHaveURL(/login/);
  });
});

test.describe('Reset Password Page', () => {
  test('shows invalid link message without token', async ({ page }) => {
    await page.goto('/reset-password');
    await expect(page.getByText('Invalid reset link')).toBeVisible();
    await expect(page.getByText('Request a new link')).toBeVisible();
  });

  test('shows reset form with valid token parameter', async ({ page }) => {
    await page.goto('/reset-password?token=fake-token-for-test');
    await expect(page.locator('h1')).toContainText('Set new password');
    await expect(page.getByRole('button', { name: 'Reset password' })).toBeVisible();
  });

  test('shows error for expired/invalid token on submit', async ({ page }) => {
    await page.goto('/reset-password?token=invalid-token');
    await page.getByPlaceholder('At least 8 characters').fill('NewPassword123!');
    await page.getByPlaceholder('Re-enter your new password').fill('NewPassword123!');
    await page.getByRole('button', { name: 'Reset password' }).click();
    await expect(page.getByText(/invalid|expired/i)).toBeVisible({ timeout: 5_000 });
  });
});

test.describe('Password Reset API', () => {
  const resetEmail = `e2e-reset-${uniqueId}@example.com`;

  test.beforeAll(async ({ request }) => {
    await request.post('/api/auth/signup', {
      data: { email: resetEmail, password: TEST_PASSWORD, name: 'Reset Test' },
    });
  });

  test('forgot-password endpoint returns success for any email (no enumeration)', async ({ request }) => {
    // Existing email
    const res1 = await request.post('/api/auth/forgot-password', {
      data: { email: resetEmail },
    });
    expect(res1.status()).toBe(200);
    const body1 = await res1.json();
    expect(body1.ok).toBe(true);

    // Non-existing email (should still return success)
    const res2 = await request.post('/api/auth/forgot-password', {
      data: { email: 'nonexistent@example.com' },
    });
    expect(res2.status()).toBe(200);
    const body2 = await res2.json();
    expect(body2.ok).toBe(true);
  });

  test('reset-password endpoint rejects invalid token', async ({ request }) => {
    const res = await request.post('/api/auth/reset-password', {
      data: { token: 'invalid-token', password: 'NewPassword123!' },
    });
    expect(res.status()).toBe(400);
  });

  test('change-password endpoint requires authentication', async ({ request }) => {
    const res = await request.post('/api/auth/change-password', {
      data: { currentPassword: TEST_PASSWORD, newPassword: 'NewPassword123!' },
    });
    expect(res.status()).toBe(401);
  });
});
