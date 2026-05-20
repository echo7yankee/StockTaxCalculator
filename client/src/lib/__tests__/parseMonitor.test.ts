import { describe, it, expect, vi, afterEach } from 'vitest';
import { reportParseEvent } from '../parseMonitor';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('reportParseEvent', () => {
  it('POSTs the event to /api/parse-reports as JSON with credentials', () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    reportParseEvent({
      fileType: 'pdf',
      outcome: 'warning',
      fileName: 'statement.pdf',
      warnings: ['mixed currencies'],
      summary: { sells: 144, dividends: 49, year: 2025 },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/parse-reports');
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('include');
    expect(init.headers['Content-Type']).toBe('application/json');

    const body = JSON.parse(init.body as string);
    expect(body.fileType).toBe('pdf');
    expect(body.outcome).toBe('warning');
    expect(body.fileName).toBe('statement.pdf');
    expect(body.warnings).toEqual(['mixed currencies']);
    expect(body.summary.sells).toBe(144);
  });

  it('swallows a network rejection without throwing into the caller', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('network down'));
    vi.stubGlobal('fetch', fetchMock);

    // The call itself must not throw...
    expect(() => reportParseEvent({ fileType: 'csv', outcome: 'error' })).not.toThrow();
    // ...and the rejected promise must be caught, not left dangling.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('returns void so callers cannot couple the upload flow to it', () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 200 })));
    const result = reportParseEvent({ fileType: 'pdf', outcome: 'success' });
    expect(result).toBeUndefined();
  });
});
