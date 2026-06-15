import { describe, it, expect } from 'vitest';
import { parseDigestArgs, digestSubject, buildDigestBody } from '../analytics-digest.js';
import { summarize, type AnalyticsRow } from '../analytics-report.js';
import { summarizeErrors, type ErrorIssueRow } from '../errors-report.js';

const NOW = new Date('2026-06-15T12:00:00.000Z');

describe('parseDigestArgs', () => {
  it('defaults to a 7-day window in dry-run mode', () => {
    const d = parseDigestArgs([], NOW);
    expect(d.send).toBe(false);
    expect(d.opts.label).toBe('last 7 day(s)');
    expect(d.opts.since).toEqual(new Date('2026-06-08T12:00:00.000Z'));
  });

  it('sets send=true on --send while keeping the default 7-day window', () => {
    const d = parseDigestArgs(['--send'], NOW);
    expect(d.send).toBe(true);
    expect(d.opts.label).toBe('last 7 day(s)');
  });

  it('honors an explicit window alongside --send', () => {
    const d = parseDigestArgs(['--days', '30', '--send'], NOW);
    expect(d.send).toBe(true);
    expect(d.opts.label).toBe('last 30 day(s)');
    expect(d.opts.since).toEqual(new Date('2026-05-16T12:00:00.000Z'));
  });

  it('supports --all (no window) and --since', () => {
    expect(parseDigestArgs(['--all'], NOW).opts.since).toBeUndefined();
    expect(parseDigestArgs(['--since', '2026-06-01'], NOW).opts.label).toBe('since 2026-06-01');
  });

  it('rejects an unknown flag (via the shared parser)', () => {
    expect(() => parseDigestArgs(['--nope'], NOW)).toThrow(/Unknown argument/);
  });
});

describe('digestSubject', () => {
  it('embeds the window label', () => {
    expect(digestSubject('last 7 day(s)')).toBe('[InvesTax] Analytics digest (last 7 day(s))');
  });
});

describe('buildDigestBody', () => {
  const analyticsRows: AnalyticsRow[] = [
    { name: 'pageview', path: '/', referrer: 'chatgpt.com', createdAt: NOW },
    { name: 'pricing_viewed', path: null, referrer: null, createdAt: NOW },
  ];
  const errorRows: ErrorIssueRow[] = [
    {
      fingerprint: 'abc',
      source: 'server',
      name: 'TypeError',
      message: 'boom',
      context: 'auth.signup',
      count: 3,
      firstSeen: NOW,
      lastSeen: NOW,
    },
  ];

  it('stitches the analytics and errors sections with a divider and a footer', () => {
    const body = buildDigestBody(
      summarize(analyticsRows, 'last 7 day(s)'),
      summarizeErrors(errorRows, 'last 7 day(s)')
    );
    // Both self-labelled section headers are present.
    expect(body).toContain('InvesTax analytics - last 7 day(s)');
    expect(body).toContain('InvesTax errors - last 7 day(s)');
    // The new daily-activity block (from formatReport) rides along.
    expect(body).toContain('Daily activity (events / pageviews):');
    // The error issue shows through.
    expect(body).toContain('TypeError: boom');
    // Divider + provenance footer.
    expect(body).toContain('========================================');
    expect(body).toContain('Sent automatically from the InvesTax production server.');
  });

  it('handles an empty window without throwing', () => {
    const body = buildDigestBody(
      summarize([], 'last 7 day(s)'),
      summarizeErrors([], 'last 7 day(s)')
    );
    expect(body).toContain('Total events: 0');
    expect(body).toContain('(no errors recorded in this window)');
  });
});
