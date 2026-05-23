import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import express from 'express';
import session from 'express-session';
import bcrypt from 'bcryptjs';
import { Server } from 'http';
import prisma from '../../lib/prisma.js';

// Mock the email service before importing the router so signup and forgot-password
// pick up the mocked binding. auth.ts and config/passport.ts both import this module;
// vi.mock keys on the resolved path, so every importer in the graph gets the mock.
const sendWelcomeEmailMock = vi.fn().mockResolvedValue(undefined);
const sendPasswordResetEmailMock = vi.fn().mockResolvedValue(undefined);
vi.mock('../../services/email.js', () => ({
  sendWelcomeEmail: sendWelcomeEmailMock,
  sendPasswordResetEmail: sendPasswordResetEmailMock,
  pickLanguage: () => 'ro',
}));

const { authRouter } = await import('../auth.js');
const { default: passport } = await import('../../config/passport.js');

type ApiResponse = Awaited<ReturnType<typeof fetch>>;

let server: Server;
// Listen on an OS-assigned free port so this file can never collide with another
// server test file's hardcoded port. BASE is filled in once the server is listening.
let BASE = '';

// Every test user shares this email prefix so cleanup deletes them in one query
// without touching other test files' fixtures. PasswordResetToken rows cascade.
const PREFIX = 'authtest-';
// Cost 8 for test-only seeding. bcrypt.compare reads the cost from the hash, so a
// login against a cost-8 hash still works; this just keeps the suite fast (the
// routes themselves still hash new passwords at the production cost of 12).
const SEED_COST = 8;

beforeAll(async () => {
  const app = express();
  app.use(express.json({ limit: '10mb' }));
  // Plain MemoryStore session. The prod PrismaSessionStore starts a prune interval
  // that would keep the vitest process alive after the suite finishes.
  app.use(session({ secret: 'authtest-secret', resave: false, saveUninitialized: false }));
  app.use(passport.initialize());
  app.use(passport.session());
  app.use('/api/auth', authRouter);
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  const address = server.address();
  if (address === null || typeof address === 'string' || address.port === 0) {
    throw new Error('Expected a TCP address with non-zero port from app.listen(0)');
  }
  BASE = `http://localhost:${address.port}`;
});

async function cleanupUsers() {
  await prisma.user.deleteMany({ where: { email: { startsWith: PREFIX } } });
}

afterAll(async () => {
  await cleanupUsers();
  server?.close();
});

beforeEach(async () => {
  sendWelcomeEmailMock.mockClear();
  sendPasswordResetEmailMock.mockClear();
  await cleanupUsers();
});

interface SeedOpts {
  email: string;
  password?: string;
  plan?: string;
  name?: string | null;
  googleId?: string;
}

async function seedUser(opts: SeedOpts) {
  return prisma.user.create({
    data: {
      email: opts.email.toLowerCase(),
      name: opts.name === undefined ? 'Test User' : opts.name,
      passwordHash: opts.password ? await bcrypt.hash(opts.password, SEED_COST) : null,
      plan: opts.plan ?? 'free',
      googleId: opts.googleId ?? null,
    },
  });
}

function post(path: string, body: unknown, cookie?: string) {
  return fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: JSON.stringify(body),
  });
}

function get(path: string, cookie?: string) {
  return fetch(`${BASE}${path}`, {
    headers: cookie ? { Cookie: cookie } : {},
  });
}

// express-session emits a single cookie (connect.sid); keep the name=value pair.
function extractCookie(res: ApiResponse): string {
  const setCookie = res.headers.get('set-cookie');
  return setCookie ? setCookie.split(';')[0] : '';
}

async function loginAs(email: string, password: string): Promise<string> {
  const res = await post('/api/auth/login', { email, password });
  if (res.status !== 200) {
    throw new Error(`loginAs(${email}) expected 200, got ${res.status}`);
  }
  return extractCookie(res);
}

describe('POST /api/auth/signup', () => {
  it('creates a new user, auto-logs-in, and returns 201 with a sanitized user', async () => {
    const res = await post('/api/auth/signup', {
      email: `${PREFIX}new@test.invalid`,
      password: 'ValidPass123',
      name: 'Ana Pop',
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.user.email).toBe(`${PREFIX}new@test.invalid`);
    expect(body.user.name).toBe('Ana Pop');
    expect(body.user.plan).toBe('free');
    expect(body.user.passwordHash).toBeUndefined();
    expect(extractCookie(res)).toMatch(/^connect\.sid=/);
  });

  it('fires a welcome email to the new account', async () => {
    await post('/api/auth/signup', { email: `${PREFIX}welcome@test.invalid`, password: 'ValidPass123' });
    expect(sendWelcomeEmailMock).toHaveBeenCalledTimes(1);
    expect(sendWelcomeEmailMock.mock.calls[0][0].to).toBe(`${PREFIX}welcome@test.invalid`);
  });

  it('links a password to an existing Google-only account without creating a duplicate', async () => {
    const existing = await seedUser({ email: `${PREFIX}google@test.invalid`, googleId: 'g-signup-1', name: 'Existing Name' });
    expect(existing.passwordHash).toBeNull();

    const res = await post('/api/auth/signup', {
      email: `${PREFIX}google@test.invalid`,
      password: 'ValidPass123',
      name: 'Ignored Name',
    });
    expect(res.status).toBe(201);

    const updated = await prisma.user.findUnique({ where: { email: `${PREFIX}google@test.invalid` } });
    expect(updated?.id).toBe(existing.id);
    expect(updated?.passwordHash).toBeTruthy();
    expect(updated?.name).toBe('Existing Name');
  });

  it('rejects signup when an account with a password already exists (409)', async () => {
    await seedUser({ email: `${PREFIX}dup@test.invalid`, password: 'AlreadyHere1' });
    const res = await post('/api/auth/signup', { email: `${PREFIX}dup@test.invalid`, password: 'ValidPass123' });
    expect(res.status).toBe(409);
    expect((await res.json()).fields.email).toMatch(/already exists/i);
  });

  it('returns 400 for a malformed email', async () => {
    const res = await post('/api/auth/signup', { email: 'not-an-email', password: 'ValidPass123' });
    expect(res.status).toBe(400);
  });

  it('returns 400 for a password shorter than 8 characters', async () => {
    const res = await post('/api/auth/signup', { email: `${PREFIX}weak@test.invalid`, password: 'short' });
    expect(res.status).toBe(400);
  });

  it('normalizes the email to lowercase', async () => {
    const res = await post('/api/auth/signup', { email: `${PREFIX}MixedCase@Test.invalid`, password: 'ValidPass123' });
    expect(res.status).toBe(201);
    expect((await res.json()).user.email).toBe(`${PREFIX}mixedcase@test.invalid`);
  });
});

describe('POST /api/auth/login', () => {
  it('logs in with correct credentials and returns a session cookie', async () => {
    await seedUser({ email: `${PREFIX}login@test.invalid`, password: 'CorrectPass9', name: 'Login User' });
    const res = await post('/api/auth/login', { email: `${PREFIX}login@test.invalid`, password: 'CorrectPass9' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user.email).toBe(`${PREFIX}login@test.invalid`);
    expect(body.user.passwordHash).toBeUndefined();
    expect(extractCookie(res)).toMatch(/^connect\.sid=/);
  });

  it('rejects a wrong password with a generic 401', async () => {
    await seedUser({ email: `${PREFIX}wrongpw@test.invalid`, password: 'CorrectPass9' });
    const res = await post('/api/auth/login', { email: `${PREFIX}wrongpw@test.invalid`, password: 'WrongPass9' });
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe('Invalid email or password');
  });

  it('rejects an unknown email with the same generic 401 (no enumeration)', async () => {
    const res = await post('/api/auth/login', { email: `${PREFIX}ghost@test.invalid`, password: 'AnyPass123' });
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe('Invalid email or password');
  });

  it('rejects login for a Google-only account with a guiding message', async () => {
    await seedUser({ email: `${PREFIX}googleonly@test.invalid`, googleId: 'g-login-1' });
    const res = await post('/api/auth/login', { email: `${PREFIX}googleonly@test.invalid`, password: 'AnyPass123' });
    expect(res.status).toBe(401);
    expect((await res.json()).error).toMatch(/Google sign-in/i);
  });

  it('returns 400 when the password field is empty', async () => {
    const res = await post('/api/auth/login', { email: `${PREFIX}x@test.invalid`, password: '' });
    expect(res.status).toBe(400);
  });

  it('returns 400 for a malformed email', async () => {
    const res = await post('/api/auth/login', { email: 'bad', password: 'AnyPass123' });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/auth/me and POST /api/auth/logout', () => {
  it('returns { user: null } when not authenticated, never a 401', async () => {
    const res = await get('/api/auth/me');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ user: null });
  });

  it('returns the current user when authenticated', async () => {
    await seedUser({ email: `${PREFIX}me@test.invalid`, password: 'MePass1234', name: 'Me User' });
    const cookie = await loginAs(`${PREFIX}me@test.invalid`, 'MePass1234');
    const res = await get('/api/auth/me', cookie);
    expect(res.status).toBe(200);
    expect((await res.json()).user.email).toBe(`${PREFIX}me@test.invalid`);
  });

  it('logout destroys the session so /me stops returning the user', async () => {
    await seedUser({ email: `${PREFIX}logout@test.invalid`, password: 'OutPass1234' });
    const cookie = await loginAs(`${PREFIX}logout@test.invalid`, 'OutPass1234');

    const before = await get('/api/auth/me', cookie);
    expect((await before.json()).user).toBeTruthy();

    const logout = await post('/api/auth/logout', {}, cookie);
    expect(logout.status).toBe(200);
    expect(await logout.json()).toEqual({ ok: true });

    const after = await get('/api/auth/me', cookie);
    expect((await after.json()).user).toBeNull();
  });
});

describe('POST /api/auth/forgot-password', () => {
  it('creates a reset token and sends the email for a real account', async () => {
    const user = await seedUser({ email: `${PREFIX}forgot@test.invalid`, password: 'ForgotPass1' });
    const res = await post('/api/auth/forgot-password', { email: `${PREFIX}forgot@test.invalid` });
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);

    const tokens = await prisma.passwordResetToken.findMany({ where: { userId: user.id } });
    expect(tokens).toHaveLength(1);
    expect(tokens[0].usedAt).toBeNull();
    expect(sendPasswordResetEmailMock).toHaveBeenCalledTimes(1);
  });

  it('returns the same 200 for an unknown email without creating a token', async () => {
    const res = await post('/api/auth/forgot-password', { email: `${PREFIX}nobody@test.invalid` });
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
    expect(sendPasswordResetEmailMock).not.toHaveBeenCalled();
  });

  it('returns 200 for a Google-only account without creating a token', async () => {
    const user = await seedUser({ email: `${PREFIX}gforgot@test.invalid`, googleId: 'g-forgot-1' });
    const res = await post('/api/auth/forgot-password', { email: `${PREFIX}gforgot@test.invalid` });
    expect(res.status).toBe(200);
    const tokens = await prisma.passwordResetToken.findMany({ where: { userId: user.id } });
    expect(tokens).toHaveLength(0);
    expect(sendPasswordResetEmailMock).not.toHaveBeenCalled();
  });

  it('invalidates a prior unused token when a new one is requested', async () => {
    const user = await seedUser({ email: `${PREFIX}retoken@test.invalid`, password: 'RetokenP1' });
    await post('/api/auth/forgot-password', { email: `${PREFIX}retoken@test.invalid` });
    await post('/api/auth/forgot-password', { email: `${PREFIX}retoken@test.invalid` });

    const all = await prisma.passwordResetToken.findMany({ where: { userId: user.id } });
    expect(all).toHaveLength(2);
    expect(all.filter((t) => t.usedAt === null)).toHaveLength(1);
  });

  it('still returns 200 when the reset email fails to send', async () => {
    await seedUser({ email: `${PREFIX}emailfail@test.invalid`, password: 'EmailFail1' });
    sendPasswordResetEmailMock.mockRejectedValueOnce(new Error('Resend unavailable'));
    const res = await post('/api/auth/forgot-password', { email: `${PREFIX}emailfail@test.invalid` });
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
  });

  it('returns 400 for a malformed email', async () => {
    const res = await post('/api/auth/forgot-password', { email: 'nope' });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/auth/reset-password', () => {
  async function makeToken(
    userId: string,
    overrides: { expiresAt?: Date; usedAt?: Date | null } = {},
  ) {
    return prisma.passwordResetToken.create({
      data: {
        userId,
        token: `tok-${Math.random().toString(36).slice(2)}`,
        expiresAt: overrides.expiresAt ?? new Date(Date.now() + 60 * 60 * 1000),
        usedAt: overrides.usedAt ?? null,
      },
    });
  }

  it('resets the password with a valid token and marks it used', async () => {
    const user = await seedUser({ email: `${PREFIX}reset@test.invalid`, password: 'OldPass123' });
    const { token } = await makeToken(user.id);

    const res = await post('/api/auth/reset-password', { token, password: 'BrandNew456' });
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);

    const consumed = await prisma.passwordResetToken.findUnique({ where: { token } });
    expect(consumed?.usedAt).not.toBeNull();

    const oldLogin = await post('/api/auth/login', { email: `${PREFIX}reset@test.invalid`, password: 'OldPass123' });
    expect(oldLogin.status).toBe(401);
    const newLogin = await post('/api/auth/login', { email: `${PREFIX}reset@test.invalid`, password: 'BrandNew456' });
    expect(newLogin.status).toBe(200);
  });

  it('rejects an expired token', async () => {
    const user = await seedUser({ email: `${PREFIX}expired@test.invalid`, password: 'OldPass123' });
    const { token } = await makeToken(user.id, { expiresAt: new Date(Date.now() - 1000) });
    const res = await post('/api/auth/reset-password', { token, password: 'BrandNew456' });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/invalid or has expired/i);
  });

  it('rejects an already-used token', async () => {
    const user = await seedUser({ email: `${PREFIX}usedtok@test.invalid`, password: 'OldPass123' });
    const { token } = await makeToken(user.id, { usedAt: new Date() });
    const res = await post('/api/auth/reset-password', { token, password: 'BrandNew456' });
    expect(res.status).toBe(400);
  });

  it('rejects an unknown token', async () => {
    const res = await post('/api/auth/reset-password', { token: 'does-not-exist', password: 'BrandNew456' });
    expect(res.status).toBe(400);
  });

  it('returns 400 for a new password shorter than 8 characters', async () => {
    const user = await seedUser({ email: `${PREFIX}shortpw@test.invalid`, password: 'OldPass123' });
    const { token } = await makeToken(user.id);
    const res = await post('/api/auth/reset-password', { token, password: 'short' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when the token field is missing', async () => {
    const res = await post('/api/auth/reset-password', { password: 'BrandNew456' });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/auth/change-password', () => {
  it('returns 401 when not authenticated', async () => {
    const res = await post('/api/auth/change-password', { currentPassword: 'whatever', newPassword: 'BrandNew456' });
    expect(res.status).toBe(401);
  });

  it('changes the password when the current password is correct', async () => {
    await seedUser({ email: `${PREFIX}chpw@test.invalid`, password: 'CurrentP123' });
    const cookie = await loginAs(`${PREFIX}chpw@test.invalid`, 'CurrentP123');

    const res = await post(
      '/api/auth/change-password',
      { currentPassword: 'CurrentP123', newPassword: 'Updated456' },
      cookie,
    );
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);

    const oldLogin = await post('/api/auth/login', { email: `${PREFIX}chpw@test.invalid`, password: 'CurrentP123' });
    expect(oldLogin.status).toBe(401);
    const newLogin = await post('/api/auth/login', { email: `${PREFIX}chpw@test.invalid`, password: 'Updated456' });
    expect(newLogin.status).toBe(200);
  });

  it('rejects a wrong current password with 400', async () => {
    await seedUser({ email: `${PREFIX}badcur@test.invalid`, password: 'CurrentP123' });
    const cookie = await loginAs(`${PREFIX}badcur@test.invalid`, 'CurrentP123');
    const res = await post(
      '/api/auth/change-password',
      { currentPassword: 'WrongCurrent1', newPassword: 'Updated456' },
      cookie,
    );
    expect(res.status).toBe(400);
    expect((await res.json()).fields.currentPassword).toMatch(/incorrect/i);
  });

  it('rejects change-password for a Google-only account (no password set)', async () => {
    await seedUser({ email: `${PREFIX}gchpw@test.invalid`, password: 'TempPass123' });
    const cookie = await loginAs(`${PREFIX}gchpw@test.invalid`, 'TempPass123');
    // Drop the password after the session exists so the account is Google-only.
    await prisma.user.update({ where: { email: `${PREFIX}gchpw@test.invalid` }, data: { passwordHash: null } });

    const res = await post(
      '/api/auth/change-password',
      { currentPassword: 'TempPass123', newPassword: 'Updated456' },
      cookie,
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Google sign-in/i);
  });

  it('returns 400 for a new password shorter than 8 characters', async () => {
    await seedUser({ email: `${PREFIX}shortnew@test.invalid`, password: 'CurrentP123' });
    const cookie = await loginAs(`${PREFIX}shortnew@test.invalid`, 'CurrentP123');
    const res = await post(
      '/api/auth/change-password',
      { currentPassword: 'CurrentP123', newPassword: 'short' },
      cookie,
    );
    expect(res.status).toBe(400);
  });
});

describe('POST /api/auth/delete-account', () => {
  it('returns 401 when not authenticated', async () => {
    const res = await post('/api/auth/delete-account', {});
    expect(res.status).toBe(401);
  });

  it('deletes the authenticated user', async () => {
    const user = await seedUser({ email: `${PREFIX}del@test.invalid`, password: 'DeleteMe123' });
    const cookie = await loginAs(`${PREFIX}del@test.invalid`, 'DeleteMe123');

    const res = await post('/api/auth/delete-account', {}, cookie);
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
    expect(await prisma.user.findUnique({ where: { id: user.id } })).toBeNull();
  });
});

describe('GET /api/auth/export-data', () => {
  it('returns 401 when not authenticated', async () => {
    const res = await get('/api/auth/export-data');
    expect(res.status).toBe(401);
  });

  it('returns the authenticated user data as a JSON attachment', async () => {
    await seedUser({ email: `${PREFIX}export@test.invalid`, password: 'ExportP123', name: 'Export User' });
    const cookie = await loginAs(`${PREFIX}export@test.invalid`, 'ExportP123');

    const res = await get('/api/auth/export-data', cookie);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/application\/json/);
    expect(res.headers.get('content-disposition')).toMatch(/attachment/);

    const body = await res.json();
    expect(body.exportedAt).toBeTruthy();
    expect(body.user.email).toBe(`${PREFIX}export@test.invalid`);
    expect(Array.isArray(body.user.taxYears)).toBe(true);
  });
});
