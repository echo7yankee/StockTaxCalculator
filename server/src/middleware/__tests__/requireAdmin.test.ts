import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Request, Response } from 'express';
import { adminEmails, isAdminEmail, requireAdmin } from '../requireAdmin.js';

const ORIGINAL = process.env.ADMIN_EMAILS;

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.ADMIN_EMAILS;
  else process.env.ADMIN_EMAILS = ORIGINAL;
});

describe('adminEmails', () => {
  it('returns an empty list when ADMIN_EMAILS is unset', () => {
    delete process.env.ADMIN_EMAILS;
    expect(adminEmails()).toEqual([]);
  });

  it('parses a comma-separated list, trimming + lowercasing + dropping blanks', () => {
    process.env.ADMIN_EMAILS = ' Dragos@Investax.app , ,hello@investax.app, ';
    expect(adminEmails()).toEqual(['dragos@investax.app', 'hello@investax.app']);
  });
});

describe('isAdminEmail', () => {
  beforeEach(() => {
    process.env.ADMIN_EMAILS = 'dragos@investax.app,hello@investax.app';
  });

  it('matches case-insensitively', () => {
    expect(isAdminEmail('DRAGOS@investax.APP')).toBe(true);
    expect(isAdminEmail('hello@investax.app')).toBe(true);
  });

  it('rejects an email not on the list', () => {
    expect(isAdminEmail('paul@example.com')).toBe(false);
  });

  it('rejects null / undefined / empty', () => {
    expect(isAdminEmail(null)).toBe(false);
    expect(isAdminEmail(undefined)).toBe(false);
    expect(isAdminEmail('')).toBe(false);
  });

  it('fails closed when ADMIN_EMAILS is unset (nobody is admin)', () => {
    delete process.env.ADMIN_EMAILS;
    expect(isAdminEmail('dragos@investax.app')).toBe(false);
  });
});

// Minimal Express res double that records the status + json payload.
function mockRes() {
  const res = {} as Response & { statusCode?: number; body?: unknown };
  res.status = vi.fn((code: number) => {
    res.statusCode = code;
    return res;
  }) as unknown as Response['status'];
  res.json = vi.fn((payload: unknown) => {
    res.body = payload;
    return res;
  }) as unknown as Response['json'];
  return res;
}

describe('requireAdmin middleware', () => {
  beforeEach(() => {
    process.env.ADMIN_EMAILS = 'dragos@investax.app';
  });

  it('401s when the request is not authenticated', () => {
    const req = { isAuthenticated: () => false, user: undefined } as unknown as Request;
    const res = mockRes();
    const next = vi.fn();

    requireAdmin(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('403s when authenticated but the email is not on the allowlist', () => {
    const req = {
      isAuthenticated: () => true,
      user: { email: 'paul@example.com' },
    } as unknown as Request;
    const res = mockRes();
    const next = vi.fn();

    requireAdmin(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect((res as { body?: { code?: string } }).body?.code).toBe('ADMIN_REQUIRED');
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next() for an allowlisted admin', () => {
    const req = {
      isAuthenticated: () => true,
      user: { email: 'Dragos@Investax.app' },
    } as unknown as Request;
    const res = mockRes();
    const next = vi.fn();

    requireAdmin(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });
});
