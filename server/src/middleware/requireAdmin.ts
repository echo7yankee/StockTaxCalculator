import type { Request, Response, NextFunction } from 'express';

// Operator-only admin gate for internal dashboards (currently the first-party
// analytics page). An account is an admin iff it is authenticated AND its email
// is listed in the ADMIN_EMAILS env var (comma-separated, case-insensitive).
//
// Fails CLOSED: if ADMIN_EMAILS is unset or empty, nobody is an admin. There is
// deliberately NO admin flag on the User model. Admin is purely an env-driven
// allowlist, so granting or revoking an operator never needs a DB write or a
// migration, and the prod DB never carries a privilege bit that could leak.

export function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return adminEmails().includes(email.toLowerCase());
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.isAuthenticated() || !req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  if (!isAdminEmail(req.user.email)) {
    res.status(403).json({ error: 'Admin access required', code: 'ADMIN_REQUIRED' });
    return;
  }
  next();
}
