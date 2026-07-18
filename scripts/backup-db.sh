#!/usr/bin/env bash
#
# InvesTax — Nightly SQLite database backup
#
# Usage:  ./backup-db.sh [--restore <backup_file>]
#
# Default (no args): creates a timestamped backup of the production database
# --restore <file>:  restores a backup to a temp database and runs integrity check
#
# Deployed via crontab on the Hetzner VPS (investax@178.104.152.247):
#   0 3 * * * /home/investax/app/scripts/backup-db.sh >> /home/investax/backups/backup.log 2>&1
#
# Retention: 30 days (older backups auto-deleted)

set -euo pipefail

# --- Configuration ---
APP_DIR="/home/investax/app"
DB_PATH="${APP_DIR}/server/prisma/prod.db"
BACKUP_DIR="/home/investax/backups"
RETENTION_DAYS=30
DATE_STAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/prod-${DATE_STAMP}.db"

# --- Functions ---

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"
}

do_backup() {
  if [ ! -f "$DB_PATH" ]; then
    log "ERROR: Database not found at ${DB_PATH}"
    exit 1
  fi

  mkdir -p "$BACKUP_DIR"

  # Use SQLite's .backup command for a consistent, safe copy
  # (handles WAL mode correctly, unlike a raw file copy)
  sqlite3 "$DB_PATH" ".backup '${BACKUP_FILE}'"

  # Verify the backup is valid
  if ! sqlite3 "$BACKUP_FILE" "PRAGMA integrity_check;" | grep -q "^ok$"; then
    log "ERROR: Backup integrity check FAILED for ${BACKUP_FILE}"
    rm -f "$BACKUP_FILE"
    exit 1
  fi

  BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
  log "OK: Backup created at ${BACKUP_FILE} (${BACKUP_SIZE})"

  # Prune backups older than RETENTION_DAYS
  PRUNED=$(find "$BACKUP_DIR" -name "prod-*.db" -mtime +${RETENTION_DAYS} -print -delete | wc -l)
  if [ "$PRUNED" -gt 0 ]; then
    log "Pruned ${PRUNED} backup(s) older than ${RETENTION_DAYS} days"
  fi
}

do_restore_test() {
  local backup_file="$1"
  local temp_db="/tmp/investax-restore-test-${DATE_STAMP}.db"

  if [ ! -f "$backup_file" ]; then
    log "ERROR: Backup file not found: ${backup_file}"
    exit 1
  fi

  log "Testing restore of ${backup_file} to ${temp_db}..."

  # Copy the backup to a temp location
  cp "$backup_file" "$temp_db"

  # Run integrity check
  if ! sqlite3 "$temp_db" "PRAGMA integrity_check;" | grep -q "^ok$"; then
    log "ERROR: Restored database FAILED integrity check"
    rm -f "$temp_db"
    exit 1
  fi

  # Verify we can read data (count users as a sanity check)
  USER_COUNT=$(sqlite3 "$temp_db" "SELECT COUNT(*) FROM User;" 2>/dev/null || echo "FAILED")
  if [ "$USER_COUNT" = "FAILED" ]; then
    log "ERROR: Could not query User table from restored database"
    rm -f "$temp_db"
    exit 1
  fi

  log "OK: Restore verified — integrity check passed, ${USER_COUNT} user(s) in database"

  # Clean up
  rm -f "$temp_db"
}

# --- Main ---

if [ "${1:-}" = "--restore" ]; then
  if [ -z "${2:-}" ]; then
    echo "Usage: $0 --restore <backup_file>"
    exit 1
  fi
  do_restore_test "$2"
else
  do_backup
fi
