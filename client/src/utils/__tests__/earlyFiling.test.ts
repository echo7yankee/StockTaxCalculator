import { describe, it, expect } from 'vitest';
import { isBeforeEarlyFilingDeadline } from '../earlyFiling';

describe('isBeforeEarlyFilingDeadline', () => {
  it('returns true when today is before the deadline', () => {
    const now = new Date('2026-03-01T12:00:00Z');
    expect(isBeforeEarlyFilingDeadline('April 15', now)).toBe(true);
  });

  it('returns true on the deadline day itself (end-of-day grace)', () => {
    const now = new Date('2026-04-15T10:00:00');
    expect(isBeforeEarlyFilingDeadline('April 15', now)).toBe(true);
  });

  it('returns false when today is after the deadline', () => {
    const now = new Date('2026-04-16T12:00:00');
    expect(isBeforeEarlyFilingDeadline('April 15', now)).toBe(false);
  });

  it('returns false for undefined deadline', () => {
    expect(isBeforeEarlyFilingDeadline(undefined)).toBe(false);
  });

  it('returns false for unparseable deadline string', () => {
    expect(isBeforeEarlyFilingDeadline('15 April')).toBe(false);
    expect(isBeforeEarlyFilingDeadline('')).toBe(false);
    expect(isBeforeEarlyFilingDeadline('Aprilie 15')).toBe(false);
  });

  it('handles different months correctly', () => {
    const now = new Date('2026-06-01T12:00:00');
    expect(isBeforeEarlyFilingDeadline('December 31', now)).toBe(true);
    expect(isBeforeEarlyFilingDeadline('January 15', now)).toBe(false);
  });
});
