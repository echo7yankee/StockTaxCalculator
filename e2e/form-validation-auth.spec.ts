import { test, expect } from '@playwright/test';

/**
 * Scenario I — Auth Form Validation
 *
 * Tests inline validation, blur behavior, password UX (show/hide, strength meter),
 * common password rejection, and accessibility attributes on all auth forms.
 */

test.describe('Scenario I: Signup form validation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/signup');
  });

  test('shows required errors on empty submit', async ({ page }) => {
    await page.getByRole('button', { name: 'Create your account' }).click();

    await expect(page.getByText('This field is required').first()).toBeVisible({ timeout: 3000 });
    // Should stay on signup
    await expect(page).toHaveURL(/signup/);
  });

  test('shows invalid email error for bad format', async ({ page }) => {
    const emailInput = page.getByPlaceholder('you@example.com');
    await emailInput.fill('notanemail');
    await emailInput.blur();

    await expect(page.getByText('Please enter a valid email address')).toBeVisible({ timeout: 3000 });
  });

  test('clears email error when fixed on blur', async ({ page }) => {
    const emailInput = page.getByPlaceholder('you@example.com');
    // Trigger error
    await emailInput.fill('bad');
    await emailInput.blur();
    await expect(page.getByText('Please enter a valid email address')).toBeVisible({ timeout: 3000 });

    // Fix it
    await emailInput.fill('valid@example.com');
    await emailInput.blur();
    await expect(page.getByText('Please enter a valid email address')).not.toBeVisible();
  });

  test('shows short password error', async ({ page }) => {
    const passwordInput = page.getByPlaceholder('Min. 8 characters');
    await passwordInput.fill('short');
    await passwordInput.blur();

    await expect(page.getByText('Password must be at least 8 characters')).toBeVisible({ timeout: 3000 });
  });

  test('rejects common password', async ({ page }) => {
    const passwordInput = page.getByPlaceholder('Min. 8 characters');
    await passwordInput.fill('password123');
    await passwordInput.blur();

    await expect(page.getByText(/too common/)).toBeVisible({ timeout: 3000 });
  });

  test('password show/hide toggle works', async ({ page }) => {
    const passwordInput = page.locator('#signup-password');
    await passwordInput.fill('TestPass123!');

    // Initially password type
    await expect(passwordInput).toHaveAttribute('type', 'password');

    // Click show button
    const toggleBtn = page.locator('#signup-password').locator('..').getByRole('button', { name: 'Show password' });
    await toggleBtn.click();
    await expect(passwordInput).toHaveAttribute('type', 'text');

    // Click hide button
    const hideBtn = page.locator('#signup-password').locator('..').getByRole('button', { name: 'Hide password' });
    await hideBtn.click();
    await expect(passwordInput).toHaveAttribute('type', 'password');
  });

  test('password strength meter shows weak for short password', async ({ page }) => {
    await page.getByPlaceholder('Min. 8 characters').fill('abcdefgh');
    await expect(page.getByText('Weak password')).toBeVisible();
  });

  test('password strength meter shows medium for decent password', async ({ page }) => {
    await page.getByPlaceholder('Min. 8 characters').fill('Abcdefgh1');
    await expect(page.getByText('Medium strength')).toBeVisible();
  });

  test('password strength meter shows strong for complex password', async ({ page }) => {
    await page.getByPlaceholder('Min. 8 characters').fill('C0mpl3x!Pass#2026');
    await expect(page.getByText('Strong password')).toBeVisible();
  });

  test('shows mismatch error when confirm password differs', async ({ page }) => {
    await page.getByPlaceholder('Min. 8 characters').fill('ValidPass123!');
    const confirmInput = page.getByPlaceholder('Repeat your password');
    await confirmInput.fill('DifferentPass123!');
    await confirmInput.blur();

    await expect(page.getByText('Passwords do not match')).toBeVisible({ timeout: 3000 });
  });

  test('email field has required aria attributes', async ({ page }) => {
    const emailInput = page.locator('#signup-email');
    await expect(emailInput).toHaveAttribute('aria-required', 'true');

    // Trigger error
    await emailInput.fill('bad');
    await emailInput.blur();
    await expect(emailInput).toHaveAttribute('aria-invalid', 'true');
  });

  test('button shows loading state during submission', async ({ page }) => {
    const uniqueId = Date.now();
    await page.getByPlaceholder('you@example.com').fill(`scenario-i-${uniqueId}@example.com`);
    await page.getByPlaceholder('Min. 8 characters').fill('ValidPass123!');
    await page.getByPlaceholder('Repeat your password').fill('ValidPass123!');

    const btn = page.getByRole('button', { name: 'Create your account' });
    await btn.click();

    // Button should show loading text briefly
    await expect(page.getByText('Creating account...')).toBeVisible({ timeout: 5000 });
  });
});

test.describe('Scenario I: Login form validation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
  });

  test('shows required error for empty email on submit', async ({ page }) => {
    await page.getByRole('button', { name: 'Log in' }).click();
    await expect(page.getByText('This field is required')).toBeVisible({ timeout: 3000 });
    await expect(page).toHaveURL(/login/);
  });

  test('shows invalid email error on blur', async ({ page }) => {
    const emailInput = page.getByPlaceholder('you@example.com');
    await emailInput.fill('notvalid');
    await emailInput.blur();

    await expect(page.getByText('Please enter a valid email address')).toBeVisible({ timeout: 3000 });
  });

  test('shows required error for empty password on submit', async ({ page }) => {
    await page.getByPlaceholder('you@example.com').fill('test@example.com');
    await page.getByRole('button', { name: 'Log in' }).click();

    await expect(page.getByText('This field is required')).toBeVisible({ timeout: 3000 });
  });

  test('password show/hide toggle works on login', async ({ page }) => {
    const passwordInput = page.locator('#login-password');
    await passwordInput.fill('TestPass123!');

    await expect(passwordInput).toHaveAttribute('type', 'password');

    await page.locator('#login-password').locator('..').getByRole('button', { name: 'Show password' }).click();
    await expect(passwordInput).toHaveAttribute('type', 'text');
  });

  test('login button shows loading state', async ({ page }) => {
    await page.getByPlaceholder('you@example.com').fill('test@example.com');
    await page.getByPlaceholder('Enter your password').fill('WrongPassword123!');

    await page.getByRole('button', { name: 'Log in' }).click();

    // Should show loading text
    await expect(page.getByText('Logging in...')).toBeVisible({ timeout: 3000 });
  });

  test('Google OAuth error displays on login page', async ({ page }) => {
    await page.goto('/login?error=google');
    await expect(page.locator('[role="alert"]')).toBeVisible({ timeout: 3000 });
  });
});

test.describe('Scenario I: Forgot password form validation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/forgot-password');
  });

  test('shows required error for empty email on submit', async ({ page }) => {
    await page.getByRole('button', { name: 'Send reset link' }).click();
    await expect(page.getByText('This field is required')).toBeVisible({ timeout: 3000 });
  });

  test('shows invalid email error for bad format', async ({ page }) => {
    const emailInput = page.getByPlaceholder('you@example.com');
    await emailInput.fill('notanemail');
    await emailInput.blur();

    await expect(page.getByText('Please enter a valid email address')).toBeVisible({ timeout: 3000 });
  });

  test('clears error when valid email entered', async ({ page }) => {
    const emailInput = page.getByPlaceholder('you@example.com');
    await emailInput.fill('bad');
    await emailInput.blur();
    await expect(page.getByText('Please enter a valid email address')).toBeVisible({ timeout: 3000 });

    await emailInput.fill('valid@example.com');
    await emailInput.blur();
    await expect(page.getByText('Please enter a valid email address')).not.toBeVisible();
  });

  test('shows loading state while submitting', async ({ page }) => {
    await page.getByPlaceholder('you@example.com').fill('test@example.com');
    await page.getByRole('button', { name: 'Send reset link' }).click();

    // Should show loading or transition to confirmation
    await expect(page.getByText(/Sending|Check your email/)).toBeVisible({ timeout: 5000 });
  });
});

test.describe('Scenario I: Reset password form validation', () => {
  test('shows mismatch error for different passwords', async ({ page }) => {
    await page.goto('/reset-password?token=fake-token');
    await page.getByPlaceholder('At least 8 characters').fill('NewPassword123!');
    await page.getByPlaceholder('Re-enter your new password').fill('DifferentPassword123!');
    await page.getByRole('button', { name: 'Reset password' }).click();

    await expect(page.getByText('Passwords do not match')).toBeVisible({ timeout: 3000 });
  });

  test('shows short password error', async ({ page }) => {
    await page.goto('/reset-password?token=fake-token');
    const passwordInput = page.getByPlaceholder('At least 8 characters');
    await passwordInput.fill('short');
    await passwordInput.blur();

    await expect(page.getByText('Password must be at least 8 characters')).toBeVisible({ timeout: 3000 });
  });
});
