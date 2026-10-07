#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
BACKUP_SCRIPT="$ROOT_DIR/scripts/backup-taskagent.sh"
MONITOR_SCRIPT="$ROOT_DIR/scripts/run-monitor.sh"

grep -q 'pg_dump.*--format=custom' "$BACKUP_SCRIPT"
grep -q 'rsync.*--archive.*--hard-links.*--numeric-ids' "$BACKUP_SCRIPT"
grep -q 'pg_restore --list' "$BACKUP_SCRIPT"
grep -q 'TASKAGENT_RESTORE_TEST_DATABASE_URL' "$BACKUP_SCRIPT"
grep -q 'pg_restore.*--dbname=.*TASKAGENT_RESTORE_TEST_DATABASE_URL' "$BACKUP_SCRIPT"
grep -q 'TASKAGENT_POSTGRES_CONTAINER' "$BACKUP_SCRIPT"
grep -q 'TASKAGENT_RESTORE_TEST_DATABASE' "$BACKUP_SCRIPT"
grep -q 'restore-test database must differ from live database' "$BACKUP_SCRIPT"
grep -q 'dropdb.*TASKAGENT_RESTORE_TEST_DATABASE' "$BACKUP_SCRIPT"
grep -q 'sha256sum' "$BACKUP_SCRIPT"

if rg -n 'rm -rf|chown[[:space:]]+-R' "$ROOT_DIR/scripts"; then
  echo "destructive recursive operation found" >&2
  exit 1
fi

grep -q 'n9-network-fingerprint' "$MONITOR_SCRIPT"
grep -q 'N9_NETWORK_INCIDENT_WEBHOOK' "$MONITOR_SCRIPT"
grep -q '/api/upload-file' "$MONITOR_SCRIPT"
grep -q -- '-X DELETE' "$MONITOR_SCRIPT"
grep -q '/api/attachments/' "$MONITOR_SCRIPT"
grep -q 'openssl s_client' "$MONITOR_SCRIPT"
grep -q 'validate-config.sh' "$MONITOR_SCRIPT"
echo "data safety tests passed"
