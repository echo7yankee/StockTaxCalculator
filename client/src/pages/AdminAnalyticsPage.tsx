import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { RefreshCw, Loader2, BarChart3 } from 'lucide-react';

// Operator-only analytics dashboard. Reads the same first-party data the
// `npm run analytics` CLI prints, via the admin-gated GET /api/analytics/summary.
// All access control is server-side (ADMIN_EMAILS allowlist); this page just
// reflects 401/403 into a friendly prompt. Not linked in any nav and noindexed:
// reach it directly at /admin/analytics.

type WindowSel = '7' | '30' | 'all';
const REFRESH_MS = 15000;

interface Summary {
  label: string;
  total: number;
  pageviews: number;
  topPaths: { path: string; count: number }[];
  topReferrers: { host: string; count: number }[];
  funnel: { name: string; count: number }[];
  otherEvents: { name: string; count: number }[];
}

interface ErrorIssue {
  fingerprint: string;
  source: string;
  name: string;
  message: string;
  context: string | null;
  count: number;
  firstSeen: string;
  lastSeen: string;
}

interface ErrorSummary {
  label: string;
  issues: number;
  occurrences: number;
  rows: ErrorIssue[];
}

type ErrorKind = 'auth' | 'forbidden' | 'network' | null;

function queryFor(w: WindowSel): string {
  return w === 'all' ? '?all' : `?days=${w}`;
}

function pct(part: number, whole: number): string {
  if (whole <= 0) return 'n/a';
  return `${((part / whole) * 100).toFixed(1)}%`;
}

const WINDOWS: { key: WindowSel; label: string }[] = [
  { key: '7', label: '7 days' },
  { key: '30', label: '30 days' },
  { key: 'all', label: 'All time' },
];

export default function AdminAnalyticsPage() {
  const [data, setData] = useState<Summary | null>(null);
  const [errors, setErrors] = useState<ErrorSummary | null>(null);
  const [errorKind, setErrorKind] = useState<ErrorKind>(null);
  const [loading, setLoading] = useState(true);
  const [windowSel, setWindowSel] = useState<WindowSel>('30');
  const [auto, setAuto] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const load = useCallback(
    async (showSpinner: boolean) => {
      if (showSpinner) setLoading(true);
      try {
        // Fetch the analytics summary + the error issues in parallel over the same
        // window. The summary drives the auth/permission gate (both endpoints share
        // the same requireAdmin gate, so one signal is enough); the errors response
        // is best-effort and just feeds the Errors section.
        const [res, errRes] = await Promise.all([
          fetch(`/api/analytics/summary${queryFor(windowSel)}`, { credentials: 'include' }),
          fetch(`/api/analytics/errors${queryFor(windowSel)}`, { credentials: 'include' }),
        ]);
        if (res.status === 401) {
          setErrorKind('auth');
          setData(null);
          setErrors(null);
          return;
        }
        if (res.status === 403) {
          setErrorKind('forbidden');
          setData(null);
          setErrors(null);
          return;
        }
        if (!res.ok) {
          setErrorKind('network');
          return;
        }
        setData((await res.json()) as Summary);
        setErrors(errRes.ok ? ((await errRes.json()) as ErrorSummary) : null);
        setErrorKind(null);
        setUpdatedAt(new Date());
      } catch {
        setErrorKind('network');
      } finally {
        if (showSpinner) setLoading(false);
      }
    },
    [windowSel]
  );

  // Initial load + reload (with spinner) whenever the window changes. Same
  // fetch-in-effect loading toggle Dashboard uses; a data-fetching library is
  // out of scope for an internal operator page.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load(true);
  }, [load]);

  // Background polling (no spinner) for the live view. Skipped when auto-refresh
  // is off, or when we are blocked on auth/permission (retrying would just 401/403).
  useEffect(() => {
    if (!auto || errorKind === 'auth' || errorKind === 'forbidden') return;
    const id = setInterval(() => load(false), REFRESH_MS);
    return () => clearInterval(id);
  }, [auto, errorKind, load]);

  return (
    <div className="max-w-6xl mx-auto px-4 py-12">
      <Helmet>
        <title>Analytics | InvesTax</title>
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>

      <div className="flex flex-wrap items-start justify-between gap-4 mb-2">
        <div className="flex items-center gap-3">
          <BarChart3 className="w-7 h-7 text-accent dark:text-accent-light" />
          <h1 className="text-3xl font-bold">Analytics</h1>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setAuto((a) => !a)}
            aria-pressed={auto}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm border transition-colors ${
              auto
                ? 'border-green-500/40 text-green-600 dark:text-green-400'
                : 'border-gray-300 dark:border-navy-600 text-gray-600 dark:text-slate-400'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${auto ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`}
            />
            {auto ? 'Live' : 'Paused'}
          </button>
          <button
            type="button"
            onClick={() => load(true)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm border border-gray-300 dark:border-navy-600 text-gray-600 dark:text-slate-300 hover:border-accent transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      <p className="text-gray-600 dark:text-slate-400 mb-6">
        First-party, cookieless analytics{data ? ` (${data.label})` : ''}.
        {updatedAt && (
          <span className="ml-1">Updated {updatedAt.toLocaleTimeString()}.</span>
        )}
      </p>

      {/* Window selector */}
      <div className="flex gap-2 mb-8">
        {WINDOWS.map((w) => (
          <button
            key={w.key}
            type="button"
            onClick={() => setWindowSel(w.key)}
            aria-pressed={windowSel === w.key}
            className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
              windowSel === w.key
                ? 'border-accent bg-accent/10 text-accent dark:text-accent-light'
                : 'border-gray-300 dark:border-navy-600 text-gray-600 dark:text-slate-400 hover:border-accent'
            }`}
          >
            {w.label}
          </button>
        ))}
      </div>

      {/* Auth / permission prompts */}
      {errorKind === 'auth' && (
        <div className="card text-center py-12">
          <p className="text-lg mb-2">Sign in as an admin to view analytics.</p>
          <p className="text-sm text-gray-500 dark:text-slate-400 mb-6">
            This page is restricted to operator accounts.
          </p>
          <Link to="/login" className="btn-primary">Log in</Link>
        </div>
      )}

      {errorKind === 'forbidden' && (
        <div className="card text-center py-12">
          <p className="text-lg mb-2">This account does not have analytics access.</p>
          <p className="text-sm text-gray-500 dark:text-slate-400">
            Add your login email to the <code className="font-mono">ADMIN_EMAILS</code> env var on
            the server, then reload.
          </p>
        </div>
      )}

      {/* Loading (first paint, no data yet) */}
      {loading && !data && !errorKind && (
        <div className="card flex items-center justify-center py-16 text-gray-500 dark:text-slate-400">
          <Loader2 className="w-6 h-6 animate-spin mr-3" />
          Loading analytics...
        </div>
      )}

      {/* Transient refresh failure, but we still have prior data to show */}
      {errorKind === 'network' && data && (
        <div className="mb-6 px-4 py-3 rounded-lg border border-amber-500/40 bg-amber-500/10 text-sm text-amber-700 dark:text-amber-400">
          Could not refresh. Showing the last loaded numbers.
        </div>
      )}
      {errorKind === 'network' && !data && (
        <div className="card text-center py-12 text-red-500">
          Could not load analytics. Check the server and try Refresh.
        </div>
      )}

      {data && (
        <div className="space-y-8">
          {/* Headline counters */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <Stat label="Total events" value={data.total} />
            <Stat label="Pageviews" value={data.pageviews} />
            <Stat label="Payments" value={funnelCount(data, 'payment_completed')} />
          </div>

          {/* Conversion funnel */}
          <section className="card">
            <h2 className="text-xl font-semibold mb-4">Conversion funnel</h2>
            {data.funnel.every((s) => s.count === 0) ? (
              <p className="text-gray-500 dark:text-slate-400 text-sm">No funnel events yet.</p>
            ) : (
              <ul className="space-y-2">
                {data.funnel.map((step, i) => {
                  const first = data.funnel[0]?.count ?? 0;
                  const prev = i === 0 ? first : data.funnel[i - 1].count;
                  return (
                    <li
                      key={step.name}
                      className="flex items-center justify-between border-b border-gray-100 dark:border-navy-700 last:border-0 py-2"
                    >
                      <span className="font-mono text-sm">{step.name}</span>
                      <span className="flex items-baseline gap-3">
                        <span className="font-bold text-lg tabular-nums">{step.count}</span>
                        {i > 0 && (
                          <span className="text-xs text-gray-500 dark:text-slate-400 w-28 text-right">
                            {pct(step.count, prev)} of prev
                          </span>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* Top pages + referrers */}
          <div className="grid md:grid-cols-2 gap-8">
            <CountTable
              title="Top pages"
              empty="No pageviews yet."
              rows={data.topPaths.map((p) => ({ label: p.path, count: p.count }))}
            />
            <CountTable
              title="Top referrers"
              empty="No referrers yet (direct traffic)."
              rows={data.topReferrers.map((r) => ({ label: r.host, count: r.count }))}
            />
          </div>

          {/* Other tracked events */}
          <section className="card">
            <h2 className="text-xl font-semibold mb-4">Other events</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-2">
              {data.otherEvents.map((e) => (
                <div key={e.name} className="flex items-center justify-between text-sm border-b border-gray-100 dark:border-navy-700 py-1.5">
                  <span className="font-mono text-gray-600 dark:text-slate-400 truncate mr-2">{e.name}</span>
                  <span className="font-semibold tabular-nums">{e.count}</span>
                </div>
              ))}
            </div>
          </section>

          {/* Errors (first-party error monitoring, server + client) */}
          <ErrorsSection errors={errors} />
        </div>
      )}
    </div>
  );
}

// Renders the grouped error "issues" (most frequent first, as returned) from the
// admin errors endpoint, with a source badge, name: message, count, and
// first/last-seen. This operator-only page is hardcoded English throughout to
// match its existing pattern.
function ErrorsSection({ errors }: { errors: ErrorSummary | null }) {
  return (
    <section className="card">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">Errors</h2>
        {errors && errors.rows.length > 0 && (
          <span className="text-sm text-gray-500 dark:text-slate-400 tabular-nums">
            {errors.issues} issues / {errors.occurrences} occurrences
          </span>
        )}
      </div>
      {!errors || errors.rows.length === 0 ? (
        <p className="text-gray-500 dark:text-slate-400 text-sm">
          No errors recorded.
        </p>
      ) : (
        <ul className="space-y-3">
          {errors.rows.map((e) => (
            <li
              key={e.fingerprint}
              className="border-b border-gray-100 dark:border-navy-700 last:border-0 pb-3 last:pb-0"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <SourceBadge source={e.source} />
                  <span className="font-mono text-sm text-gray-800 dark:text-slate-200 break-words">
                    {e.name}: {e.message}
                  </span>
                </div>
                <span className="font-bold text-lg tabular-nums shrink-0">{e.count}</span>
              </div>
              <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">
                first {fmtTime(e.firstSeen)} / last {fmtTime(e.lastSeen)}
                {e.context ? ` / ${e.context}` : ''}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function SourceBadge({ source }: { source: string }) {
  const isServer = source === 'server';
  return (
    <span
      className={`inline-block mr-2 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide align-middle ${
        isServer
          ? 'bg-purple-500/15 text-purple-600 dark:text-purple-300'
          : 'bg-sky-500/15 text-sky-600 dark:text-sky-300'
      }`}
    >
      {source}
    </span>
  );
}

// 'YYYY-MM-DD HH:MM' in local time, mirroring the CLI's isoMinute readout.
function fmtTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-GB', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function funnelCount(data: Summary, name: string): number {
  return data.funnel.find((s) => s.name === name)?.count ?? 0;
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="card">
      <p className="text-sm text-gray-500 dark:text-slate-400">{label}</p>
      <p className="text-3xl font-bold mt-1 tabular-nums">{value.toLocaleString('en-US')}</p>
    </div>
  );
}

function CountTable({
  title,
  empty,
  rows,
}: {
  title: string;
  empty: string;
  rows: { label: string; count: number }[];
}) {
  return (
    <section className="card">
      <h2 className="text-xl font-semibold mb-4">{title}</h2>
      {rows.length === 0 ? (
        <p className="text-gray-500 dark:text-slate-400 text-sm">{empty}</p>
      ) : (
        <ul>
          {rows.map((r) => (
            <li
              key={r.label}
              className="flex items-center justify-between border-b border-gray-100 dark:border-navy-700 last:border-0 py-2 text-sm"
            >
              <span className="font-mono text-gray-700 dark:text-slate-300 truncate mr-3">{r.label}</span>
              <span className="font-semibold tabular-nums">{r.count}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
