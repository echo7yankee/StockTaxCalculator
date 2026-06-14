import { describe, it, expect } from 'vitest';
import {
  parseReportArgs,
  summarize,
  formatReport,
  FUNNEL,
  type AnalyticsRow,
} from '../analytics-report.js';

const NOW = new Date('2026-06-13T12:00:00.000Z');

describe('parseReportArgs', () => {
  it('defaults to a 30-day window', () => {
    const o = parseReportArgs([], NOW);
    expect(o.label).toBe('last 30 days');
    expect(o.since).toEqual(new Date('2026-05-14T12:00:00.000Z'));
  });

  it('--days N sets an N-day window', () => {
    const o = parseReportArgs(['--days', '7'], NOW);
    expect(o.since).toEqual(new Date('2026-06-06T12:00:00.000Z'));
    expect(o.label).toBe('last 7 day(s)');
  });

  it('--all clears the window', () => {
    const o = parseReportArgs(['--all'], NOW);
    expect(o.since).toBeUndefined();
    expect(o.label).toBe('all time');
  });

  it('--since parses a date', () => {
    const o = parseReportArgs(['--since', '2026-06-01'], NOW);
    expect(o.since).toEqual(new Date('2026-06-01'));
    expect(o.label).toBe('since 2026-06-01');
  });

  it('throws on a non-numeric --days', () => {
    expect(() => parseReportArgs(['--days', 'x'], NOW)).toThrow(/positive number/);
  });

  it('accepts a large-but-bounded --days at the limit', () => {
    const o = parseReportArgs(['--days', '36500'], NOW);
    expect(o.since).toEqual(new Date(NOW.getTime() - 36500 * 24 * 60 * 60 * 1000));
    expect(o.label).toBe('last 36500 day(s)');
  });

  it('throws on an absurdly large --days (no NaN/overflow Date, returns a clean error)', () => {
    expect(() => parseReportArgs(['--days', '36501'], NOW)).toThrow(/positive number/);
    expect(() => parseReportArgs(['--days', '99999999999999999999'], NOW)).toThrow(/positive number/);
  });

  it('throws on an unparseable --since', () => {
    expect(() => parseReportArgs(['--since', 'notadate'], NOW)).toThrow(/expects a date/);
  });

  it('throws on an unknown flag', () => {
    expect(() => parseReportArgs(['--nope'], NOW)).toThrow(/Unknown argument/);
  });
});

function row(name: string, extra: Partial<AnalyticsRow> = {}): AnalyticsRow {
  return { name, path: null, referrer: null, createdAt: NOW, ...extra };
}

const SAMPLE: AnalyticsRow[] = [
  row('pageview', { path: '/', referrer: 'chatgpt.com' }),
  row('pageview', { path: '/', referrer: 'google.com' }),
  row('pageview', { path: '/pricing', referrer: 'chatgpt.com' }),
  row('paywall_seen'),
  row('paywall_seen'),
  row('pricing_viewed'),
  row('checkout_started'),
  row('payment_completed'),
  row('calculator_used'),
];

describe('summarize', () => {
  it('counts totals and pageviews', () => {
    const s = summarize(SAMPLE, 'test');
    expect(s.total).toBe(9);
    expect(s.pageviews).toBe(3);
  });

  it('ranks top paths and referrers from pageviews only', () => {
    const s = summarize(SAMPLE, 'test');
    expect(s.topPaths[0]).toEqual({ path: '/', count: 2 });
    expect(s.topReferrers[0]).toEqual({ host: 'chatgpt.com', count: 2 });
  });

  it('reports the funnel in canonical order with counts', () => {
    const s = summarize(SAMPLE, 'test');
    expect(s.funnel.map((f) => f.name)).toEqual([...FUNNEL]);
    expect(s.funnel.find((f) => f.name === 'paywall_seen')?.count).toBe(2);
    expect(s.funnel.find((f) => f.name === 'payment_completed')?.count).toBe(1);
  });

  it('lists non-funnel events, defaulting absent ones to zero', () => {
    const s = summarize(SAMPLE, 'test');
    expect(s.otherEvents.find((e) => e.name === 'calculator_used')?.count).toBe(1);
    expect(s.otherEvents.find((e) => e.name === 'pdf_exported')?.count).toBe(0);
  });

  it('does not count funnel/other events as pageviews for path ranking', () => {
    const s = summarize(SAMPLE, 'test');
    // only the 3 pageview rows contribute paths
    const totalPathCounts = s.topPaths.reduce((acc, p) => acc + p.count, 0);
    expect(totalPathCounts).toBe(3);
  });
});

describe('formatReport', () => {
  it('produces a readable report with funnel conversion percentages', () => {
    const s = summarize([row('paywall_seen'), row('paywall_seen'), row('pricing_viewed')], 'last 7 day(s)');
    const out = formatReport(s).join('\n');
    expect(out).toContain('InvesTax analytics - last 7 day(s)');
    expect(out).toContain('Conversion funnel:');
    expect(out).toContain('paywall_seen');
    // pricing_viewed (1) of paywall_seen (2) = 50.0%
    expect(out).toContain('50.0%');
  });

  it('handles an empty dataset without dividing by zero', () => {
    const out = formatReport(summarize([], 'all time')).join('\n');
    expect(out).toContain('Total events: 0');
    expect(out).toContain('(none)');
    expect(out).toContain('n/a');
  });
});
