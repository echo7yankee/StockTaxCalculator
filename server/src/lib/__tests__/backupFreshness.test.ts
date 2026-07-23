import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock the fs layer plus both alert sinks before importing the module under
// test, so runBackupFreshnessCheck binds the mocks (vi.mock is hoisted).
const readdirMock = vi.fn();
const statMock = vi.fn();
vi.mock('node:fs/promises', () => ({
  readdir: readdirMock,
  stat: statMock,
}));

const recordErrorMock = vi.fn().mockResolvedValue(undefined);
vi.mock('../errorMonitor.js', () => ({
  recordError: recordErrorMock,
}));

const sendBackupAlertMock = vi.fn().mockResolvedValue(true);
vi.mock('../../services/email.js', () => ({
  sendBackupAlertNotification: sendBackupAlertMock,
}));

const {
  evaluateBackupFreshness,
  runBackupFreshnessCheck,
  resetBackupFreshnessStateForTests,
  startBackupFreshnessMonitor,
  MAX_BACKUP_AGE_HOURS,
} = await import('../backupFreshness.js');

const HOUR = 60 * 60 * 1000;
const NOW = Date.parse('2026-07-23T21:00:00.000Z');
const DIR = '/home/investax/backups';

// readdir returns names; stat is called per matching name. Drive both from one
// map of name -> mtimeMs so the fs shape stays consistent per test.
function stubBackupDir(files: Record<string, number>): void {
  readdirMock.mockResolvedValue(Object.keys(files));
  statMock.mockImplementation(async (fullPath: string) => {
    const name = String(fullPath).split(/[\\/]/).pop() as string;
    if (!(name in files)) throw new Error(`unexpected stat for ${fullPath}`);
    return { mtimeMs: files[name] };
  });
}

beforeEach(() => {
  readdirMock.mockReset();
  statMock.mockReset();
  recordErrorMock.mockReset();
  recordErrorMock.mockResolvedValue(undefined);
  sendBackupAlertMock.mockReset();
  sendBackupAlertMock.mockResolvedValue(true);
  resetBackupFreshnessStateForTests();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('startBackupFreshnessMonitor', () => {
  it('never schedules under NODE_ENV=test (unit tests drive the check directly)', () => {
    expect(process.env.NODE_ENV).toBe('test');
    expect(startBackupFreshnessMonitor()).toBeNull();
    expect(readdirMock).not.toHaveBeenCalled();
  });
});

describe('evaluateBackupFreshness', () => {
  it('reports no_backups when the directory has no backup files', () => {
    expect(evaluateBackupFreshness([], NOW)).toEqual({
      stale: true,
      reason: 'no_backups',
      newestBackup: null,
      ageHours: null,
    });
  });

  it('reports fresh for a backup younger than the threshold', () => {
    const status = evaluateBackupFreshness(
      [{ name: 'prod-20260723-030001.db', mtimeMs: NOW - 18 * HOUR }],
      NOW
    );
    expect(status).toEqual({
      stale: false,
      reason: 'fresh',
      newestBackup: 'prod-20260723-030001.db',
      ageHours: 18,
    });
  });

  it('reports too_old past the threshold, with the age in hours', () => {
    const status = evaluateBackupFreshness(
      [{ name: 'prod-20260713-030001.db', mtimeMs: NOW - 40 * HOUR }],
      NOW
    );
    expect(status).toEqual({
      stale: true,
      reason: 'too_old',
      newestBackup: 'prod-20260713-030001.db',
      ageHours: 40,
    });
  });

  it('judges freshness by the NEWEST file, regardless of listing order', () => {
    const status = evaluateBackupFreshness(
      [
        { name: 'prod-20260721-030001.db', mtimeMs: NOW - 45 * HOUR },
        { name: 'prod-20260723-030001.db', mtimeMs: NOW - 2 * HOUR },
        { name: 'prod-20260722-030001.db', mtimeMs: NOW - 21 * HOUR },
      ],
      NOW
    );
    expect(status.stale).toBe(false);
    expect(status.newestBackup).toBe('prod-20260723-030001.db');
  });

  it('boundary: exactly the threshold is still fresh; a moment past it is stale', () => {
    const atThreshold = evaluateBackupFreshness(
      [{ name: 'prod-20260722-090000.db', mtimeMs: NOW - MAX_BACKUP_AGE_HOURS * HOUR }],
      NOW
    );
    expect(atThreshold.stale).toBe(false);

    const pastThreshold = evaluateBackupFreshness(
      [{ name: 'prod-20260722-090000.db', mtimeMs: NOW - MAX_BACKUP_AGE_HOURS * HOUR - 1 }],
      NOW
    );
    expect(pastThreshold.stale).toBe(true);
    expect(pastThreshold.reason).toBe('too_old');
  });
});

describe('runBackupFreshnessCheck', () => {
  it('fresh backup: records nothing and sends nothing', async () => {
    stubBackupDir({ 'prod-20260723-030001.db': NOW - 18 * HOUR });

    const status = await runBackupFreshnessCheck(DIR, NOW);

    expect(status.stale).toBe(false);
    expect(recordErrorMock).not.toHaveBeenCalled();
    expect(sendBackupAlertMock).not.toHaveBeenCalled();
  });

  it('ignores non-backup files (a dir of only backup.log counts as no_backups)', async () => {
    stubBackupDir({});
    readdirMock.mockResolvedValue(['backup.log', 'prod-x.db', 'notes.txt']);

    const status = await runBackupFreshnessCheck(DIR, NOW);

    expect(status).toMatchObject({ stale: true, reason: 'no_backups' });
    expect(statMock).not.toHaveBeenCalled(); // nothing matched the prod-*.db shape
  });

  it('stale backup: records a grouped ErrorEvent AND sends the admin alert', async () => {
    stubBackupDir({ 'prod-20260713-030001.db': NOW - 40 * HOUR });

    const status = await runBackupFreshnessCheck(DIR, NOW);

    expect(status).toMatchObject({ stale: true, reason: 'too_old' });
    expect(recordErrorMock).toHaveBeenCalledTimes(1);
    expect(recordErrorMock.mock.calls[0][0]).toMatchObject({
      name: 'BackupFreshnessAlert',
      source: 'server',
      context: 'backup.freshness',
    });
    expect(recordErrorMock.mock.calls[0][0].message).toContain('prod-20260713-030001.db');
    expect(recordErrorMock.mock.calls[0][0].message).toContain('40h');

    expect(sendBackupAlertMock).toHaveBeenCalledTimes(1);
    expect(sendBackupAlertMock).toHaveBeenCalledWith({
      backupDir: DIR,
      reason: 'too_old',
      newestBackup: 'prod-20260713-030001.db',
      ageHours: 40,
      maxAgeHours: MAX_BACKUP_AGE_HOURS,
    });
  });

  it('unreadable directory: treated as stale (the pipeline is broken, not idle)', async () => {
    readdirMock.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));

    const status = await runBackupFreshnessCheck(DIR, NOW);

    expect(status).toMatchObject({ stale: true, reason: 'dir_unreadable' });
    expect(recordErrorMock).toHaveBeenCalledTimes(1);
    expect(sendBackupAlertMock).toHaveBeenCalledTimes(1);
    expect(sendBackupAlertMock.mock.calls[0][0]).toMatchObject({ reason: 'dir_unreadable' });
  });

  it('THROTTLE: while stale, the email fires once per 24h but the row is recorded every check', async () => {
    stubBackupDir({ 'prod-20260713-030001.db': NOW - 40 * HOUR });
    await runBackupFreshnessCheck(DIR, NOW);
    expect(sendBackupAlertMock).toHaveBeenCalledTimes(1);

    // 6h later (the next scheduled check): still stale, row recorded, NO second email.
    await runBackupFreshnessCheck(DIR, NOW + 6 * HOUR);
    expect(recordErrorMock).toHaveBeenCalledTimes(2);
    expect(sendBackupAlertMock).toHaveBeenCalledTimes(1);

    // 24h after the first alert: the daily repeat fires.
    await runBackupFreshnessCheck(DIR, NOW + 24 * HOUR);
    expect(sendBackupAlertMock).toHaveBeenCalledTimes(2);
  });

  it('RECOVERY: a fresh check resets the throttle, so a later episode alerts immediately', async () => {
    // Episode 1: stale -> alert.
    stubBackupDir({ 'prod-20260713-030001.db': NOW - 40 * HOUR });
    await runBackupFreshnessCheck(DIR, NOW);
    expect(sendBackupAlertMock).toHaveBeenCalledTimes(1);

    // Recovery: a fresh backup appears 1h later.
    stubBackupDir({ 'prod-20260723-220001.db': NOW + 1 * HOUR - 0.5 * HOUR });
    await runBackupFreshnessCheck(DIR, NOW + 1 * HOUR);
    expect(sendBackupAlertMock).toHaveBeenCalledTimes(1);

    // Episode 2, only 2h after the first alert (well inside the 24h window):
    // because recovery reset the throttle, it alerts immediately.
    stubBackupDir({ 'prod-20260723-220001.db': NOW - 50 * HOUR });
    await runBackupFreshnessCheck(DIR, NOW + 2 * HOUR);
    expect(sendBackupAlertMock).toHaveBeenCalledTimes(2);
  });

  it('a FAILED alert email does not bump the throttle: the next check retries', async () => {
    stubBackupDir({ 'prod-20260713-030001.db': NOW - 40 * HOUR });
    sendBackupAlertMock.mockRejectedValueOnce(new Error('Resend API 500'));

    // Never throws even when the send rejects (it runs on a bare timer).
    await expect(runBackupFreshnessCheck(DIR, NOW)).resolves.toMatchObject({ stale: true });
    expect(sendBackupAlertMock).toHaveBeenCalledTimes(1);

    // Next scheduled check, 6h later: the email is retried despite being
    // inside the 24h window, because the failed send never set the throttle.
    await runBackupFreshnessCheck(DIR, NOW + 6 * HOUR);
    expect(sendBackupAlertMock).toHaveBeenCalledTimes(2);
  });
});
