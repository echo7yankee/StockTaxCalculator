// Backup freshness monitor (SUGGESTIONS S12, invisibility half).
//
// The nightly SQLite backup cron (scripts/backup-db.sh) failed silently for 5
// consecutive nights in July 2026 (exec bit stripped by a checkout) and was
// found by accident. The recurrence was fixed (PR #267 tracks the exec bit);
// this module fixes the INVISIBILITY: the server process runs on the same box
// as the backup directory, so it periodically asserts that the newest
// prod-*.db backup is recent, and alerts loudly when it is not.
//
// Why freshness (output) instead of instrumenting the cron (cause): a check on
// the newest backup's mtime catches EVERY failure mode from a separate process
// - cron misconfig, stripped exec bit, a crashing script, a full disk - which
// is exactly how the July outage would have been caught on day 2 regardless of
// its cause. The script-side ERR trap in backup-db.sh is defense in depth for
// the "script ran and failed" subset.
//
// Alerting is episode-aware, NOT fingerprint-gated: the ErrorEvent row this
// records normalizes its digits, so every staleness episode shares one
// fingerprint and the generic first-occurrence alert would email only once,
// ever. So this module sends its own admin email (throttled to one per 24h
// while stale, reset on recovery) and errorMonitor skips the generic alert for
// context 'backup.freshness'. The ErrorEvent row is still recorded on every
// stale check so the issue stays visible in /admin/analytics and
// `npm run errors` with a live lastSeen.
import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { recordError } from './errorMonitor.js';
import { sendBackupAlertNotification } from '../services/email.js';

const DEFAULT_BACKUP_DIR = '/home/investax/backups';
// 36h threshold per the S12 spec: one missed nightly run is caught on the
// second morning, while a single slow/late run never false-alarms.
export const MAX_BACKUP_AGE_HOURS = 36;
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
const ALERT_THROTTLE_MS = 24 * 60 * 60 * 1000;
// Matches backup-db.sh's naming: prod-YYYYMMDD-HHMMSS.db
const BACKUP_FILE_RE = /^prod-\d{8}-\d{6}\.db$/;

export type BackupStaleReason = 'no_backups' | 'too_old' | 'dir_unreadable';

export interface BackupFreshnessStatus {
  stale: boolean;
  reason: 'fresh' | BackupStaleReason;
  /** Filename of the newest backup, when one exists. */
  newestBackup: string | null;
  /** Age of the newest backup in whole hours, when one exists. */
  ageHours: number | null;
}

export interface BackupFileInfo {
  name: string;
  mtimeMs: number;
}

// Pure freshness verdict over an already-listed set of backup files.
export function evaluateBackupFreshness(
  files: readonly BackupFileInfo[],
  nowMs: number
): BackupFreshnessStatus {
  if (files.length === 0) {
    return { stale: true, reason: 'no_backups', newestBackup: null, ageHours: null };
  }
  let newest = files[0];
  for (const file of files) {
    if (file.mtimeMs > newest.mtimeMs) newest = file;
  }
  const ageHours = Math.floor((nowMs - newest.mtimeMs) / (60 * 60 * 1000));
  if (nowMs - newest.mtimeMs > MAX_BACKUP_AGE_HOURS * 60 * 60 * 1000) {
    return { stale: true, reason: 'too_old', newestBackup: newest.name, ageHours };
  }
  return { stale: false, reason: 'fresh', newestBackup: newest.name, ageHours };
}

async function listBackupFiles(dir: string): Promise<BackupFileInfo[]> {
  const names = await readdir(dir);
  const files: BackupFileInfo[] = [];
  for (const name of names) {
    if (!BACKUP_FILE_RE.test(name)) continue;
    const info = await stat(path.join(dir, name));
    files.push({ name, mtimeMs: info.mtimeMs });
  }
  return files;
}

// One alert timestamp per process. Deliberately in-memory: a pm2 restart while
// stale re-alerts at most once immediately, which for a broken safety net is
// the right direction to err in.
const state = { lastAlertAtMs: 0 };

export function resetBackupFreshnessStateForTests(): void {
  state.lastAlertAtMs = 0;
}

function staleMessage(status: BackupFreshnessStatus, dir: string): string {
  switch (status.reason) {
    case 'no_backups':
      return `Nightly database backup is stale: no prod-*.db backups found in ${dir}`;
    case 'dir_unreadable':
      return `Nightly database backup is stale: backup directory ${dir} is unreadable`;
    default:
      return (
        `Nightly database backup is stale: newest backup ${status.newestBackup} ` +
        `is ${status.ageHours}h old (threshold ${MAX_BACKUP_AGE_HOURS}h)`
      );
  }
}

// Run one freshness check: list the dir, record + alert when stale, reset the
// alert throttle on recovery. Never throws (it runs on a bare timer).
export async function runBackupFreshnessCheck(
  dir: string,
  nowMs = Date.now()
): Promise<BackupFreshnessStatus> {
  let status: BackupFreshnessStatus;
  try {
    status = evaluateBackupFreshness(await listBackupFiles(dir), nowMs);
  } catch {
    // In production the directory existing IS part of the contract; a missing
    // or unreadable dir means the backup pipeline is broken, not "nothing to do".
    status = { stale: true, reason: 'dir_unreadable', newestBackup: null, ageHours: null };
  }

  try {
    if (status.stale) {
      const message = staleMessage(status, dir);
      console.error(`[backupFreshness] ${message}`);
      // Grouped row for /admin/analytics + `npm run errors`; the generic
      // first-fingerprint email is skipped for this context (see errorMonitor).
      await recordError({
        name: 'BackupFreshnessAlert',
        message,
        source: 'server',
        context: 'backup.freshness',
      });
      if (nowMs - state.lastAlertAtMs >= ALERT_THROTTLE_MS) {
        await sendBackupAlertNotification({
          backupDir: dir,
          reason: status.reason as BackupStaleReason,
          newestBackup: status.newestBackup,
          ageHours: status.ageHours,
          maxAgeHours: MAX_BACKUP_AGE_HOURS,
        });
        // Only throttle once the send path resolved: a failed send throws past
        // this line, so the next check (6h) retries the email.
        state.lastAlertAtMs = nowMs;
      }
    } else {
      if (state.lastAlertAtMs !== 0) {
        console.log(
          `[backupFreshness] recovered: newest backup ${status.newestBackup} is ${status.ageHours}h old`
        );
      }
      state.lastAlertAtMs = 0;
    }
  } catch (err) {
    // recordError never throws; this catches an alert-email failure. Logged
    // only: postToResend already records the send failure ('email.send'), and
    // the un-bumped throttle retries on the next check.
    console.error('[backupFreshness] failed to dispatch alert:', err);
  }

  return status;
}

// Start the periodic monitor. Called once from index.ts after listen.
//   - test env: never runs (unit tests drive runBackupFreshnessCheck directly).
//   - dev: runs only when BACKUP_DIR is explicitly set (the prod default path
//     does not exist on a dev machine and would false-alarm).
//   - production: always on, BACKUP_DIR overrides the default location.
export function startBackupFreshnessMonitor(): NodeJS.Timeout | null {
  if (process.env.NODE_ENV === 'test') return null;
  const configuredDir = process.env.BACKUP_DIR;
  if (!configuredDir && process.env.NODE_ENV !== 'production') {
    console.log('[backupFreshness] disabled (set BACKUP_DIR to enable outside production)');
    return null;
  }
  const dir = configuredDir || DEFAULT_BACKUP_DIR;
  console.log(
    `[backupFreshness] monitoring ${dir} (stale threshold ${MAX_BACKUP_AGE_HOURS}h, check every 6h)`
  );
  void runBackupFreshnessCheck(dir);
  const timer = setInterval(() => void runBackupFreshnessCheck(dir), CHECK_INTERVAL_MS);
  // Never keep the process alive for the monitor's sake.
  timer.unref();
  return timer;
}
