#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
# shellcheck source=lib.sh
source "$ROOT_DIR/scripts/lib.sh"

ENV_FILE=${1:?env file required}
load_contract "$ENV_FILE"
require_vars TASKAGENT_UPLOAD_DIR TASKAGENT_BACKUP_ROOT

STAMP=$(date -u +%Y%m%dT%H%M%SZ)
DEST="$TASKAGENT_BACKUP_ROOT/$STAMP"
mkdir -p "$DEST/uploads" "$DEST/config"

if test -n "${TASKAGENT_POSTGRES_CONTAINER:-}"; then
  require_vars TASKAGENT_DATABASE_NAME TASKAGENT_DATABASE_USER TASKAGENT_RESTORE_TEST_DATABASE
  test "$TASKAGENT_DATABASE_NAME" != "$TASKAGENT_RESTORE_TEST_DATABASE" || { echo "restore-test database must differ from live database" >&2; exit 2; }
  docker exec "$TASKAGENT_POSTGRES_CONTAINER" pg_dump --username="$TASKAGENT_DATABASE_USER" --dbname="$TASKAGENT_DATABASE_NAME" --format=custom >"$DEST/taskagent.dump"
else
  DATABASE_URL=${DATABASE_URL:?DATABASE_URL is required}
  TASKAGENT_RESTORE_TEST_DATABASE_URL=${TASKAGENT_RESTORE_TEST_DATABASE_URL:?isolated restore-test database URL is required}
  pg_dump --dbname="$DATABASE_URL" --format=custom --file="$DEST/taskagent.dump"
fi
rsync --archive --hard-links --numeric-ids "$TASKAGENT_UPLOAD_DIR/" "$DEST/uploads/"
cp --preserve=mode,timestamps "$ENV_FILE" "$DEST/config/taskagent.env"

(cd "$TASKAGENT_UPLOAD_DIR" && find . -type f -print0 | sort -z | xargs -0 -r sha256sum) >"$DEST/live.sha256"
(cd "$DEST/uploads" && find . -type f -print0 | sort -z | xargs -0 -r sha256sum) >"$DEST/backup.sha256"
cmp "$DEST/live.sha256" "$DEST/backup.sha256"
if test -n "${TASKAGENT_POSTGRES_CONTAINER:-}"; then
  docker exec -i "$TASKAGENT_POSTGRES_CONTAINER" pg_restore --list <"$DEST/taskagent.dump" >"$DEST/restore.list"
  cleanup_restore_database() {
    docker exec "$TASKAGENT_POSTGRES_CONTAINER" dropdb --username="$TASKAGENT_DATABASE_USER" --if-exists "$TASKAGENT_RESTORE_TEST_DATABASE" >/dev/null
  }
  trap cleanup_restore_database EXIT
  cleanup_restore_database
  docker exec "$TASKAGENT_POSTGRES_CONTAINER" createdb --username="$TASKAGENT_DATABASE_USER" "$TASKAGENT_RESTORE_TEST_DATABASE"
  docker exec -i "$TASKAGENT_POSTGRES_CONTAINER" pg_restore --username="$TASKAGENT_DATABASE_USER" --dbname="$TASKAGENT_RESTORE_TEST_DATABASE" --no-owner --no-privileges <"$DEST/taskagent.dump"
  cleanup_restore_database
  trap - EXIT
else
  pg_restore --list "$DEST/taskagent.dump" >"$DEST/restore.list"
  pg_restore --dbname="$TASKAGENT_RESTORE_TEST_DATABASE_URL" --clean --if-exists --no-owner --no-privileges "$DEST/taskagent.dump"
fi

cat >"$DEST/receipt.txt" <<EOF
created_at=$STAMP
database_dump=$DEST/taskagent.dump
upload_backup=$DEST/uploads
checksum_match=true
restore_list_verified=true
isolated_restore_verified=true
EOF
chmod 0600 "$DEST/config/taskagent.env" "$DEST/receipt.txt"
echo "$DEST"
