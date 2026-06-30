import { describe, it, expect, beforeEach } from 'vitest';
import { isPageviewSweep, resetPageviewSweepGuard } from '../analyticsBotGuard.js';

// MAX_IN_WINDOW = 8, WINDOW_MS = 60_000, COOLDOWN_MS = 15 * 60_000 (mirrors the module).
const IP = '203.0.113.7';

beforeEach(() => {
  resetPageviewSweepGuard();
});

describe('isPageviewSweep', () => {
  it('lets a normal reader through (<= 8 pageviews in the window)', () => {
    let now = 1_000_000;
    for (let i = 0; i < 8; i++) {
      expect(isPageviewSweep(IP, now)).toBe(false);
      now += 5_000; // a pageview every 5s for 8 hits = engaged human
    }
  });

  it('trips on the 9th pageview within the window and drops the rest', () => {
    const now = 1_000_000;
    for (let i = 0; i < 8; i++) expect(isPageviewSweep(IP, now + i * 1_000)).toBe(false);
    // 9th hit inside the same minute is over the limit -> dropped
    expect(isPageviewSweep(IP, now + 8_000)).toBe(true);
    // and everything after stays dropped (cooldown), even at a polite cadence
    expect(isPageviewSweep(IP, now + 30_000)).toBe(true);
    expect(isPageviewSweep(IP, now + 120_000)).toBe(true);
  });

  it('keeps an IP parked for the full cooldown, then lets it back in', () => {
    const start = 5_000_000;
    for (let i = 0; i < 9; i++) isPageviewSweep(IP, start + i * 1_000); // trips
    expect(isPageviewSweep(IP, start + 10 * 60_000)).toBe(true); // still parked at 10 min
    // After the 15-min cooldown elapses it is readmitted as a fresh reader.
    expect(isPageviewSweep(IP, start + 16 * 60_000)).toBe(false);
  });

  it('does not trip when hits are spread across separate windows', () => {
    let now = 2_000_000;
    // 4 hits, wait out the window, 4 more, repeat: never >8 inside one window.
    for (let round = 0; round < 5; round++) {
      for (let i = 0; i < 4; i++) {
        expect(isPageviewSweep(IP, now)).toBe(false);
        now += 1_000;
      }
      now += 61_000; // fully past WINDOW_MS so earlier hits age out
    }
  });

  it('tracks each IP independently', () => {
    const a = '198.51.100.1';
    const b = '198.51.100.2';
    const now = 3_000_000;
    for (let i = 0; i < 9; i++) isPageviewSweep(a, now + i * 1_000); // a trips
    expect(isPageviewSweep(a, now + 9_000)).toBe(true);
    expect(isPageviewSweep(b, now + 9_000)).toBe(false); // b is unaffected
  });
});
