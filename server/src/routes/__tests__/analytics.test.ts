import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import express from 'express';
import { Server } from 'http';

// Mock prisma so the route's DB read returns canned rows. The aggregation itself
// (summarize) is exercised against the real implementation in
// scripts/__tests__/analytics-report.test.ts; here we only prove the HTTP route:
// the admin gate, the query to window translation, and error handling.
const findManyMock = vi.fn();
vi.mock('../../lib/prisma.js', () => ({
  default: { analyticsEvent: { findMany: findManyMock } },
}));

const { requireAdmin } = await import('../../middleware/requireAdmin.js');
const { analyticsRouter } = await import('../analytics.js');

let server: Server;
let BASE = '';

// Mutable auth state the fake middleware reflects into each request.
let authState: { authed: boolean; email: string | undefined } = {
  authed: true,
  email: 'dragos@investax.app',
};

const SEED = [
  { name: 'pageview', path: '/', referrer: 'chatgpt.com', createdAt: new Date() },
  { name: 'pageview', path: '/pricing', referrer: null, createdAt: new Date() },
  { name: 'pageview', path: '/', referrer: 'google.com', createdAt: new Date() },
  { name: 'pricing_viewed', path: null, referrer: null, createdAt: new Date() },
  { name: 'paywall_seen', path: null, referrer: null, createdAt: new Date() },
];

beforeAll(async () => {
  process.env.ADMIN_EMAILS = 'dragos@investax.app';
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as unknown as { isAuthenticated: () => boolean }).isAuthenticated = () => authState.authed;
    (req as unknown as { user: unknown }).user = authState.authed
      ? { email: authState.email }
      : undefined;
    next();
  });
  app.use('/api/analytics', requireAdmin, analyticsRouter);
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
  server?.close();
});

beforeEach(() => {
  authState = { authed: true, email: 'dragos@investax.app' };
  findManyMock.mockReset();
  findManyMock.mockResolvedValue(SEED);
});

function get(path: string) {
  return fetch(`${BASE}${path}`);
}

describe('GET /api/analytics/summary admin gate', () => {
  it('401s when the request is not authenticated', async () => {
    authState = { authed: false, email: undefined };
    const res = await get('/api/analytics/summary');
    expect(res.status).toBe(401);
    expect(findManyMock).not.toHaveBeenCalled();
  });

  it('403s when authenticated but not on the ADMIN_EMAILS allowlist', async () => {
    authState = { authed: true, email: 'paul@example.com' };
    const res = await get('/api/analytics/summary');
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe('ADMIN_REQUIRED');
    expect(findManyMock).not.toHaveBeenCalled();
  });

  it('200s for an allowlisted admin', async () => {
    const res = await get('/api/analytics/summary');
    expect(res.status).toBe(200);
  });
});

describe('GET /api/analytics/summary aggregation', () => {
  it('returns the summarized funnel + pageview breakdown', async () => {
    const res = await get('/api/analytics/summary');
    const body = await res.json();

    expect(body.total).toBe(5);
    expect(body.pageviews).toBe(3);
    expect(body.topPaths).toContainEqual({ path: '/', count: 2 });
    expect(body.topPaths).toContainEqual({ path: '/pricing', count: 1 });
    expect(body.topReferrers).toContainEqual({ host: 'chatgpt.com', count: 1 });

    const funnel = Object.fromEntries(
      body.funnel.map((s: { name: string; count: number }) => [s.name, s.count])
    );
    expect(funnel.paywall_seen).toBe(1);
    expect(funnel.pricing_viewed).toBe(1);
    expect(funnel.checkout_started).toBe(0);
    expect(funnel.payment_completed).toBe(0);
  });
});

describe('GET /api/analytics/summary window translation', () => {
  it('defaults to the last 30 days (createdAt lower bound set)', async () => {
    const res = await get('/api/analytics/summary');
    const body = await res.json();
    expect(body.label).toBe('last 30 days');
    const where = findManyMock.mock.calls[0][0].where;
    expect(where.createdAt.gte).toBeInstanceOf(Date);
  });

  it('honours ?days=7', async () => {
    const res = await get('/api/analytics/summary?days=7');
    const body = await res.json();
    expect(body.label).toBe('last 7 day(s)');
    const since = findManyMock.mock.calls[0][0].where.createdAt.gte as Date;
    const ageDays = (Date.now() - since.getTime()) / (24 * 60 * 60 * 1000);
    expect(ageDays).toBeGreaterThan(6.5);
    expect(ageDays).toBeLessThan(7.5);
  });

  it('honours ?all (no time filter)', async () => {
    const res = await get('/api/analytics/summary?all');
    const body = await res.json();
    expect(body.label).toBe('all time');
    expect(findManyMock.mock.calls[0][0].where).toBeUndefined();
  });

  it('honours ?since=YYYY-MM-DD', async () => {
    const res = await get('/api/analytics/summary?since=2026-01-01');
    const body = await res.json();
    expect(body.label).toBe('since 2026-01-01');
  });

  it('400s on a non-numeric ?days', async () => {
    const res = await get('/api/analytics/summary?days=abc');
    expect(res.status).toBe(400);
    expect(findManyMock).not.toHaveBeenCalled();
  });

  it('400s on an unparseable ?since', async () => {
    const res = await get('/api/analytics/summary?since=not-a-date');
    expect(res.status).toBe(400);
    expect(findManyMock).not.toHaveBeenCalled();
  });
});

describe('GET /api/analytics/summary failure handling', () => {
  it('500s when the DB read throws', async () => {
    findManyMock.mockRejectedValueOnce(new Error('SQLite locked'));
    const res = await get('/api/analytics/summary');
    expect(res.status).toBe(500);
    expect((await res.json()).error).toMatch(/Failed to read analytics/);
  });
});
