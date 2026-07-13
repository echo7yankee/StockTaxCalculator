import { PrismaClient } from '@prisma/client';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Resolve the local dev server's RELATIVE SQLite `file:` URL to an absolute path.
//
// Only the local dev server hits this bug (#195). `index.ts` imports
// `dotenv/config`, which injects DATABASE_URL (`file:./prisma/dev.db`) into
// process.env before Prisma initializes. Prisma 6 then resolves that relative
// path against a base that is NOT the server package root, so any process
// spawned with a different working directory (Playwright's webServer,
// `concurrently`, the npm workspace runner) cannot open server/prisma/dev.db and
// fails with SQLite error 14 (SQLITE_CANTOPEN). Anchoring the relative path to
// the server package root makes resolution independent of cwd / spawn context.
//
// Scoped to NODE_ENV=development ONLY. Tests configure their own DATABASE_URL
// (CI: `file:./dev.db`, created by `prisma db push`) and production honors its
// env as-is; both are left byte-identical to the plain `new PrismaClient()`.
export function resolveRelativeSqliteUrl(
  databaseUrl: string | undefined,
  nodeEnv: string | undefined,
  serverRoot: string,
): string | undefined {
  if (nodeEnv !== 'development') return undefined;
  const match = databaseUrl ? /^file:(.+)$/.exec(databaseUrl) : null;
  if (!match) return undefined;
  const filePath = match[1];
  if (path.isAbsolute(filePath)) return undefined;
  return `file:${path.resolve(serverRoot, filePath)}`;
}

// This file is server/src/lib/prisma.ts (dev runs from source via tsx), so three
// levels up is the server package root that a relative DATABASE_URL is anchored to.
const serverRoot = path.resolve(fileURLToPath(import.meta.url), '..', '..', '..');
const resolvedUrl = resolveRelativeSqliteUrl(
  process.env.DATABASE_URL,
  process.env.NODE_ENV,
  serverRoot,
);

const prisma = resolvedUrl
  ? new PrismaClient({ datasources: { db: { url: resolvedUrl } } })
  : new PrismaClient();

export default prisma;
