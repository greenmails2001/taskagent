#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
# shellcheck source=lib.sh
source "$ROOT_DIR/scripts/lib.sh"

ENV_FILE=${1:-}
SKIP_FILESYSTEM=false
test "${2:-}" = "--skip-filesystem" && SKIP_FILESYSTEM=true
load_contract "$ENV_FILE"
require_vars TASKAGENT_APP_ORIGIN TASKAGENT_API_ORIGIN TASKAGENT_FRONTEND_URL \
  TASKAGENT_INTERNAL_BACKEND_URL TASKAGENT_UPLOAD_DIR TASKAGENT_SERVICE_USER \
  TASKAGENT_OBSERVER_URL TASKAGENT_INGRESS_MODE TASKAGENT_BACKUP_ROOT

for value in "$TASKAGENT_APP_ORIGIN" "$TASKAGENT_API_ORIGIN" "$TASKAGENT_FRONTEND_URL" "$TASKAGENT_INTERNAL_BACKEND_URL" "$TASKAGENT_OBSERVER_URL"; do
  origin_host "$value" >/dev/null || { echo "invalid origin URL: $value" >&2; exit 2; }
  if contains_temporary_tunnel "$value"; then
    echo "temporary tunnel hostname is forbidden: $value" >&2
    exit 2
  fi
done

case "$TASKAGENT_INGRESS_MODE" in
  cloudflare_caddy|direct_domain_caddy|static_ip_caddy|localhost_maintenance) ;;
  *) echo "invalid TASKAGENT_INGRESS_MODE" >&2; exit 2 ;;
esac

case "$TASKAGENT_UPLOAD_DIR" in /*) ;; *) echo "TASKAGENT_UPLOAD_DIR must be absolute" >&2; exit 2 ;; esac
case "$TASKAGENT_BACKUP_ROOT" in /*) ;; *) echo "TASKAGENT_BACKUP_ROOT must be absolute" >&2; exit 2 ;; esac
case "$TASKAGENT_BACKUP_ROOT/" in "$TASKAGENT_UPLOAD_DIR/"*) echo "backup root must not be inside live uploads" >&2; exit 2 ;; esac
case "$TASKAGENT_UPLOAD_DIR/" in "$TASKAGENT_BACKUP_ROOT/"*) echo "live uploads must not be inside backup root" >&2; exit 2 ;; esac

if ! $SKIP_FILESYSTEM; then
  test -d "$TASKAGENT_UPLOAD_DIR" || { echo "upload directory missing" >&2; exit 2; }
  id "$TASKAGENT_SERVICE_USER" >/dev/null 2>&1 || { echo "service user missing" >&2; exit 2; }
  if test "$(id -un)" = "$TASKAGENT_SERVICE_USER"; then
    test -w "$TASKAGENT_UPLOAD_DIR" -a -x "$TASKAGENT_UPLOAD_DIR"
  else
    runuser -u "$TASKAGENT_SERVICE_USER" -- test -w "$TASKAGENT_UPLOAD_DIR" -a -x "$TASKAGENT_UPLOAD_DIR"
  fi || {
    echo "upload directory is not writable by $TASKAGENT_SERVICE_USER" >&2
    exit 2
  }
fi

echo "TaskAgent network config is valid"
