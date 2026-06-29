import { describe, it, expect } from 'vitest';
import { taxYearInterpVars, taxYearInterpVarsForYear } from '../taxYearVars';

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

describe('taxYearInterpVarsForYear', () => {
  it('names the requested supported prior year (2024) with its own deadline', () => {
    expect(taxYearInterpVarsForYear('ro', 2024)).toEqual({ taxYear: 2024, filingDeadline: '26 mai 2025' });
    expect(taxYearInterpVarsForYear('en', 2024)).toEqual({ taxYear: 2024, filingDeadline: 'May 26, 2025' });
  });

  it('names 2023 with the 2023 deadline', () => {
    expect(taxYearInterpVarsForYear('ro', 2023).taxYear).toBe(2023);
    expect(taxYearInterpVarsForYear('ro', 2023).filingDeadline).toBe('27 mai 2024');
  });

  it('falls back to the latest engine-supported year (2025) for an undefined or unknown year', () => {
    expect(taxYearInterpVarsForYear('ro', undefined).taxYear).toBe(2025);
    expect(taxYearInterpVarsForYear('ro', 2099).taxYear).toBe(2025);
  });
});
