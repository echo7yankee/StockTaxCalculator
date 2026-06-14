import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock prisma before importing the module under test so recordError binds the mock.
const upsertMock = vi.fn();
vi.mock('../prisma.js', () => ({
  default: {
    errorEvent: { upsert: upsertMock },
  },
}));

const {
  isJunkError,
  normalizeMessage,
  topFrame,
  scrubStack,
  fingerprintOf,
  recordError,
} = await import('../errorMonitor.js');

beforeEach(() => {
  upsertMock.mockReset();
  upsertMock.mockResolvedValue({});
});

describe('isJunkError', () => {
  it('flags known browser/extension/network noise', () => {
    expect(isJunkError('ResizeObserver loop limit exceeded')).toBe(true);
    expect(isJunkError('Failed to fetch')).toBe(true);
    expect(isJunkError('Error from chrome-extension://abcd/inject.js')).toBe(true);
    expect(isJunkError('The operation was aborted')).toBe(true);
  });

  it('does not flag a genuine application error', () => {
    expect(isJunkError("Cannot read properties of undefined (reading 'plan')")).toBe(false);
    expect(isJunkError('Prisma query failed')).toBe(false);
  });
});

describe('normalizeMessage', () => {
  it('masks standalone numbers so id-varying messages group together', () => {
    expect(normalizeMessage('timeout after 5000ms')).toBe('timeout after <n>ms');
    expect(normalizeMessage('row 42 of 1000 failed')).toBe('row <n> of <n> failed');
  });

  it('masks emails, urls, uuids and long hex', () => {
    expect(normalizeMessage('user alice@example.com not found')).toBe('user <email> not found');
    expect(normalizeMessage('GET https://api.stripe.com/v1/x failed')).toBe('GET <url> failed');
    expect(normalizeMessage('missing 1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed')).toBe('missing <uuid>');
    expect(normalizeMessage('token deadbeefdeadbeef00 invalid')).toBe('token <hex> invalid');
  });

  it('collapses whitespace, trims, and caps length', () => {
    expect(normalizeMessage('  a\n\t  b  ')).toBe('a b');
    expect(normalizeMessage('x'.repeat(600)).length).toBe(500);
  });

  it('leaves a clean message untouched', () => {
    expect(normalizeMessage("Cannot read properties of undefined (reading 'plan')")).toBe(
      "Cannot read properties of undefined (reading 'plan')"
    );
  });
});

describe('topFrame', () => {
  it('returns the first "at ..." frame, scrubbed and capped', () => {
    const stack = "TypeError: boom\n    at handler (/app/dist/routes/x.js:10:5)\n    at next (/app/node_modules/express/index.js:1:1)";
    expect(topFrame(stack)).toBe('at handler (/app/dist/routes/x.js:10:5)');
  });

  it('returns an empty string when there is no stack or no frame', () => {
    expect(topFrame(undefined)).toBe('');
    expect(topFrame('just a message, no frames')).toBe('');
  });
});

describe('scrubStack', () => {
  it('masks emails and strips query strings but keeps line:col', () => {
    const scrubbed = scrubStack('at load (/app/x.js?v=abc123:10:5) for bob@corp.io');
    expect(scrubbed).toContain(':10:5');
    expect(scrubbed).not.toContain('?v=abc123');
    expect(scrubbed).toContain('<email>');
    expect(scrubbed).not.toContain('bob@corp.io');
  });

  it('returns undefined for a missing stack and truncates a huge one', () => {
    expect(scrubStack(undefined)).toBeUndefined();
    expect(scrubStack('y'.repeat(5000))!.length).toBe(4000);
  });
});

describe('fingerprintOf', () => {
  it('is a deterministic 16-char hex hash', () => {
    const fp = fingerprintOf('TypeError', 'boom', 'at x (a.js:1:1)');
    expect(fp).toMatch(/^[0-9a-f]{16}$/);
    expect(fingerprintOf('TypeError', 'boom', 'at x (a.js:1:1)')).toBe(fp);
  });

  it('changes when any component changes', () => {
    const base = fingerprintOf('TypeError', 'boom', 'at x (a.js:1:1)');
    expect(fingerprintOf('RangeError', 'boom', 'at x (a.js:1:1)')).not.toBe(base);
    expect(fingerprintOf('TypeError', 'bang', 'at x (a.js:1:1)')).not.toBe(base);
    expect(fingerprintOf('TypeError', 'boom', 'at y (b.js:2:2)')).not.toBe(base);
  });
});

describe('recordError', () => {
  it('upserts a grouped issue with the create/update shape', async () => {
    await recordError({
      name: 'TypeError',
      message: 'Cannot read x of undefined',
      stack: 'TypeError: boom\n    at handler (/app/x.js:1:2)',
      source: 'server',
      context: 'GET /api/uploads',
    });
    expect(upsertMock).toHaveBeenCalledTimes(1);
    const arg = upsertMock.mock.calls[0][0];
    expect(arg.where.fingerprint).toMatch(/^[0-9a-f]{16}$/);
    expect(arg.create).toMatchObject({
      fingerprint: arg.where.fingerprint,
      source: 'server',
      name: 'TypeError',
      message: 'Cannot read x of undefined',
      context: 'GET /api/uploads',
      count: 1,
    });
    expect(arg.create.sampleStack).toContain('at handler');
    expect(arg.update).toEqual({ count: { increment: 1 }, lastSeen: expect.any(Date) });
  });

  it('groups two occurrences that differ only by an id under one fingerprint', async () => {
    const stack = 'Error: x\n    at q (/app/db.js:5:5)';
    await recordError({ name: 'Error', message: 'query 111 timed out', stack });
    await recordError({ name: 'Error', message: 'query 999 timed out', stack });
    expect(upsertMock.mock.calls[0][0].where.fingerprint).toBe(
      upsertMock.mock.calls[1][0].where.fingerprint
    );
  });

  it('drops junk noise without writing a row', async () => {
    await recordError({ message: 'ResizeObserver loop limit exceeded' });
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it('defaults a missing name to "Error" and source to "server"', async () => {
    await recordError({ message: 'boom' });
    expect(upsertMock.mock.calls[0][0].create).toMatchObject({ name: 'Error', source: 'server' });
  });

  it('passes through source="client"', async () => {
    await recordError({ message: 'boom', source: 'client' });
    expect(upsertMock.mock.calls[0][0].create.source).toBe('client');
  });

  it('never throws when the DB write fails (it runs inside crash handlers)', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    upsertMock.mockRejectedValueOnce(new Error('db down'));
    await expect(recordError({ message: 'boom' })).resolves.toBeUndefined();
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });
});
