// Operator-run error report CLI: reads the grouped ErrorEvent table and prints
// the distinct error "issues" (most frequent first) with occurrence counts and
// first/last-seen timestamps. Read-only and deliberately NOT an HTTP endpoint
// (shell access only = no auth surface), mirroring the analytics-report CLI.
// Requires a built dist (npm run build -w server).
//
//   npm run errors -w server                  # last 30 days (default)
//   npm run errors -w server -- --days 7      # last 7 days
//   npm run errors -w server -- --since 2026-06-01
//   npm run errors -w server -- --all         # no time filter
//
import { pathToFileURL } from 'node:url';
import { parseReportArgs, type ReportOptions } from './analytics-report.js';

export interface ErrorIssueRow {
  fingerprint: string;
  source: string;
  name: string;
  message: string;
  context: string | null;
  count: number;
  firstSeen: Date;
  lastSeen: Date;
}

export interface ErrorReportSummary {
  label: string;
  /** Distinct error fingerprints seen in the window. */
  issues: number;
  /** Sum of occurrence counts across those issues. */
  occurrences: number;
  /** Issues sorted most-frequent-first (ties broken by most-recent). */
  rows: ErrorIssueRow[];
}

export function summarizeErrors(rows: ErrorIssueRow[], label: string): ErrorReportSummary {
  const sorted = [...rows].sort(
    (a, b) => b.count - a.count || b.lastSeen.getTime() - a.lastSeen.getTime()
  );
  return {
    label,
    issues: sorted.length,
    occurrences: sorted.reduce((sum, r) => sum + r.count, 0),
    rows: sorted,
  };
}

// 'YYYY-MM-DD HH:MM' in UTC (the VPS runs UTC, so this matches the box clock).
function isoMinute(d: Date): string {
  return d.toISOString().slice(0, 16).replace('T', ' ');
}

export function formatErrorReport(s: ErrorReportSummary): string[] {
  const lines: string[] = [];
  lines.push(`InvesTax errors - ${s.label}`);
  lines.push(`Distinct issues: ${s.issues}  |  Total occurrences: ${s.occurrences}`);
  lines.push('');
  if (s.rows.length === 0) {
    lines.push('  (no errors recorded in this window)');
    return lines;
  }
  for (const r of s.rows) {
    lines.push(`  ${String(r.count).padStart(6)}x  [${r.source}]  ${r.name}: ${r.message}`);
    const where = r.context ? `  ${r.context}` : '';
    lines.push(`          first ${isoMinute(r.firstSeen)}  last ${isoMinute(r.lastSeen)}${where}`);
  }
  return lines;
}

const USAGE = `Usage:
  npm run errors -w server -- [--days N | --since YYYY-MM-DD | --all]

Windows (filter on when an issue was last seen):
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
    console.error(`[errors] ${err instanceof Error ? err.message : String(err)}\n`);
    console.error(USAGE);
    process.exitCode = 1;
    return;
  }

  const { default: prisma } = await import('../lib/prisma.js');
  try {
    const rows = await prisma.errorEvent.findMany({
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
    });
    for (const line of formatErrorReport(summarizeErrors(rows, opts.label))) console.log(line);
  } catch (err) {
    console.error(`[errors] ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

// Run only when executed directly (node dist/scripts/errors-report.js), never on
// import: tests import the pure functions above without touching the DB.
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
