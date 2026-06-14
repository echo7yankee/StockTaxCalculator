import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

async function beaconBody(blob: unknown): Promise<{ name?: string; message?: string; stack?: string; context?: string }> {
  return JSON.parse(await (blob as Blob).text());
}

// The module keeps per-session de-dup + cap state and a one-time install guard,
// so each test imports a FRESH copy via resetModules to isolate that state.
async function freshModule() {
  vi.resetModules();
  return import('../errorMonitor');
}

describe('reportClientError (first-party client error beacon)', () => {
  const beacon = vi.fn((_url: string, _data?: BodyInit | null) => true);

  beforeEach(() => {
    beacon.mockClear();
    vi.stubGlobal('navigator', { sendBeacon: beacon });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('beacons a real error to /api/errors with name, message, stack, context', async () => {
    const { reportClientError } = await freshModule();
    reportClientError({ name: 'TypeError', message: 'boom', stack: 'at x (a.js:1:1)', context: 'react-render' });
    expect(beacon).toHaveBeenCalledTimes(1);
    const [url, blob] = beacon.mock.calls[0];
    expect(url).toBe('/api/errors');
    const body = await beaconBody(blob);
    expect(body).toMatchObject({ name: 'TypeError', message: 'boom', stack: 'at x (a.js:1:1)', context: 'react-render' });
  });

  it('is a no-op (no throw, no beacon) when navigator is unavailable (SSR/prerender)', async () => {
    const { reportClientError } = await freshModule();
    vi.stubGlobal('navigator', undefined);
    expect(() => reportClientError({ name: 'Error', message: 'x' })).not.toThrow();
    expect(beacon).not.toHaveBeenCalled();
  });

  it('does not beacon known browser/extension noise (junk-filtered)', async () => {
    const { reportClientError } = await freshModule();
    reportClientError({ message: 'ResizeObserver loop completed with undelivered notifications.' });
    reportClientError({ message: 'Failed to fetch' });
    reportClientError({ message: 'Load failed' });
    reportClientError({ message: 'Error from chrome-extension://abc/inject.js' });
    expect(beacon).not.toHaveBeenCalled();
  });

  it('de-dups the same error within a page session (sent once)', async () => {
    const { reportClientError } = await freshModule();
    reportClientError({ name: 'TypeError', message: 'same' });
    reportClientError({ name: 'TypeError', message: 'same' });
    reportClientError({ name: 'TypeError', message: 'same' });
    expect(beacon).toHaveBeenCalledTimes(1);
  });

  it('sends distinct errors separately', async () => {
    const { reportClientError } = await freshModule();
    reportClientError({ name: 'TypeError', message: 'one' });
    reportClientError({ name: 'RangeError', message: 'two' });
    expect(beacon).toHaveBeenCalledTimes(2);
  });

  it('hard-caps total sends per session so an error loop cannot flood', async () => {
    const { reportClientError } = await freshModule();
    for (let i = 0; i < 50; i++) {
      reportClientError({ name: 'Error', message: `distinct ${i}` });
    }
    expect(beacon).toHaveBeenCalledTimes(20);
  });

  it('truncates an oversized message and stack before sending', async () => {
    const { reportClientError } = await freshModule();
    reportClientError({ name: 'Error', message: 'm'.repeat(5000), stack: 's'.repeat(20000) });
    const body = await beaconBody(beacon.mock.calls[0][1]);
    expect(body.message).toHaveLength(2000);
    expect(body.stack).toHaveLength(10000);
  });

  it('falls back to keepalive fetch when sendBeacon is unavailable', async () => {
    const { reportClientError } = await freshModule();
    const fetchMock = vi.fn((_url: string, _init?: RequestInit) =>
      Promise.resolve(new Response(null, { status: 204 }))
    );
    vi.stubGlobal('navigator', {});
    vi.stubGlobal('fetch', fetchMock);
    reportClientError({ name: 'Error', message: 'x' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/errors');
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'POST', keepalive: true });
  });

  it('never throws even if sendBeacon itself throws', async () => {
    const { reportClientError } = await freshModule();
    vi.stubGlobal('navigator', {
      sendBeacon: () => {
        throw new Error('beacon exploded');
      },
    });
    expect(() => reportClientError({ name: 'Error', message: 'x' })).not.toThrow();
  });
});

describe('initErrorMonitor (global handlers)', () => {
  const beacon = vi.fn((_url: string, _data?: BodyInit | null) => true);

  beforeEach(() => {
    beacon.mockClear();
    vi.stubGlobal('navigator', { sendBeacon: beacon });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reports an unhandledrejection whose reason is an Error', async () => {
    const { initErrorMonitor } = await freshModule();
    initErrorMonitor();
    const reason = new Error('rejected');
    window.dispatchEvent(
      Object.assign(new Event('unhandledrejection'), { reason, promise: Promise.reject(reason).catch(() => {}) })
    );
    expect(beacon).toHaveBeenCalledTimes(1);
    const body = await beaconBody(beacon.mock.calls[0][1]);
    expect(body.message).toBe('rejected');
    expect(body.context).toBe('unhandledrejection');
  });

  it('only installs its listeners once (idempotent)', async () => {
    const mod = await freshModule();
    const addSpy = vi.spyOn(window, 'addEventListener');
    mod.initErrorMonitor();
    const afterFirst = addSpy.mock.calls.length;
    mod.initErrorMonitor();
    expect(addSpy.mock.calls.length).toBe(afterFirst);
    addSpy.mockRestore();
  });
});
