import { describe, it, expect } from 'vitest';
import { taxYearInterpVars } from '../taxYearVars';

// These values are the byte-identical anchors for the #17 PR 2 copy sweep: every
// templatized {{taxYear}} / {{filingDeadline}} string must render to exactly these
// strings today (engine-supported year = 2025). If this test changes, every
// year-dynamic public string changes with it.
describe('taxYearInterpVars', () => {
  it('resolves to the current engine-supported tax year (2025)', () => {
    expect(taxYearInterpVars('ro').taxYear).toBe(2025);
    expect(taxYearInterpVars('en').taxYear).toBe(2025);
  });

  it('returns the Romanian filing deadline for ro locales', () => {
    expect(taxYearInterpVars('ro').filingDeadline).toBe('25 mai 2026');
    expect(taxYearInterpVars('ro-RO').filingDeadline).toBe('25 mai 2026');
  });

  it('returns the English filing deadline for non-ro locales', () => {
    expect(taxYearInterpVars('en').filingDeadline).toBe('May 25, 2026');
    expect(taxYearInterpVars('en-US').filingDeadline).toBe('May 25, 2026');
  });
});
