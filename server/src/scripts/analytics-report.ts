// Operator-run analytics report CLI: reads the first-party AnalyticsEvent table
// and prints a pageview + referrer + conversion-funnel summary. Read-only and
// deliberately NOT an HTTP endpoint (shell access only = no auth surface).
// Requires a built dist (npm run build -w server).
//
//   npm run analytics -w server                  # last 30 days (default)
//   npm run analytics -w server -- --days 7      # last 7 days
//   npm run analytics -w server -- --since 2026-06-01
//   npm run analytics -w server -- --all         # no time filter
//
import { pathToFileURL } from 'node:url';
import { ANALYTICS_EVENTS } from '../lib/analyticsEvents.js';

export interface AnalyticsRow {
  name: string;
  path: string | null;
  referrer: string | null;
  createdAt: Date;
}

export interface ReportOptions {
  /** Inclusive lower bound on createdAt; undefined = all time. */
  since?: Date;
  /** Human description of the window, for the report header. */
  label: string;
}

// The ordered conversion funnel (paywall -> pricing -> checkout -> paid).
export const FUNNEL: readonly string[] = [
  'paywall_seen',
  'pricing_viewed',
  'checkout_started',
  'payment_completed',
];

export function parseReportArgs(argv: string[], now: Date): ReportOptions {
  let since: Date | undefined;
  let label = 'last 30 days';
  let sawWindow = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '--days': {
        const raw = argv[++i];
        const n = Number(raw);
        if (!Number.isFinite(n) || n <= 0) {
          throw new Error(`--days expects a positive number, got "${raw ?? ''}"`);
        }
        // Upper-bound the window so an absurd value (e.g. a 20-digit number from
        // the public-facing errors/analytics endpoints) returns 400, not a 500
        // from a NaN/overflowing Date. 36500 days = 100 years, far past any data.
        if (n > 36500) {
          throw new Error(`--days expects a positive number up to 36500, got "${raw ?? ''}"`);
        }
        since = new Date(now.getTime() - n * 24 * 60 * 60 * 1000);
        label = `last ${n} day(s)`;
        sawWindow = true;
        break;
      }
      case '--since': {
        const raw = argv[++i];
        const d = new Date(raw ?? 'invalid');
        if (Number.isNaN(d.getTime())) {
          throw new Error(`--since expects a date (YYYY-MM-DD), got "${raw ?? ''}"`);
        }
        since = d;
        label = `since ${raw}`;
        sawWindow = true;
        break;
      }
      case '--all':
        since = undefined;
        label = 'all time';
        sawWindow = true;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!sawWindow) {
    since = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  }
  return { since, label };
}

export interface ReportSummary {
  label: string;
  total: number;
  pageviews: number;
  topPaths: Array<{ path: string; count: number }>;
  topReferrers: Array<{ host: string; count: number }>;
  funnel: Array<{ name: string; count: number }>;
  otherEvents: Array<{ name: string; count: number }>;
}

export function summarize(rows: AnalyticsRow[], label: string, topN = 10): ReportSummary {
  const counts = new Map<string, number>();
  const paths = new Map<string, number>();
  const referrers = new Map<string, number>();

  for (const r of rows) {
    counts.set(r.name, (counts.get(r.name) ?? 0) + 1);
    if (r.name === 'pageview') {
      const p = r.path ?? '(unknown)';
      paths.set(p, (paths.get(p) ?? 0) + 1);
      if (r.referrer) referrers.set(r.referrer, (referrers.get(r.referrer) ?? 0) + 1);
    }
  }

  const topOf = (m: Map<string, number>, n: number) =>
    [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);

  const funnel = FUNNEL.map((name) => ({ name, count: counts.get(name) ?? 0 }));
  const otherEvents = ANALYTICS_EVENTS.filter((n) => n !== 'pageview' && !FUNNEL.includes(n)).map(
    (name) => ({ name, count: counts.get(name) ?? 0 })
  );

  return {
    label,
    total: rows.length,
    pageviews: counts.get('pageview') ?? 0,
    topPaths: topOf(paths, topN).map(([path, count]) => ({ path, count })),
    topReferrers: topOf(referrers, topN).map(([host, count]) => ({ host, count })),
    funnel,
    otherEvents,
  };
}

function pct(part: number, whole: number): string {
  if (whole <= 0) return 'n/a';
  return `${((part / whole) * 100).toFixed(1)}%`;
}

export function formatReport(s: ReportSummary): string[] {
  const lines: string[] = [];
  lines.push(`InvesTax analytics - ${s.label}`);
  lines.push(`Total events: ${s.total}  |  Pageviews: ${s.pageviews}`);

  lines.push('');
  lines.push('Top pages (by pageview):');
  if (s.topPaths.length === 0) lines.push('  (none)');
  for (const p of s.topPaths) lines.push(`  ${String(p.count).padStart(6)}  ${p.path}`);

  lines.push('');
  lines.push('Top referrers (channel attribution):');
  if (s.topReferrers.length === 0) lines.push('  (none / direct)');
  for (const r of s.topReferrers) lines.push(`  ${String(r.count).padStart(6)}  ${r.host}`);

  lines.push('');
  lines.push('Conversion funnel:');
  const first = s.funnel[0]?.count ?? 0;
  let prev = first;
  for (let i = 0; i < s.funnel.length; i++) {
    const step = s.funnel[i];
    const detail = i === 0 ? '' : `  (${pct(step.count, prev)} of prev, ${pct(step.count, first)} of ${s.funnel[0].name})`;
    lines.push(`  ${String(step.count).padStart(6)}  ${step.name}${detail}`);
    prev = step.count;
  }

  lines.push('');
  lines.push('Other events:');
  for (const e of s.otherEvents) lines.push(`  ${String(e.count).padStart(6)}  ${e.name}`);

  return lines;
}

const USAGE = `Usage:
  npm run analytics -w server -- [--days N | --since YYYY-MM-DD | --all]

Windows:
  (default)            last 30 days
  --days N             last N days
  --since YYYY-MM-DD   since the given date (inclusive)
  --all                no time filter`;

async function main(): Promise<void> {
  await import('dotenv/config');

  let opts: ReportOptions;
  try {
    opts = parseReportArgs(process.argv.slice(2), new Date());
  } catch (err) {
    console.error(`[analytics] ${err instanceof Error ? err.message : String(err)}\n`);
    console.error(USAGE);
    process.exitCode = 1;
    return;
  }

  const { default: prisma } = await import('../lib/prisma.js');
  try {
    const rows = await prisma.analyticsEvent.findMany({
      where: opts.since ? { createdAt: { gte: opts.since } } : undefined,
      select: { name: true, path: true, referrer: true, createdAt: true },
    });
    for (const line of formatReport(summarize(rows, opts.label))) console.log(line);
  } catch (err) {
    console.error(`[analytics] ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

// Run only when executed directly (node dist/scripts/analytics-report.js), never
// on import: tests import the pure functions above without touching the DB.
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
