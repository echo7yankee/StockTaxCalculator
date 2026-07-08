import type { User as PrismaUser } from '@prisma/client';

declare global {
  namespace Express {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface User extends PrismaUser {}
  }
}

declare module 'express-session' {
  interface SessionData {
    // Post-login destination stashed across the Google OAuth round-trip
    // (set on GET /api/auth/google, consumed by the callback handler).
    oauthRedirect?: string;
  }
}
