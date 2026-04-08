import session from 'express-session';
import { PrismaSessionStore } from '@quixo3/prisma-session-store';
import type { Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma.js';

export const sessionMiddleware = session({
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
  },
  secret: (() => {
    const secret = process.env.SESSION_SECRET;
    if (!secret && process.env.NODE_ENV === 'production') {
      throw new Error('SESSION_SECRET must be set in production');
    }
    return secret || 'dev-fallback-secret';
  })(),
  resave: false,
  saveUninitialized: false,
  rolling: true, // Renew session expiry on each request (sliding window)
  store: new PrismaSessionStore(prisma, {
    checkPeriod: 2 * 60 * 1000, // prune expired sessions every 2 min
    dbRecordIdIsSessionId: true,
  }),
});

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (req.isAuthenticated()) return next();
  res.status(401).json({ error: 'Authentication required' });
}
