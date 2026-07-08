import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { analytics } from '../analytics';

async function beaconBody(blob: unknown): Promise<{ name?: string; path?: string; referrer?: string }> {
  return JSON.parse(await (blob as Blob).text());
}

describe('analytics (first-party emitter)', () => {
  const beacon = vi.fn((_url: string, _data?: BodyInit | null) => true);

  beforeEach(() => {
    beacon.mockClear();
    vi.stubGlobal('navigator', { sendBeacon: beacon });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends a beacon to /api/track carrying the event name and current path', async () => {
    analytics.paywallSeen();
    expect(beacon).toHaveBeenCalledTimes(1);
    const [url, blob] = beacon.mock.calls[0];
    expect(url).toBe('/api/track');
    const body = await beaconBody(blob);
    expect(body.name).toBe('paywall_seen');
    expect(body.path).toBe('/'); // jsdom default location
  });

  it('maps each public method to its canonical event name', async () => {
    const cases: Array<[() => void, string]> = [
      [analytics.pageview, 'pageview'],
      [analytics.signupCompleted, 'signup_completed'],
      [analytics.paymentCompleted, 'payment_completed'],
      [analytics.pdfExported, 'pdf_exported'],
      [analytics.d212Downloaded, 'd212_downloaded'],
      [analytics.ghidCalculatorUsed, 'ghid_calculator_used'],
    ];
    for (const [fn, expected] of cases) {
      beacon.mockClear();
      fn();
      const body = await beaconBody(beacon.mock.calls[0][1]);
      expect(body.name).toBe(expected);
    }
  });

  it('maps the pre-pay gate events, encoding the block reason in the event name', async () => {
    beacon.mockClear();
    analytics.gateEligible();
    expect((await beaconBody(beacon.mock.calls[0][1])).name).toBe('gate_eligible');

    beacon.mockClear();
    analytics.gateBlocked('unsupported_year');
    expect((await beaconBody(beacon.mock.calls[0][1])).name).toBe('gate_blocked_unsupported_year');

    beacon.mockClear();
    analytics.gateBlocked('wrong_broker');
    expect((await beaconBody(beacon.mock.calls[0][1])).name).toBe('gate_blocked_wrong_broker');

    // Telemetry-only refinement of 'unreadable': a pre-parse validation
    // rejection records under its own name so parse crashes stay countable.
    beacon.mockClear();
    analytics.gateBlocked('rejected_file');
    expect((await beaconBody(beacon.mock.calls[0][1])).name).toBe('gate_blocked_rejected_file');

    // Defensive: a null reason falls back to the bare gate_blocked event.
    beacon.mockClear();
    analytics.gateBlocked(null);
    expect((await beaconBody(beacon.mock.calls[0][1])).name).toBe('gate_blocked');
  });

  it('is a no-op (no throw) when navigator is unavailable (SSR/prerender)', () => {
    vi.stubGlobal('navigator', undefined);
    expect(() => analytics.pageview()).not.toThrow();
    expect(beacon).not.toHaveBeenCalled();
  });

  it('falls back to fetch with keepalive when sendBeacon is unavailable', () => {
    const fetchMock = vi.fn((_url: string, _init?: RequestInit) => Promise.resolve(new Response(null, { status: 204 })));
    vi.stubGlobal('navigator', {}); // no sendBeacon
    vi.stubGlobal('fetch', fetchMock);
    analytics.csvUploaded();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/track');
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'POST', keepalive: true });
  });
});
