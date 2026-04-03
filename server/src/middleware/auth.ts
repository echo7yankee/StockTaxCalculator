import session from 'express-session';
import { PrismaSessionStore } from '@quixo3/prisma-session-store';
import type { Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma.js';

export const sessionMiddleware = session({
  cookie: {
    httpOnly: true,
    secure: false, // set true in production with HTTPS
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  },
  secret: process.env.SESSION_SECRET || 'dev-fallback-secret',
  resave: false,
  saveUninitialized: false,
  store: new PrismaSessionStore(prisma, {
    checkPeriod: 2 * 60 * 1000, // prune expired sessions every 2 min
    dbRecordIdIsSessionId: true,
  }),
});

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (req.isAuthenticated()) return next();
  res.status(401).json({ error: 'Authentication required' });
}
