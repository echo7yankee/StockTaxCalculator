import { describe, it, expect } from 'vitest';
import { cassBracketLabelKey } from '../cassBracket';

describe('cassBracketLabelKey', () => {
  it('maps each engine CASS discriminator to its common-namespace i18n key', () => {
    expect(cassBracketLabelKey('none')).toBe('common:bracketNone');
    expect(cassBracketLabelKey('6x')).toBe('common:bracket6x');
    expect(cassBracketLabelKey('12x')).toBe('common:bracket12x');
    expect(cassBracketLabelKey('24x')).toBe('common:bracket24x');
  });

  it('falls back to bracketNone for an unrecognised discriminator', () => {
    expect(cassBracketLabelKey('')).toBe('common:bracketNone');
    expect(cassBracketLabelKey('99x')).toBe('common:bracketNone');
  });
});
