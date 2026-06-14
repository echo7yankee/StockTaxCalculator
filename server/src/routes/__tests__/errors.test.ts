import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import express from 'express';
import { Server } from 'http';

// Mock recordError before importing the router so the route binds the mock. The
// route delegates all junk-filtering/normalization/scrubbing to recordError
// (covered by errorMonitor's own unit tests), so here we only prove the HTTP
// surface: bot drop, validation, the forced source, and the always-204 contract.
const recordErrorMock = vi.fn();
vi.mock('../../lib/errorMonitor.js', () => ({
  recordError: recordErrorMock,
}));

const { errorsRouter } = await import('../errors.js');

let server: Server;
let BASE = '';

beforeAll(async () => {
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use('/api/errors', errorsRouter);
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
  recordErrorMock.mockReset();
  recordErrorMock.mockResolvedValue(undefined);
});

afterEach(() => {
  process.env.NODE_ENV = originalNodeEnv;
});

function post(body: unknown, headers: Record<string, string> = {}) {
  return fetch(`${BASE}/api/errors`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

describe('POST /api/errors', () => {
  it('records a valid client error and returns 204', async () => {
    const res = await post({ name: 'TypeError', message: 'boom', stack: 'at x (a.js:1:1)', context: 'react-render' });
    expect(res.status).toBe(204);
    expect(recordErrorMock).toHaveBeenCalledTimes(1);
    expect(recordErrorMock.mock.calls[0][0]).toMatchObject({
      name: 'TypeError',
      message: 'boom',
      stack: 'at x (a.js:1:1)',
      context: 'react-render',
    });
  });

  it('forces source=client and ignores any source field from the wire', async () => {
    await post({ name: 'Error', message: 'x', source: 'server' });
    expect(recordErrorMock.mock.calls[0][0].source).toBe('client');
  });

  it('drops a known crawler user-agent without recording (204)', async () => {
    const res = await post({ name: 'Error', message: 'x' }, { 'user-agent': 'Googlebot/2.1' });
    expect(res.status).toBe(204);
    expect(recordErrorMock).not.toHaveBeenCalled();
  });

  it('rejects a non-object body with 400 and records nothing', async () => {
    const res = await fetch(`${BASE}/api/errors`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify('not-an-object'),
    });
    expect(res.status).toBe(400);
    expect(recordErrorMock).not.toHaveBeenCalled();
  });

  it('rejects an oversized field with 400 (bounded schema, defense-in-depth)', async () => {
    const res = await post({ message: 'a'.repeat(2001) });
    expect(res.status).toBe(400);
    expect(recordErrorMock).not.toHaveBeenCalled();
  });

  it('accepts an empty object (all fields optional) and still records (204)', async () => {
    const res = await post({});
    expect(res.status).toBe(204);
    expect(recordErrorMock).toHaveBeenCalledTimes(1);
    expect(recordErrorMock.mock.calls[0][0].source).toBe('client');
  });

  it('accepts max-length fields (bounded, not rejected) and records them', async () => {
    const res = await post({
      name: 'N'.repeat(200),
      message: 'm'.repeat(2000),
      stack: 's'.repeat(10000),
      context: 'c'.repeat(200),
    });
    expect(res.status).toBe(204);
    const arg = recordErrorMock.mock.calls[0][0];
    expect(arg.name).toHaveLength(200);
    expect(arg.message).toHaveLength(2000);
    expect(arg.stack).toHaveLength(10000);
    expect(arg.context).toHaveLength(200);
  });

  it('still returns 204 even if recordError rejects (a beacon must never error the page)', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    recordErrorMock.mockRejectedValueOnce(new Error('db down'));
    const res = await post({ name: 'Error', message: 'x' });
    expect(res.status).toBe(204);
    errSpy.mockRestore();
  });
});
