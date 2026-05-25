import { describe, it, expect, afterAll, afterEach } from 'vitest';
import prisma from '../../lib/prisma.js';
import { logParseAlert, deriveParseOutcome } from '../parseAlertLog.js';

// Test rows are namespaced by fileName prefix so cleanup deletes exactly the
// rows this file created without touching other suites' fixtures.
const FILE_PREFIX = 'parseAlertLogTest_';

async function cleanup() {
  await prisma.parseAlertLog.deleteMany({
    where: { fileName: { startsWith: FILE_PREFIX } },
  });
}

afterEach(async () => {
  await cleanup();
});

afterAll(async () => {
  await cleanup();
});

describe('deriveParseOutcome', () => {
  it('returns ok for success with no warnings', () => {
    expect(deriveParseOutcome('success', [], [])).toBe('ok');
    expect(deriveParseOutcome('success', [])).toBe('ok');
  });

  it('returns warning for success with parser warnings', () => {
    expect(deriveParseOutcome('success', ['mixed currencies'], [])).toBe('warning');
  });

  it('returns warning for success with engine warnings only', () => {
    expect(deriveParseOutcome('success', [], ['Sign mismatch detected'])).toBe('warning');
  });

  it('returns warning when input outcome is warning regardless of counts', () => {
    expect(deriveParseOutcome('warning', [], [])).toBe('warning');
    expect(deriveParseOutcome('warning', ['x'], [])).toBe('warning');
  });

  it('returns error when input outcome is error, even with no warnings', () => {
    expect(deriveParseOutcome('error', [], [])).toBe('error');
  });

  it('returns error when input outcome is error even with warnings present', () => {
    expect(deriveParseOutcome('error', ['parser warning'], ['engine warning'])).toBe('error');
  });
});

describe('logParseAlert', () => {
  it('persists a row with all optional fields populated', async () => {
    const fileName = `${FILE_PREFIX}all-fields.pdf`;
    const row = await logParseAlert({
      fileType: 'pdf',
      fileName,
      taxYear: 2025,
      outcome: 'warning',
      parserWarnings: ['mixed transaction currencies'],
      engineWarnings: ['Sign mismatch: per-row sum positive, overview negative'],
      sellCount: 142,
      dividendCount: 49,
      distributionCount: 0,
      pageCount: 14,
    });

    expect(row.id).toBeTruthy();
    expect(row.fileName).toBe(fileName);
    expect(row.fileType).toBe('pdf');
    expect(row.taxYear).toBe(2025);
    expect(row.outcome).toBe('warning');
    expect(row.parserWarnings).toEqual(['mixed transaction currencies']);
    expect(row.engineWarnings).toEqual([
      'Sign mismatch: per-row sum positive, overview negative',
    ]);
    expect(row.sellCount).toBe(142);
    expect(row.dividendCount).toBe(49);
    expect(row.distributionCount).toBe(0);
    expect(row.pageCount).toBe(14);
    expect(row.errorMessage).toBeNull();
    expect(row.userId).toBeNull();
    expect(row.parsedAt).toBeInstanceOf(Date);
  });

  it('defaults engineWarnings to an empty array when omitted', async () => {
    const fileName = `${FILE_PREFIX}no-engine-warnings.pdf`;
    const row = await logParseAlert({
      fileType: 'pdf',
      fileName,
      outcome: 'ok',
      parserWarnings: [],
    });

    expect(row.engineWarnings).toEqual([]);
    expect(row.outcome).toBe('ok');
  });

  it('persists an error row with errorMessage and null counts', async () => {
    const fileName = `${FILE_PREFIX}error.csv`;
    const row = await logParseAlert({
      fileType: 'csv',
      fileName,
      outcome: 'error',
      parserWarnings: [],
      errorMessage: 'No statement period found',
    });

    expect(row.outcome).toBe('error');
    expect(row.errorMessage).toBe('No statement period found');
    expect(row.sellCount).toBeNull();
    expect(row.dividendCount).toBeNull();
  });

  it('accepts a null fileName (route schema allows it)', async () => {
    const row = await logParseAlert({
      fileType: 'pdf',
      fileName: null,
      outcome: 'ok',
      parserWarnings: [],
    });

    expect(row.fileName).toBeNull();
    // Without a fileName prefix this row is orphan to our cleanup. Delete by id.
    await prisma.parseAlertLog.delete({ where: { id: row.id } });
  });

  it('writes parserWarnings JSON that round-trips back as an array', async () => {
    const fileName = `${FILE_PREFIX}json-round-trip.pdf`;
    const warnings = ['warning A', 'warning B with quotes "and" specials &<>'];
    const row = await logParseAlert({
      fileType: 'pdf',
      fileName,
      outcome: 'warning',
      parserWarnings: warnings,
    });

    const reread = await prisma.parseAlertLog.findUnique({ where: { id: row.id } });
    expect(reread?.parserWarnings).toEqual(warnings);
  });

  it('persists a row tied to a real user (FK works) and survives user deletion via SetNull', async () => {
    const userEmail = `${FILE_PREFIX}user@example.com`;
    const user = await prisma.user.create({
      data: { email: userEmail, name: 'Parse Alert Test User' },
    });

    try {
      const fileName = `${FILE_PREFIX}fk-test.pdf`;
      const row = await logParseAlert({
        userId: user.id,
        fileType: 'pdf',
        fileName,
        outcome: 'ok',
        parserWarnings: [],
      });

      expect(row.userId).toBe(user.id);

      await prisma.user.delete({ where: { id: user.id } });

      const reread = await prisma.parseAlertLog.findUnique({ where: { id: row.id } });
      expect(reread).not.toBeNull();
      expect(reread?.userId).toBeNull();
    } finally {
      // Defensive: if the user delete above failed, clear it now.
      await prisma.user.deleteMany({ where: { email: userEmail } });
    }
  });
});
