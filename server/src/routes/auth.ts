import { Router } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { z } from 'zod/v4';
import passport from '../config/passport.js';
import prisma from '../lib/prisma.js';

const signupSchema = z.object({
  email: z.email(),
  password: z.string().min(8).max(128),
  name: z.string().max(100).optional(),
});

const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});

const forgotPasswordSchema = z.object({
  email: z.email(),
});

const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8).max(128),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(128),
});

const isProd = process.env.NODE_ENV === 'production';

const signupLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isProd ? 5 : 50,
  message: { error: 'Too many signup attempts, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isProd ? 5 : 100,
  message: { error: 'Too many login attempts, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

const forgotPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isProd ? 3 : 50,
  message: { error: 'Too many password reset requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

export const authRouter = Router();

function sanitizeUser(user: Express.User) {
  return { id: user.id, email: user.email, name: user.name, plan: user.plan };
}

function formatZodErrors(error: z.core.$ZodError) {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.');
    if (key && !fields[key]) {
      fields[key] = issue.message;
    }
  }
  return { error: error.issues[0].message, fields };
}

// POST /api/auth/signup
authRouter.post('/signup', signupLimiter, async (req, res, next) => {
  try {
    const parsed = signupSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json(formatZodErrors(parsed.error));
      return;
    }

    const { email, password, name } = parsed.data;
    const normalizedEmail = email.toLowerCase().trim();

    // Check existing user
    const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existing?.passwordHash) {
      res.status(409).json({ error: 'An account with this email already exists', fields: { email: 'An account with this email already exists' } });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);

    let user;
    if (existing) {
      // Google-only user adding a password (account linking)
      user = await prisma.user.update({
        where: { id: existing.id },
        data: { passwordHash, name: existing.name || name || null },
      });
    } else {
      user = await prisma.user.create({
        data: { email: normalizedEmail, name: name || null, passwordHash, plan: 'free' },
      });
    }

    // Auto-login after signup
    req.login(user, (err) => {
      if (err) return next(err);
      res.status(201).json({ user: sanitizeUser(user) });
    });
  } catch (err) {
    console.error('Signup error:', err);
    res.status(500).json({ error: 'Signup failed' });
  }
});

// POST /api/auth/login
authRouter.post('/login', loginLimiter, (req, res, next) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(formatZodErrors(parsed.error));
    return;
  }

  passport.authenticate('local', (err: Error | null, user: Express.User | false, info: { message: string }) => {
    if (err) return next(err);
    if (!user) {
      res.status(401).json({ error: info?.message || 'Invalid credentials' });
      return;
    }
    req.login(user, (loginErr) => {
      if (loginErr) return next(loginErr);
      res.json({ user: sanitizeUser(user) });
    });
  })(req, res, next);
});

// POST /api/auth/logout
authRouter.post('/logout', (req, res, next) => {
  req.logout((err) => {
    if (err) return next(err);
    req.session.destroy((destroyErr) => {
      if (destroyErr) console.error('Session destroy error:', destroyErr);
      res.clearCookie('connect.sid');
      res.json({ ok: true });
    });
  });
});

// GET /api/auth/me — returns current user or null (never 401)
authRouter.get('/me', (req, res) => {
  if (req.isAuthenticated() && req.user) {
    res.json({ user: sanitizeUser(req.user) });
  } else {
    res.json({ user: null });
  }
});

// DELETE /api/auth/delete-account — permanently delete user and all data
authRouter.post('/delete-account', async (req, res) => {
  if (!req.isAuthenticated() || !req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  try {
    const userId = req.user.id;

    // Prisma cascade deletes handle TaxYear, CsvUpload, Transaction, TaxCalculation, SecurityCalculation
    await prisma.user.delete({ where: { id: userId } });

    // Destroy session and clear cookie
    req.logout((err) => {
      if (err) console.error('Logout error during account deletion:', err);
      req.session.destroy((destroyErr) => {
        if (destroyErr) console.error('Session destroy error:', destroyErr);
        res.clearCookie('connect.sid');
        res.json({ ok: true });
      });
    });
  } catch (err) {
    console.error('Delete account error:', err);
    res.status(500).json({ error: 'Failed to delete account' });
  }
});

// GET /api/auth/export-data — download all user data as JSON
authRouter.get('/export-data', async (req, res) => {
  if (!req.isAuthenticated() || !req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        email: true,
        name: true,
        plan: true,
        createdAt: true,
        updatedAt: true,
        taxYears: {
          include: {
            csvUploads: {
              select: {
                id: true,
                broker: true,
                filename: true,
                uploadedAt: true,
                processed: true,
                rowCount: true,
              },
            },
            transactions: {
              select: {
                id: true,
                action: true,
                transactionDate: true,
                isin: true,
                ticker: true,
                securityName: true,
                shares: true,
                pricePerShare: true,
                priceCurrency: true,
                totalAmountOriginal: true,
                exchangeRateToLocal: true,
                totalAmountLocal: true,
                withholdingTaxOriginal: true,
                withholdingTaxCurrency: true,
                withholdingTaxLocal: true,
              },
            },
            calculation: {
              include: {
                securities: true,
              },
            },
          },
        },
      },
    });

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="investax-data-${user.id}.json"`);
    res.json({
      exportedAt: new Date().toISOString(),
      user,
    });
  } catch (err) {
    console.error('Export data error:', err);
    res.status(500).json({ error: 'Failed to export data' });
  }
});

// POST /api/auth/forgot-password — request password reset
authRouter.post('/forgot-password', forgotPasswordLimiter, async (req, res) => {
  try {
    const parsed = forgotPasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json(formatZodErrors(parsed.error));
      return;
    }

    const email = parsed.data.email.toLowerCase().trim();

    // Always return success to prevent email enumeration
    const successResponse = { ok: true, message: 'If an account with that email exists, a password reset link has been sent.' };

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      res.json(successResponse);
      return;
    }

    // Google-only users can't reset password (they don't have one)
    if (!user.passwordHash) {
      res.json(successResponse);
      return;
    }

    // Invalidate any existing tokens for this user
    await prisma.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    });

    // Generate a secure random token
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await prisma.passwordResetToken.create({
      data: { userId: user.id, token, expiresAt },
    });

    // TODO: Send email via Resend when email infrastructure is set up
    // For now, log the reset link in non-production environments
    const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
    const resetUrl = `${clientUrl}/reset-password?token=${token}`;
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[DEV] Password reset link for ${email}: ${resetUrl}`);
    }

    res.json(successResponse);
  } catch (err) {
    console.error('Forgot password error:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// POST /api/auth/reset-password — set new password with token
authRouter.post('/reset-password', async (req, res) => {
  try {
    const parsed = resetPasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json(formatZodErrors(parsed.error));
      return;
    }

    const { token, password } = parsed.data;

    const resetToken = await prisma.passwordResetToken.findUnique({
      where: { token },
      include: { user: true },
    });

    if (!resetToken || resetToken.usedAt || resetToken.expiresAt < new Date()) {
      res.status(400).json({ error: 'This reset link is invalid or has expired. Please request a new one.' });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);

    // Update password and mark token as used
    await prisma.$transaction([
      prisma.user.update({
        where: { id: resetToken.userId },
        data: { passwordHash },
      }),
      prisma.passwordResetToken.update({
        where: { id: resetToken.id },
        data: { usedAt: new Date() },
      }),
    ]);

    // Invalidate all sessions for this user (force re-login with new password)
    await prisma.session.deleteMany({
      where: {
        data: { contains: resetToken.userId },
      },
    });

    res.json({ ok: true, message: 'Password has been reset successfully. You can now log in with your new password.' });
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// POST /api/auth/change-password — change password (requires auth)
authRouter.post('/change-password', async (req, res) => {
  if (!req.isAuthenticated() || !req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  try {
    const parsed = changePasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json(formatZodErrors(parsed.error));
      return;
    }

    const { currentPassword, newPassword } = parsed.data;
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });

    if (!user?.passwordHash) {
      res.status(400).json({ error: 'Your account uses Google sign-in. You cannot change a password.' });
      return;
    }

    const isMatch = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isMatch) {
      res.status(400).json({ error: 'Current password is incorrect', fields: { currentPassword: 'Current password is incorrect' } });
      return;
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash },
    });

    res.json({ ok: true, message: 'Password changed successfully' });
  } catch (err) {
    console.error('Change password error:', err);
    res.status(500).json({ error: 'Failed to change password' });
  }
});

// Google OAuth routes (only if configured)
if (process.env.GOOGLE_CLIENT_ID) {
  authRouter.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

  authRouter.get(
    '/google/callback',
    passport.authenticate('google', { failureRedirect: `${process.env.CLIENT_URL || 'http://localhost:5173'}/login?error=google` }),
    (_req, res) => {
      res.redirect(`${process.env.CLIENT_URL || 'http://localhost:5173'}/dashboard`);
    },
  );
}
