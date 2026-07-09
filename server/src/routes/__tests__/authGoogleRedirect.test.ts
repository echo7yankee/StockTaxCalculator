import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import express from 'express';
import session from 'express-session';
import { Server } from 'http';
import type { Request, Response } from 'express';

// Mock the email service like auth.test.ts does, so importing the router never
// touches Resend.
vi.mock('../../services/email.js', () => ({
  sendWelcomeEmail: vi.fn().mockResolvedValue(undefined),
  sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined),
  pickLanguage: () => 'ro',
}));

// The /google routes and the passport GoogleStrategy register only when these env
// vars exist at import time, so set dummy credentials BEFORE importing the router.
// Vitest gives this file its own worker and module graph; nothing leaks to other
// suites. The dummy values are never sent anywhere: initiating OAuth only BUILDS
// the accounts.google.com authorization URL and 302s to it.
process.env.GOOGLE_CLIENT_ID = 'authgoogletest-client-id';
process.env.GOOGLE_CLIENT_SECRET = 'authgoogletest-client-secret';

const { authRouter, isSafeOauthRedirectPath, stashOauthRedirect, googleCallbackSuccessHandler } =
  await import('../auth.js');
const { default: passport } = await import('../../config/passport.js');

const CLIENT_URL = 'https://investax-test.example';
const prevClientUrl = process.env.CLIENT_URL;

let server: Server;
let BASE = '';

beforeAll(async () => {
  process.env.CLIENT_URL = CLIENT_URL;
  const app = express();
  // Same MemoryStore setup as auth.test.ts (the prod PrismaSessionStore starts a
  // prune interval that would keep the vitest process alive). saveUninitialized
  // false matches prod, which is what makes the set-cookie assertions below
  // meaningful: a cookie appears only when the stash actually wrote the session.
  app.use(session({ secret: 'authgoogletest-secret', resave: false, saveUninitialized: false }));
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

afterAll(() => {
  if (prevClientUrl === undefined) {
    delete process.env.CLIENT_URL;
  } else {
    process.env.CLIENT_URL = prevClientUrl;
  }
  server?.close();
});

describe('isSafeOauthRedirectPath', () => {
  it.each(['/pricing', '/pricing?from=checker', '/upload', '/a'])(
    'accepts the same-site absolute path %s',
    (path) => {
      expect(isSafeOauthRedirectPath(path)).toBe(true);
    },
  );

  it.each([
    ['//evil.example', 'protocol-relative double slash'],
    ['/\\evil.example', 'backslash form browsers treat as //'],
    ['https://evil.example', 'absolute URL'],
    ['http://evil.example/x', 'absolute URL'],
    ['pricing', 'missing leading slash'],
    ['', 'empty string'],
    ['/', 'bare slash (nothing to thread)'],
    ['/pricing\r\nSet-Cookie: x=1', 'header-splitting control chars'],
    ['/' + 'a'.repeat(600), 'over the length cap'],
  ])('rejects %s (%s)', (path) => {
    expect(isSafeOauthRedirectPath(path)).toBe(false);
  });
});

function fakeReq(query: Record<string, unknown>, sessionData: Record<string, unknown> = {}) {
  return { query, session: sessionData } as unknown as Request;
}

function fakeRes() {
  const redirects: string[] = [];
  const res = { redirect: (url: string) => redirects.push(url) } as unknown as Response;
  return { res, redirects };
}

describe('stashOauthRedirect', () => {
  it('stashes a valid redirect in the session', () => {
    const req = fakeReq({ redirect: '/pricing' });
    stashOauthRedirect(req);
    expect(req.session.oauthRedirect).toBe('/pricing');
  });

  it('clears a stale stash when the param is absent', () => {
    const req = fakeReq({}, { oauthRedirect: '/pricing' });
    stashOauthRedirect(req);
    expect(req.session.oauthRedirect).toBeUndefined();
  });

  it('clears a stale stash when the param is unsafe', () => {
    const req = fakeReq({ redirect: '//evil.example' }, { oauthRedirect: '/pricing' });
    stashOauthRedirect(req);
    expect(req.session.oauthRedirect).toBeUndefined();
  });

  it('ignores a non-string (repeated) param', () => {
    const req = fakeReq({ redirect: ['/a', '/b'] });
    stashOauthRedirect(req);
    expect(req.session.oauthRedirect).toBeUndefined();
  });
});

describe('googleCallbackSuccessHandler', () => {
  it('redirects to CLIENT_URL + the stashed path and consumes the stash', () => {
    const req = fakeReq({}, { oauthRedirect: '/pricing' });
    const { res, redirects } = fakeRes();
    googleCallbackSuccessHandler(req, res);
    expect(redirects).toEqual([`${CLIENT_URL}/pricing`]);
    expect(req.session.oauthRedirect).toBeUndefined();
  });

  it('falls back to /dashboard when nothing is stashed', () => {
    const req = fakeReq({});
    const { res, redirects } = fakeRes();
    googleCallbackSuccessHandler(req, res);
    expect(redirects).toEqual([`${CLIENT_URL}/dashboard`]);
  });

  it('falls back to /dashboard when the stash fails re-validation (defense in depth)', () => {
    const req = fakeReq({}, { oauthRedirect: '//evil.example' });
    const { res, redirects } = fakeRes();
    googleCallbackSuccessHandler(req, res);
    expect(redirects).toEqual([`${CLIENT_URL}/dashboard`]);
    expect(req.session.oauthRedirect).toBeUndefined();
  });
});

describe('GET /api/auth/google (integration through the real session middleware)', () => {
  it('still initiates OAuth: 302 to accounts.google.com, and persists the stash (set-cookie)', async () => {
    const res = await fetch(`${BASE}/api/auth/google?redirect=${encodeURIComponent('/pricing')}`, {
      redirect: 'manual',
    });
    expect(res.status).toBe(302);
    expect(new URL(res.headers.get('location') ?? '').hostname).toBe('accounts.google.com');
    // The stash marked the session dirty, so a session cookie must be issued for
    // the round-trip back from Google.
    expect(res.headers.get('set-cookie')).toBeTruthy();
  });

  it('writes no session at all without a redirect param (saveUninitialized stays false)', async () => {
    const res = await fetch(`${BASE}/api/auth/google`, { redirect: 'manual' });
    expect(res.status).toBe(302);
    expect(new URL(res.headers.get('location') ?? '').hostname).toBe('accounts.google.com');
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('writes no session for an unsafe redirect param', async () => {
    const res = await fetch(`${BASE}/api/auth/google?redirect=${encodeURIComponent('//evil.example')}`, {
      redirect: 'manual',
    });
    expect(res.status).toBe(302);
    expect(new URL(res.headers.get('location') ?? '').hostname).toBe('accounts.google.com');
    expect(res.headers.get('set-cookie')).toBeNull();
  });
});
