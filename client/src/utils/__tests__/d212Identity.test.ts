import { describe, it, expect } from 'vitest';
import {
  isValidCnp,
  isValidRoIban,
  isValidRoPhone,
  normalizeIban,
  checkRequiredText,
  checkCnp,
  checkIban,
  checkPhone,
} from '../d212Identity';

// Control digits computed with the official 279146358279 weights.
const VALID_CNPS = ['1960315123451', '2980714234568', '5010920345679'];

describe('isValidCnp', () => {
  it('accepts CNPs with a correct control digit', () => {
    for (const cnp of VALID_CNPS) expect(isValidCnp(cnp)).toBe(true);
  });

  it('rejects a CNP with a wrong control digit', () => {
    // 1960315123451 is valid; bumping the last digit breaks the checksum.
    expect(isValidCnp('1960315123452')).toBe(false);
  });

  it('rejects wrong length, non-digits, and a zero leading digit', () => {
    expect(isValidCnp('123')).toBe(false);
    expect(isValidCnp('19603151234512')).toBe(false); // 14 digits
    expect(isValidCnp('196031512345a')).toBe(false);
    expect(isValidCnp('0960315123451')).toBe(false); // leading 0 not allowed
    expect(isValidCnp('')).toBe(false);
  });

  it('trims surrounding whitespace', () => {
    expect(isValidCnp('  1960315123451  ')).toBe(true);
  });
});

describe('isValidRoIban', () => {
  it('accepts valid Romanian IBANs (mod-97 == 1)', () => {
    expect(isValidRoIban('RO49AAAA1B31007593840000')).toBe(true);
    expect(isValidRoIban('RO09BCYP0000001234567890')).toBe(true);
  });

  it('accepts a spaced or lower-cased IBAN after normalization', () => {
    expect(isValidRoIban('RO49 AAAA 1B31 0075 9384 0000')).toBe(true);
    expect(isValidRoIban('ro49aaaa1b31007593840000')).toBe(true);
  });

  it('rejects a non-Romanian IBAN', () => {
    expect(isValidRoIban('GB82WEST12345698765432')).toBe(false);
  });

  it('rejects a bad checksum and a wrong length', () => {
    expect(isValidRoIban('RO00AAAA1B31007593840000')).toBe(false); // checksum
    expect(isValidRoIban('RO49AAAA1B3100759384')).toBe(false); // too short
    expect(isValidRoIban('')).toBe(false);
  });
});

describe('normalizeIban', () => {
  it('strips whitespace and upper-cases', () => {
    expect(normalizeIban('ro49 aaaa 1b31 0075 9384 0000')).toBe('RO49AAAA1B31007593840000');
  });
});

describe('isValidRoPhone', () => {
  it('accepts plausible Romanian phone shapes', () => {
    expect(isValidRoPhone('0712345678')).toBe(true);
    expect(isValidRoPhone('+40712345678')).toBe(true);
    expect(isValidRoPhone('0712 345 678')).toBe(true);
    expect(isValidRoPhone('(021) 123-4567')).toBe(true);
  });

  it('rejects garbage and too-short input', () => {
    expect(isValidRoPhone('abc')).toBe(false);
    expect(isValidRoPhone('12')).toBe(false);
    expect(isValidRoPhone('')).toBe(false);
  });
});

describe('field checks', () => {
  it('checkRequiredText flags empty/whitespace only', () => {
    expect(checkRequiredText('')).toBe('required');
    expect(checkRequiredText('   ')).toBe('required');
    expect(checkRequiredText('Popescu')).toBeNull();
  });

  it('checkCnp distinguishes required from invalid', () => {
    expect(checkCnp('')).toBe('required');
    expect(checkCnp('123')).toBe('invalid');
    expect(checkCnp('1960315123451')).toBeNull();
  });

  it('checkIban distinguishes required from invalid', () => {
    expect(checkIban('')).toBe('required');
    expect(checkIban('GB82WEST12345698765432')).toBe('invalid');
    expect(checkIban('RO49AAAA1B31007593840000')).toBeNull();
  });

  it('checkPhone distinguishes required from invalid', () => {
    expect(checkPhone('')).toBe('required');
    expect(checkPhone('abc')).toBe('invalid');
    expect(checkPhone('0712345678')).toBeNull();
  });
});
