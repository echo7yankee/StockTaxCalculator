import { Router } from 'express';
import bcrypt from 'bcryptjs';
import passport from '../config/passport.js';
import prisma from '../lib/prisma.js';

export const authRouter = Router();

function sanitizeUser(user: Express.User) {
  return { id: user.id, email: user.email, name: user.name, plan: user.plan };
}

// POST /api/auth/signup
authRouter.post('/signup', async (req, res, next) => {
  try {
    const { email, password, name } = req.body;

    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required' });
      return;
    }

    if (password.length < 8) {
      res.status(400).json({ error: 'Password must be at least 8 characters' });
      return;
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Check existing user
    const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existing?.passwordHash) {
      res.status(409).json({ error: 'An account with this email already exists' });
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
authRouter.post('/login', (req, res, next) => {
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

// Google OAuth routes (only if configured)
if (process.env.GOOGLE_CLIENT_ID) {
  authRouter.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

  authRouter.get(
    '/google/callback',
    passport.authenticate('google', { failureRedirect: '/login?error=google' }),
    (_req, res) => {
      res.redirect('/dashboard');
    },
  );
}
