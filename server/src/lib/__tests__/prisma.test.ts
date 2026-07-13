import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { resolveRelativeSqliteUrl } from '../prisma.js';

const ROOT = path.resolve('/srv/app/server');

describe('resolveRelativeSqliteUrl', () => {
  it('anchors a relative file: URL to the server root in dev', () => {
    const out = resolveRelativeSqliteUrl('file:./prisma/dev.db', 'development', ROOT);
    expect(out).toBe(`file:${path.resolve(ROOT, './prisma/dev.db')}`);
    // The path segment is absolute regardless of process.cwd().
    expect(out?.startsWith('file:')).toBe(true);
    expect(path.isAbsolute(out!.slice('file:'.length))).toBe(true);
  });

  it('is a no-op outside development (test + production left byte-identical)', () => {
    // The test env configures its own DATABASE_URL (CI: file:./dev.db); the dev
    // rewrite must never touch it, or Prisma opens an empty server-root DB.
    expect(resolveRelativeSqliteUrl('file:./dev.db', 'test', ROOT)).toBeUndefined();
    expect(resolveRelativeSqliteUrl('file:./prisma/dev.db', 'production', ROOT)).toBeUndefined();
    expect(resolveRelativeSqliteUrl('file:./prisma/dev.db', undefined, ROOT)).toBeUndefined();
  });

  it('leaves an already-absolute file: URL alone', () => {
    const abs = process.platform === 'win32' ? 'file:C:/data/prod.db' : 'file:/data/prod.db';
    expect(resolveRelativeSqliteUrl(abs, 'development', ROOT)).toBeUndefined();
  });

  it('ignores a missing DATABASE_URL (falls back to Prisma env loading)', () => {
    expect(resolveRelativeSqliteUrl(undefined, 'development', ROOT)).toBeUndefined();
    expect(resolveRelativeSqliteUrl('', 'development', ROOT)).toBeUndefined();
  });

  it('ignores non-file provider URLs', () => {
    expect(
      resolveRelativeSqliteUrl('postgresql://localhost:5432/db', 'development', ROOT),
    ).toBeUndefined();
  });

  it('anchors purely through serverRoot (independent of cwd)', () => {
    const a = resolveRelativeSqliteUrl('file:./prisma/dev.db', 'development', path.resolve('/a/server'));
    const b = resolveRelativeSqliteUrl('file:./prisma/dev.db', 'development', path.resolve('/b/server'));
    expect(a).not.toBe(b);
    expect(a).toContain(path.join('a', 'server'));
    expect(b).toContain(path.join('b', 'server'));
  });
});
