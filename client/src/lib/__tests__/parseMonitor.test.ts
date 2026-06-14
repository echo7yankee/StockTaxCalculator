import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';

const reportClientErrorMock = vi.fn();
vi.mock('../errorMonitor', () => ({
  reportClientError: reportClientErrorMock,
}));

const { reportParseEvent } = await import('../parseMonitor');

beforeEach(() => {
  reportClientErrorMock.mockReset();
});

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

  it('does not record an error-monitor event for a clean success', () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 200 })));
    reportParseEvent({ fileType: 'pdf', outcome: 'success', warnings: [], engineWarnings: [] });
    expect(reportClientErrorMock).not.toHaveBeenCalled();
  });

  it('does not record parser/engine warnings (they reach the operator via /api/parse-reports only)', () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    reportParseEvent({ fileType: 'pdf', outcome: 'warning', warnings: ['mixed currencies'] });
    reportParseEvent({
      fileType: 'pdf',
      outcome: 'success',
      engineWarnings: ['Sign mismatch: per-row positive, overview negative'],
    });

    // Warnings are data-quality signals, not JS errors: they must not pollute the error dashboard...
    expect(reportClientErrorMock).not.toHaveBeenCalled();
    // ...but they are still reported to the operator via the parse-report POST.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('records a ParseError in the first-party monitor when outcome is error', () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 200 })));
    reportParseEvent({ fileType: 'csv', outcome: 'error', errorMessage: 'No statement period found' });

    expect(reportClientErrorMock).toHaveBeenCalledTimes(1);
    expect(reportClientErrorMock).toHaveBeenCalledWith({
      name: 'ParseError',
      message: 'No statement period found',
      context: 'parser:csv',
    });
  });

  it('falls back to a generic message when an error outcome carries no errorMessage', () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 200 })));
    reportParseEvent({ fileType: 'pdf', outcome: 'error' });

    expect(reportClientErrorMock).toHaveBeenCalledWith({
      name: 'ParseError',
      message: 'Parser error (pdf)',
      context: 'parser:pdf',
    });
  });

  it('still POSTs the event when outcome is error (capture is independent of the report)', () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    reportParseEvent({ fileType: 'pdf', outcome: 'error', errorMessage: 'boom' });

    expect(reportClientErrorMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
