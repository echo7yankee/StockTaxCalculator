import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';

const captureMessageMock = vi.fn();
vi.mock('../sentry', () => ({
  Sentry: { captureMessage: captureMessageMock },
}));

const { reportParseEvent } = await import('../parseMonitor');

beforeEach(() => {
  captureMessageMock.mockReset();
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

  it('does not call Sentry when outcome is success with no warnings', () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 200 })));
    reportParseEvent({ fileType: 'pdf', outcome: 'success', warnings: [], engineWarnings: [] });
    expect(captureMessageMock).not.toHaveBeenCalled();
  });

  it('calls Sentry with level=warning when parser warnings are present', () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 200 })));
    reportParseEvent({
      fileType: 'pdf',
      outcome: 'warning',
      fileName: 'statement.pdf',
      warnings: ['mixed currencies'],
    });

    expect(captureMessageMock).toHaveBeenCalledTimes(1);
    const [message, options] = captureMessageMock.mock.calls[0];
    expect(message).toBe('Parser warnings detected');
    expect(options.level).toBe('warning');
    expect(options.tags.component).toBe('parser');
    expect(options.tags.fileType).toBe('pdf');
    expect(options.tags.outcome).toBe('warning');
    expect(options.tags.parserWarningCount).toBe('1');
    expect(options.tags.engineWarningCount).toBe('0');
    expect(options.extra.warnings).toEqual(['mixed currencies']);
    expect(options.extra.fileName).toBe('statement.pdf');
  });

  it('calls Sentry with level=warning when only engine warnings are present', () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 200 })));
    reportParseEvent({
      fileType: 'pdf',
      outcome: 'success',
      warnings: [],
      engineWarnings: ['Sign mismatch: per-row positive, overview negative'],
    });

    expect(captureMessageMock).toHaveBeenCalledTimes(1);
    const [, options] = captureMessageMock.mock.calls[0];
    expect(options.tags.parserWarningCount).toBe('0');
    expect(options.tags.engineWarningCount).toBe('1');
    expect(options.extra.engineWarnings).toEqual([
      'Sign mismatch: per-row positive, overview negative',
    ]);
  });

  it('calls Sentry with level=error when outcome is error', () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 200 })));
    reportParseEvent({
      fileType: 'csv',
      outcome: 'error',
      errorMessage: 'No statement period found',
    });

    expect(captureMessageMock).toHaveBeenCalledTimes(1);
    const [message, options] = captureMessageMock.mock.calls[0];
    expect(message).toBe('Parser error reported');
    expect(options.level).toBe('error');
    expect(options.tags.outcome).toBe('error');
    expect(options.extra.errorMessage).toBe('No statement period found');
  });

  it('still POSTs the event when the Sentry call throws (best-effort isolation)', () => {
    captureMessageMock.mockImplementationOnce(() => {
      throw new Error('sentry transport broke');
    });
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    expect(() =>
      reportParseEvent({ fileType: 'pdf', outcome: 'warning', warnings: ['x'] }),
    ).not.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
