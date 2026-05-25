/**
 * Pre-paywall preview stash.
 *
 * Free users on /results click "Unlock" to start Stripe checkout. Stripe
 * sends them back to /upload?welcome=1, which loses the in-memory
 * UploadContext (full page reload). We persist the parsed data + engine
 * result here so the post-checkout landing can restore it and jump directly
 * to /results without making the user re-upload.
 *
 * sessionStorage is per-tab, per-origin. The Stripe redirect stays in the
 * same tab so the stash survives. A 1-hour TTL guards against stale data
 * if Stripe checkout sits idle.
 */
import type { Transaction, TaxCalculationResult, SecurityBreakdown, ParseResult } from '@shared/index';

const STASH_KEY = 'investax_upload_stash_v1';
const STASH_TTL_MS = 60 * 60 * 1000;

export interface UploadStash {
  parseResult: ParseResult | null;
  parseWarnings: string[];
  transactions: Transaction[];
  taxResult: TaxCalculationResult | null;
  securities: SecurityBreakdown[];
  fileName: string;
  taxYear: number;
  stashedAt: number;
}

export function stashUploadForCheckout(state: Omit<UploadStash, 'stashedAt'>): void {
  try {
    const payload: UploadStash = { ...state, stashedAt: Date.now() };
    sessionStorage.setItem(STASH_KEY, JSON.stringify(payload));
  } catch {
    // Quota exceeded or storage unavailable: user will see the re-upload UX
    // on return instead. Don't surface a noisy error here.
  }
}

/**
 * Reads + clears the stash atomically. Returns null if absent or expired.
 */
export function consumeUploadStash(): UploadStash | null {
  try {
    const raw = sessionStorage.getItem(STASH_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(STASH_KEY);
    const parsed = JSON.parse(raw) as UploadStash;
    if (typeof parsed.stashedAt !== 'number') return null;
    if (Date.now() - parsed.stashedAt > STASH_TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Reads without clearing. Used by tests to assert what was stashed.
 */
export function peekUploadStash(): UploadStash | null {
  try {
    const raw = sessionStorage.getItem(STASH_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as UploadStash;
    if (typeof parsed.stashedAt !== 'number') return null;
    if (Date.now() - parsed.stashedAt > STASH_TTL_MS) {
      sessionStorage.removeItem(STASH_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearUploadStash(): void {
  try {
    sessionStorage.removeItem(STASH_KEY);
  } catch {
    // ignore
  }
}
