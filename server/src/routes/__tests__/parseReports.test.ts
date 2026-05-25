import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import express from 'express';
import { Server } from 'http';

// Mock the email service before importing the router so the route picks up the
// mocked binding (same approach as contact.test.ts to avoid global.fetch mocking
// which would also intercept the test's own HTTP calls to the local server).
const sendParseAlertNotificationMock = vi.fn();
vi.mock('../../services/email.js', () => ({
  sendParseAlertNotification: sendParseAlertNotificationMock,
}));

// Mock the parseAlertLog service so the DB write side of the handler is
// asserted without touching the test SQLite file. logParseAlert is unit-tested
// against the real DB in services/__tests__/parseAlertLog.test.ts.
const logParseAlertMock = vi.fn();
vi.mock('../../services/parseAlertLog.js', async () => {
  const actual = await vi.importActual<typeof import('../../services/parseAlertLog.js')>(
    '../../services/parseAlertLog.js'
  );
  return {
    ...actual,
    logParseAlert: logParseAlertMock,
  };
});

const { parseReportsRouter } = await import('../parseReports.js');

let server: Server;
// Listen on an OS-assigned free port so this file can never collide with another
// server test file's hardcoded port. BASE is filled in once the server is listening.
let BASE = '';

const TEST_USER = {
  id: 'test-parse-user-0001',
  email: 'paul@example.com',
  name: 'Paul Adam',
  plan: 'paid',
};

beforeAll(async () => {
  const app = express();
  app.use(express.json({ limit: '10mb' }));
  // parseReports is mounted behind requirePaidPlan in index.ts; the handler
  // itself only needs req.user populated. Mirror uploads.test.ts's fake auth.
  app.use((req, _res, next) => {
    (req as any).user = { ...TEST_USER };
    (req as any).isAuthenticated = () => true;
    next();
  });
  app.use('/api/parse-reports', parseReportsRouter);
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  const address = server.address();
  if (address === null || typeof address === 'string' || address.port === 0) {
    throw new Error('Expected a TCP address with non-zero port from app.listen(0)');
  }
  BASE = `http://localhost:${address.port}`;
});

afterAll(() => {
  server?.close();
});

const validPdfReport = {
  fileType: 'pdf',
  outcome: 'success',
  fileName: 'annual-statement-2025.pdf',
  warnings: [],
  summary: { sells: 144, dividends: 49, distributions: 0, pages: 14, year: 2025 },
};

const originalNodeEnv = process.env.NODE_ENV;

beforeEach(() => {
  process.env.NODE_ENV = 'test';
  sendParseAlertNotificationMock.mockReset();
  sendParseAlertNotificationMock.mockResolvedValue(undefined);
  logParseAlertMock.mockReset();
  logParseAlertMock.mockResolvedValue({ id: 'mock-row-id' });
});

afterEach(() => {
  process.env.NODE_ENV = originalNodeEnv;
});

function post(body: unknown) {
  return fetch(`${BASE}/api/parse-reports`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/parse-reports', () => {
  it('returns 200 and fires the alert with the authenticated user identity', async () => {
    const res = await post(validPdfReport);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });

    expect(sendParseAlertNotificationMock).toHaveBeenCalledTimes(1);
    const args = sendParseAlertNotificationMock.mock.calls[0][0];
    expect(args.userEmail).toBe('paul@example.com');
    expect(args.userName).toBe('Paul Adam');
    expect(args.fileType).toBe('pdf');
    expect(args.outcome).toBe('success');
    expect(args.summary.sells).toBe(144);
    expect(args.summary.pages).toBe(14);
  });

  it('forwards a parse error with its message', async () => {
    const res = await post({
      fileType: 'pdf',
      outcome: 'error',
      fileName: 'broken.pdf',
      errorMessage: 'No statement period found in PDF',
    });
    expect(res.status).toBe(200);
    const args = sendParseAlertNotificationMock.mock.calls[0][0];
    expect(args.outcome).toBe('error');
    expect(args.errorMessage).toBe('No statement period found in PDF');
  });

  it('forwards parse warnings', async () => {
    const res = await post({
      fileType: 'pdf',
      outcome: 'warning',
      warnings: ['PDF may have mixed transaction currencies'],
    });
    expect(res.status).toBe(200);
    expect(sendParseAlertNotificationMock.mock.calls[0][0].warnings).toEqual([
      'PDF may have mixed transaction currencies',
    ]);
  });

  it('accepts a CSV report with buys/skipped counts', async () => {
    const res = await post({
      fileType: 'csv',
      outcome: 'success',
      fileName: 'export.csv',
      summary: { buys: 20, sells: 8, dividends: 3, skipped: 2, totalRows: 31, year: 2024 },
    });
    expect(res.status).toBe(200);
    expect(sendParseAlertNotificationMock.mock.calls[0][0].summary.buys).toBe(20);
  });

  it('defaults warnings to an empty array when omitted', async () => {
    const res = await post({ fileType: 'pdf', outcome: 'success' });
    expect(res.status).toBe(200);
    expect(sendParseAlertNotificationMock.mock.calls[0][0].warnings).toEqual([]);
  });

  it('returns 400 when fileType is not pdf or csv', async () => {
    const res = await post({ ...validPdfReport, fileType: 'xlsx' });
    expect(res.status).toBe(400);
    expect((await res.json()).field).toBe('fileType');
  });

  it('returns 400 when outcome is not in the enum', async () => {
    const res = await post({ ...validPdfReport, outcome: 'maybe' });
    expect(res.status).toBe(400);
    expect((await res.json()).field).toBe('outcome');
  });

  it('returns 400 when fileType is missing', async () => {
    const { fileType: _omit, ...withoutFileType } = validPdfReport;
    const res = await post(withoutFileType);
    expect(res.status).toBe(400);
  });

  it('returns 400 when a summary count is negative', async () => {
    const res = await post({ ...validPdfReport, summary: { sells: -5 } });
    expect(res.status).toBe(400);
    expect((await res.json()).field).toContain('summary');
  });

  it('returns 200 when the alert silently no-ops (ADMIN_NOTIFICATION_EMAIL unset)', async () => {
    sendParseAlertNotificationMock.mockResolvedValueOnce(undefined);
    const res = await post(validPdfReport);
    expect(res.status).toBe(200);
    expect(sendParseAlertNotificationMock).toHaveBeenCalledTimes(1);
  });

  it('returns 500 when sendParseAlertNotification throws', async () => {
    sendParseAlertNotificationMock.mockRejectedValueOnce(new Error('Resend API 500: boom'));
    const res = await post(validPdfReport);
    expect(res.status).toBe(500);
    expect((await res.json()).error).toMatch(/Failed to record report/);
  });

  it('writes a ParseAlertLog row alongside the email send', async () => {
    const res = await post(validPdfReport);
    expect(res.status).toBe(200);

    expect(logParseAlertMock).toHaveBeenCalledTimes(1);
    const args = logParseAlertMock.mock.calls[0][0];
    expect(args.userId).toBe('test-parse-user-0001');
    expect(args.fileType).toBe('pdf');
    expect(args.fileName).toBe('annual-statement-2025.pdf');
    expect(args.taxYear).toBe(2025);
    expect(args.outcome).toBe('ok');
    expect(args.parserWarnings).toEqual([]);
    expect(args.engineWarnings).toEqual([]);
    expect(args.sellCount).toBe(144);
    expect(args.dividendCount).toBe(49);
    expect(args.distributionCount).toBe(0);
    expect(args.pageCount).toBe(14);
    expect(args.errorMessage).toBeNull();
  });

  it('derives outcome=warning in the DB row when parserWarnings is non-empty', async () => {
    const res = await post({
      fileType: 'pdf',
      outcome: 'warning',
      warnings: ['mixed currencies detected'],
    });
    expect(res.status).toBe(200);
    expect(logParseAlertMock.mock.calls[0][0].outcome).toBe('warning');
    expect(logParseAlertMock.mock.calls[0][0].parserWarnings).toEqual(['mixed currencies detected']);
  });

  it('derives outcome=warning when engineWarnings is non-empty even if outcome is success', async () => {
    const res = await post({
      fileType: 'pdf',
      outcome: 'success',
      warnings: [],
      engineWarnings: ['Sign mismatch: per-row sum positive, overview negative'],
    });
    expect(res.status).toBe(200);
    expect(logParseAlertMock.mock.calls[0][0].outcome).toBe('warning');
    expect(logParseAlertMock.mock.calls[0][0].engineWarnings).toEqual([
      'Sign mismatch: per-row sum positive, overview negative',
    ]);
  });

  it('derives outcome=error in the DB row when input outcome is error', async () => {
    const res = await post({
      fileType: 'pdf',
      outcome: 'error',
      fileName: 'broken.pdf',
      errorMessage: 'No statement period found',
    });
    expect(res.status).toBe(200);
    expect(logParseAlertMock.mock.calls[0][0].outcome).toBe('error');
    expect(logParseAlertMock.mock.calls[0][0].errorMessage).toBe('No statement period found');
  });

  it('still sends the email when the DB write fails (channels are independent)', async () => {
    logParseAlertMock.mockRejectedValueOnce(new Error('SQLite locked'));
    const res = await post(validPdfReport);

    expect(res.status).toBe(200);
    expect(sendParseAlertNotificationMock).toHaveBeenCalledTimes(1);
  });

  it('returns 500 from email failure even when DB write succeeded', async () => {
    logParseAlertMock.mockResolvedValueOnce({ id: 'mock-row-id' });
    sendParseAlertNotificationMock.mockRejectedValueOnce(new Error('Resend down'));
    const res = await post(validPdfReport);

    expect(res.status).toBe(500);
    expect(logParseAlertMock).toHaveBeenCalledTimes(1);
  });
});
