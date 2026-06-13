import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import express from 'express';
import { Server } from 'http';

// Mock prisma before importing the router so the route binds the mock.
const createMock = vi.fn();
vi.mock('../../lib/prisma.js', () => ({
  default: {
    analyticsEvent: { create: createMock },
  },
}));

const { trackRouter } = await import('../track.js');

let server: Server;
let BASE = '';

beforeAll(async () => {
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use('/api/track', trackRouter);
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

const originalNodeEnv = process.env.NODE_ENV;

beforeEach(() => {
  process.env.NODE_ENV = 'test';
  createMock.mockReset();
  createMock.mockResolvedValue({});
});

afterEach(() => {
  process.env.NODE_ENV = originalNodeEnv;
});

function post(body: unknown, headers: Record<string, string> = {}) {
  return fetch(`${BASE}/api/track`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

describe('POST /api/track', () => {
  it('records a valid funnel event and returns 204', async () => {
    const res = await post({ name: 'paywall_seen', path: '/upload' });
    expect(res.status).toBe(204);
    expect(createMock).toHaveBeenCalledTimes(1);
    expect(createMock.mock.calls[0][0].data).toMatchObject({ name: 'paywall_seen', path: '/upload' });
  });

  it('reduces the referrer to its host on a pageview', async () => {
    await post({ name: 'pageview', path: '/ghid/dividende-broker-strain', referrer: 'https://chatgpt.com/c/abc123' });
    expect(createMock.mock.calls[0][0].data.referrer).toBe('chatgpt.com');
  });

  it('strips query string and hash from the path (no tokens/PII stored)', async () => {
    await post({ name: 'pageview', path: '/results?uploadId=secret-123#part' });
    expect(createMock.mock.calls[0][0].data.path).toBe('/results');
  });

  it('rejects an unknown event name with 400 and writes no row', async () => {
    const res = await post({ name: 'evil_event', path: '/x' });
    expect(res.status).toBe(400);
    expect(createMock).not.toHaveBeenCalled();
  });

  it('rejects a missing name with 400 and writes no row', async () => {
    const res = await post({ path: '/x' });
    expect(res.status).toBe(400);
    expect(createMock).not.toHaveBeenCalled();
  });

  it('drops a known crawler user-agent without writing (204)', async () => {
    const res = await post({ name: 'pageview', path: '/' }, { 'user-agent': 'Googlebot/2.1' });
    expect(res.status).toBe(204);
    expect(createMock).not.toHaveBeenCalled();
  });

  it('never 500s when the DB write throws (telemetry is best-effort)', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    createMock.mockRejectedValueOnce(new Error('db down'));
    const res = await post({ name: 'calculator_used' });
    expect(res.status).toBe(204);
    errSpy.mockRestore();
  });

  it('omits path and referrer cleanly when they are not provided', async () => {
    const res = await post({ name: 'signup_completed' });
    expect(res.status).toBe(204);
    const data = createMock.mock.calls[0][0].data;
    expect(data.name).toBe('signup_completed');
    expect(data.path).toBeUndefined();
    expect(data.referrer).toBeUndefined();
  });
});
