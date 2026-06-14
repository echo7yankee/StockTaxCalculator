import { describe, it, expect } from 'vitest';
import {
  summarizeErrors,
  formatErrorReport,
  type ErrorIssueRow,
} from '../errors-report.js';

function issue(extra: Partial<ErrorIssueRow> = {}): ErrorIssueRow {
  return {
    fingerprint: 'aaaaaaaaaaaaaaaa',
    source: 'server',
    name: 'Error',
    message: 'boom',
    context: null,
    count: 1,
    firstSeen: new Date('2026-06-14T08:00:00.000Z'),
    lastSeen: new Date('2026-06-14T09:00:00.000Z'),
    ...extra,
  };
}

describe('summarizeErrors', () => {
  it('counts distinct issues and total occurrences', () => {
    const s = summarizeErrors(
      [issue({ fingerprint: 'a', count: 3 }), issue({ fingerprint: 'b', count: 5 })],
      'last 7 day(s)'
    );
    expect(s.issues).toBe(2);
    expect(s.occurrences).toBe(8);
    expect(s.label).toBe('last 7 day(s)');
  });

  it('sorts most-frequent first, breaking ties by most-recent', () => {
    const older = new Date('2026-06-10T00:00:00.000Z');
    const newer = new Date('2026-06-14T00:00:00.000Z');
    const s = summarizeErrors(
      [
        issue({ fingerprint: 'low', count: 1 }),
        issue({ fingerprint: 'tie-old', count: 4, lastSeen: older }),
        issue({ fingerprint: 'tie-new', count: 4, lastSeen: newer }),
      ],
      'test'
    );
    expect(s.rows.map((r) => r.fingerprint)).toEqual(['tie-new', 'tie-old', 'low']);
  });

  it('does not mutate the input array', () => {
    const input = [issue({ fingerprint: 'a', count: 1 }), issue({ fingerprint: 'b', count: 9 })];
    summarizeErrors(input, 'test');
    expect(input.map((r) => r.fingerprint)).toEqual(['a', 'b']);
  });
});

describe('formatErrorReport', () => {
  it('renders a header, totals, and one block per issue', () => {
    const out = formatErrorReport(
      summarizeErrors(
        [
          issue({
            fingerprint: 'a',
            name: 'TypeError',
            message: "Cannot read x of undefined",
            context: 'GET /api/uploads',
            count: 7,
          }),
        ],
        'last 30 days'
      )
    ).join('\n');
    expect(out).toContain('InvesTax errors - last 30 days');
    expect(out).toContain('Distinct issues: 1  |  Total occurrences: 7');
    expect(out).toContain('7x  [server]  TypeError: Cannot read x of undefined');
    expect(out).toContain('GET /api/uploads');
    expect(out).toContain('first 2026-06-14 08:00');
    expect(out).toContain('last 2026-06-14 09:00');
  });

  it('shows an explicit empty-window message', () => {
    const out = formatErrorReport(summarizeErrors([], 'all time')).join('\n');
    expect(out).toContain('Distinct issues: 0  |  Total occurrences: 0');
    expect(out).toContain('(no errors recorded in this window)');
  });
});
