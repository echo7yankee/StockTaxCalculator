import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import { Server } from 'http';
import { jsonErrorHandler } from '../errorHandler.js';

let server: Server;
// Listen on an OS-assigned free port so this file can never collide with another
// server test file's hardcoded port. BASE is filled in once the server is listening.
let BASE = '';

beforeAll(async () => {
  const app = express();
  // Small body limit so an oversized payload is cheap to construct in tests.
  app.use(express.json({ limit: '1kb' }));
  app.post('/echo', (req, res) => {
    res.json({ received: req.body });
  });
  app.post('/throws', () => {
    throw new Error('synchronous handler failure with a revealing stack');
  });
  app.get('/forbidden', (_req: Request, _res: Response, next: NextFunction) => {
    const err = new Error('no access') as Error & { status: number };
    err.status = 403;
    next(err);
  });
  app.use(jsonErrorHandler);
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('Expected a TCP address from app.listen(0)');
  }
  BASE = `http://localhost:${address.port}`;
});

afterAll(() => {
  server?.close();
});

function postRaw(path: string, body: string) {
  return fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
}

describe('jsonErrorHandler', () => {
  it('returns 400 JSON for a malformed JSON body', async () => {
    const res = await postRaw('/echo', '{ "broken": ');
    expect(res.status).toBe(400);
    expect(res.headers.get('content-type')).toMatch(/application\/json/);
    expect(await res.json()).toEqual({ error: 'Invalid JSON in request body' });
  });

  it('does not leak a stack trace in the malformed-JSON response body', async () => {
    // vitest runs with NODE_ENV='test', so Express's default handler WOULD echo
    // the stack — this asserts jsonErrorHandler intercepts before that.
    const res = await postRaw('/echo', 'not json at all');
    const text = await res.text();
    expect(text).not.toMatch(/SyntaxError/);
    expect(text).not.toMatch(/\bat\s+/);
    expect(text).not.toMatch(/errorHandler|node_modules/);
    expect(text).toBe('{"error":"Invalid JSON in request body"}');
  });

  it('returns 413 JSON when the body exceeds the size limit', async () => {
    const res = await postRaw('/echo', JSON.stringify({ blob: 'x'.repeat(2000) }));
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: 'Request body too large' });
  });

  it('returns 500 JSON without a stack trace for an uncaught route error', async () => {
    const res = await postRaw('/throws', '{}');
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(text).toBe('{"error":"Internal server error"}');
    expect(text).not.toMatch(/revealing stack/);
    expect(text).not.toMatch(/\bat\s+/);
  });

  it('preserves a 4xx status set by a route via next(err)', async () => {
    const res = await fetch(`${BASE}/forbidden`);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Request error' });
  });

  it('passes valid JSON through untouched', async () => {
    const res = await postRaw('/echo', JSON.stringify({ hello: 'world' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: { hello: 'world' } });
  });
});
