// Operator analytics+errors digest: builds the same rollup the `npm run
// analytics` and `npm run errors` CLIs print, and (with --send) emails it to
// ADMIN_NOTIFICATION_EMAIL via the existing operator-notification path. This is
// the autonomous "weekly cron" half: a VPS crontab runs it with --send so the
// operator gets a recurring pulse in the inbox without logging in or starting a
// session. Read-only on the DB; shell-only (no HTTP surface). Requires a built
// dist (npm run build -w server).
//
//   npm run analytics:digest -w server                 # last 7 days, DRY-RUN (prints)
//   npm run analytics:digest -w server -- --send       # last 7 days, emails the admin
//   npm run analytics:digest -w server -- --days 30    # 30-day window, dry-run
//   npm run analytics:digest -w server -- --days 30 --send
//
import { pathToFileURL } from 'node:url';
import {
  parseReportArgs,
  summarize,
  formatReport,
  type ReportOptions,
  type ReportSummary,
} from './analytics-report.js';
import {
  summarizeErrors,
  formatErrorReport,
  type ErrorReportSummary,
} from './errors-report.js';

export interface DigestOptions {
  /** Whether to actually email (true) or just print the digest (false). */
  send: boolean;
  /** Window options, parsed by the shared analytics parseReportArgs. */
  opts: ReportOptions;
}

// Parse the digest CLI args. --send is extracted first (the shared
// parseReportArgs would reject it as unknown); the rest is the window. With NO
// window args we default to the last 7 days (a weekly digest), not the 30-day
// default the report CLIs use. Any remaining args ARE passed to parseReportArgs,
// so a typo'd/unknown flag still throws (a cron must fail loud, not silently
// run the wrong window).
export function parseDigestArgs(argv: string[], now: Date): DigestOptions {
  let send = false;
  const rest: string[] = [];
  for (const arg of argv) {
    if (arg === '--send') send = true;
    else rest.push(arg);
  }
  const opts = rest.length === 0 ? parseReportArgs(['--days', '7'], now) : parseReportArgs(rest, now);
  return { send, opts };
}

export function digestSubject(label: string): string {
  return `[InvesTax] Analytics digest (${label})`;
}

// Combine the analytics rollup and the error rollup into one plain-text body.
// Both formatters self-label their section header, so a divider is enough.
export function buildDigestBody(
  analytics: ReportSummary,
  errors: ErrorReportSummary
): string {
  const lines: string[] = [];
  lines.push(...formatReport(analytics));
  lines.push('');
  lines.push('========================================');
  lines.push('');
  lines.push(...formatErrorReport(errors));
  lines.push('');
  lines.push('Sent automatically from the InvesTax production server.');
  return lines.join('\n');
}

const USAGE = `Usage:
  npm run analytics:digest -w server -- [--days N | --since YYYY-MM-DD | --all] [--send]

Default window: last 7 days. Default mode: dry-run (prints; pass --send to email).
Emails ADMIN_NOTIFICATION_EMAIL when --send is given (no-op if that env var is unset).`;

// Load .env deterministically relative to THIS file, not the cwd. The npm
// workspace runner launches `-w server` scripts with cwd = server/, but pm2 and
// the cron run from the repo root; resolving .env off the cwd made the two
// diverge (a stale server/.env shadowed the root one and dropped
// ADMIN_NOTIFICATION_EMAIL, so --send silently no-opped on prod). Load the
// repo-root .env first (canonical on the box) then the server-local .env as a
// dev fallback; dotenv never overrides an already-set key, so root wins.
async function loadEnv(): Promise<void> {
  const dotenv = await import('dotenv');
  const { fileURLToPath } = await import('node:url');
  const { dirname, resolve } = await import('node:path');
  const here = dirname(fileURLToPath(import.meta.url)); // server/dist/scripts
  dotenv.config({ path: resolve(here, '../../../.env') }); // repo-root .env
  dotenv.config({ path: resolve(here, '../../.env') }); // server/.env (dev fallback)
}

async function main(): Promise<void> {
  await loadEnv();

  let parsed: DigestOptions;
  try {
    parsed = parseDigestArgs(process.argv.slice(2), new Date());
  } catch (err) {
    console.error(`[digest] ${err instanceof Error ? err.message : String(err)}\n`);
    console.error(USAGE);
    process.exitCode = 1;
    return;
  }
  const { send, opts } = parsed;

  const { default: prisma } = await import('../lib/prisma.js');
  try {
    const [analyticsRows, errorRows] = await Promise.all([
      prisma.analyticsEvent.findMany({
        where: opts.since ? { createdAt: { gte: opts.since } } : undefined,
        select: { name: true, path: true, referrer: true, createdAt: true },
      }),
      prisma.errorEvent.findMany({
        where: opts.since ? { lastSeen: { gte: opts.since } } : undefined,
        select: {
          fingerprint: true,
          source: true,
          name: true,
          message: true,
          context: true,
          count: true,
          firstSeen: true,
          lastSeen: true,
        },
      }),
    ]);

    const analytics = summarize(analyticsRows, opts.label);
    const errors = summarizeErrors(errorRows, opts.label);
    const body = buildDigestBody(analytics, errors);

    if (send) {
      // Lazy import keeps the email/prisma graph out of the pure-function tests
      // that import parseDigestArgs/buildDigestBody above.
      const { sendAnalyticsDigestNotification } = await import('../services/email.js');
      const sent = await sendAnalyticsDigestNotification({ subject: digestSubject(opts.label), body });
      if (sent) {
        console.log(`[digest] sent to ADMIN_NOTIFICATION_EMAIL (${opts.label})`);
      } else {
        // --send was asked for but the email layer skipped (admin address unset).
        // Fail loud so a misconfigured cron self-reports instead of looking healthy.
        console.error('[digest] --send requested but ADMIN_NOTIFICATION_EMAIL is not set; nothing sent');
        process.exitCode = 1;
      }
    } else {
      console.log(body);
      console.log('');
      console.log('[digest] dry-run: pass --send to email ADMIN_NOTIFICATION_EMAIL');
    }
  } catch (err) {
    console.error(`[digest] ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

// Run only when executed directly (node dist/scripts/analytics-digest.js), never
// on import: tests import the pure functions above without touching the DB/email.
const isDirectRun = (() => {
  try {
    return process.argv[1] ? import.meta.url === pathToFileURL(process.argv[1]).href : false;
  } catch {
    return false;
  }
})();

if (isDirectRun) {
  await main();
}
