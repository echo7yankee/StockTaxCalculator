/**
 * Client-side validation for the D212 filer identity (CNP / IBAN / name / phone).
 *
 * These fields are collected only to fill the `d212` root element of a generated
 * Declaratia Unica XML, which happens entirely in the browser (see the
 * `D212Download` component). The values never leave the device and are never
 * persisted, so this module does pure, synchronous validation with no network.
 *
 * A wrong CNP or IBAN would be rejected by ANAF / DUKIntegrator after the user
 * already trusted the file, so we validate them properly up front: the CNP by its
 * official control digit, the IBAN by the ISO 13616 mod-97 checksum.
 */

/** A field is either empty (`required`) or present-but-malformed (`invalid`). */
export type D212FieldError = 'required' | 'invalid';

/** CNP control-digit weights (the official `279146358279` constant). */
const CNP_WEIGHTS = [2, 7, 9, 1, 4, 6, 3, 5, 8, 2, 7, 9] as const;

/**
 * Validates a Romanian CNP (cod numeric personal): exactly 13 digits, a non-zero
 * leading sex/century digit, and a matching control digit. The control digit is
 * `sum(d[i] * weight[i]) mod 11`, mapped to `1` when the remainder is `10`.
 */
export function isValidCnp(cnp: string): boolean {
  const value = cnp.trim();
  if (!/^[1-9]\d{12}$/.test(value)) return false;
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += Number(value[i]) * CNP_WEIGHTS[i];
  }
  const remainder = sum % 11;
  const control = remainder === 10 ? 1 : remainder;
  return control === Number(value[12]);
}

/** Strips spaces and upper-cases an IBAN for validation/emit. */
export function normalizeIban(raw: string): string {
  return raw.replace(/\s+/g, '').toUpperCase();
}

/**
 * Validates a Romanian IBAN: the `RO` + 2 check digits + 20 alphanumeric BBAN
 * shape (24 chars total) and the ISO 13616 mod-97 checksum (rearrange so the
 * first four characters trail, map letters A-Z to 10-35, the integer mod 97 must
 * equal 1). ANAF refunds go to a Romanian account, so a non-RO IBAN is rejected.
 */
export function isValidRoIban(raw: string): boolean {
  const iban = normalizeIban(raw);
  if (!/^RO\d{2}[A-Z0-9]{20}$/.test(iban)) return false;
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let remainder = 0;
  for (const ch of rearranged) {
    const value = ch >= 'A' && ch <= 'Z' ? ch.charCodeAt(0) - 55 : Number(ch);
    // Each letter expands to a two-digit number, each digit to one: fold mod 97
    // incrementally so we never build an oversized integer.
    remainder = (remainder * (value > 9 ? 100 : 10) + value) % 97;
  }
  return remainder === 1;
}

/**
 * Lenient Romanian phone check: after stripping spaces, dashes and parentheses,
 * an optional leading `+` followed by 7-15 digits. The phone is a contact field
 * on the declaration, not a checksum-bearing identifier, so we only guard against
 * obvious garbage.
 */
export function isValidRoPhone(raw: string): boolean {
  const cleaned = raw.replace(/[\s\-()]/g, '');
  return /^\+?\d{7,15}$/.test(cleaned);
}

/** Required free-text field (surname, given name): non-empty after trimming. */
export function checkRequiredText(value: string): D212FieldError | null {
  return value.trim().length === 0 ? 'required' : null;
}

/** CNP field: required, then format + control digit. */
export function checkCnp(value: string): D212FieldError | null {
  if (value.trim().length === 0) return 'required';
  return isValidCnp(value) ? null : 'invalid';
}

/** IBAN field: required, then RO shape + mod-97. */
export function checkIban(value: string): D212FieldError | null {
  if (value.trim().length === 0) return 'required';
  return isValidRoIban(value) ? null : 'invalid';
}

/** Phone field: required, then lenient shape. */
export function checkPhone(value: string): D212FieldError | null {
  if (value.trim().length === 0) return 'required';
  return isValidRoPhone(value) ? null : 'invalid';
}
