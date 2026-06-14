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

  it('keeps short line:col so the fingerprint-relevant frame text is stable', () => {
    // topFrame shares scrubText with scrubStack; the secret-shape masking must
    // not disturb a normal frame's line:col (otherwise grouping would shift).
    const stack = 'TypeError: boom\n    at fn (/app/dist/index-abc123.js:1:48213)';
    expect(topFrame(stack)).toBe('at fn (/app/dist/index-abc123.js:1:48213)');
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

  // The stack's first line is "ErrorName: message" and can carry user/secret
  // data; PR2 made client stacks (the likeliest carriers) live. These vectors
  // were qa-confirmed surviving raw in the stored sampleStack on PR #184.
  it('masks a Stripe secret key embedded in a stack frame', () => {
    const scrubbed = scrubStack('Error: leaked sk_live_51HxAbCdEfGh28053zZ\n    at h (/app/x.js:1:2)')!;
    expect(scrubbed).not.toContain('sk_live_51HxAbCdEfGh28053zZ');
    expect(scrubbed).toContain('<key>');
  });

  it('masks publishable/restricted/test Stripe key shapes too', () => {
    expect(scrubStack('pk_test_abc123XYZ')!).toContain('<key>');
    expect(scrubStack('rk_live_DEADBEEF99')!).toContain('<key>');
    expect(scrubStack('pk_live_AbCdEfGhIjK')!).toContain('<key>');
  });

  it('masks a 13-digit CNP', () => {
    const scrubbed = scrubStack('Error: CNP 1960714123456 invalid\n    at v (/app/x.js:3:4)')!;
    expect(scrubbed).not.toContain('1960714123456');
    expect(scrubbed).toContain('<n>');
  });

  it('masks an IBAN digit cluster', () => {
    const scrubbed = scrubStack('Error: payout to RO49AAAA1B31007593840000\n    at p (/app/x.js:5:6)')!;
    expect(scrubbed).not.toContain('1B31007593840000');
    expect(scrubbed).not.toContain('31007593840000');
  });

  it('masks a 32-char hex Bearer token', () => {
    const token = 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6';
    const scrubbed = scrubStack(`Error: Authorization Bearer ${token}\n    at a (/app/x.js:7:8)`)!;
    expect(scrubbed).not.toContain(token);
    expect(scrubbed).toContain('<hex>');
  });

  it('masks a full url (and its token) in a stack frame', () => {
    const scrubbed = scrubStack('Error: GET https://api.x.io/v1/u?token=secret123 failed\n    at g (/app/x.js:9:1)')!;
    expect(scrubbed).not.toContain('secret123');
    expect(scrubbed).not.toContain('https://api.x.io');
    expect(scrubbed).toContain('<url>');
  });

  it('masks a 16-digit card number', () => {
    const scrubbed = scrubStack('Error: card 4111111111111111 declined\n    at c (/app/x.js:2:3)')!;
    expect(scrubbed).not.toContain('4111111111111111');
  });

  it('DELIBERATELY preserves a short :line:col in a normal frame', () => {
    const scrubbed = scrubStack('TypeError: boom\n    at fn (/app/dist/index-abc123.js:1:48213)')!;
    // line:col is the point of a stack and feeds topFrame's fingerprint, so it
    // must survive the >=9-digit pass (which only masks 9+ digit runs).
    expect(scrubbed).toContain(':1:48213');
    expect(scrubbed).toContain('at fn (/app/dist/index-abc123.js:1:48213)');
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
