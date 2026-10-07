#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

write_valid_env() {
  cat >"$TMP_DIR/taskagent.env" <<'EOF'
TASKAGENT_APP_ORIGIN=https://taskagent.example.com
TASKAGENT_API_ORIGIN=https://taskagent.example.com
TASKAGENT_FRONTEND_URL=http://192.0.2.10:7300
TASKAGENT_INTERNAL_BACKEND_URL=http://127.0.0.1:7301
TASKAGENT_OBSERVER_URL=http://127.0.0.1:7391
TASKAGENT_UPLOAD_DIR=/srv/taskagent/uploads
TASKAGENT_SERVICE_USER=localai
TASKAGENT_INGRESS_MODE=cloudflare_caddy
TASKAGENT_BACKUP_ROOT=/backup/taskagent
CORS_ALLOWED_ORIGINS=https://taskagent.example.com
EOF
}

write_valid_env
"$ROOT_DIR/scripts/validate-config.sh" "$TMP_DIR/taskagent.env" --skip-filesystem
"$ROOT_DIR/scripts/render-config.sh" "$TMP_DIR/taskagent.env" "$TMP_DIR/rendered"

grep -q '^FRONTEND_ORIGIN=https://taskagent.example.com$' "$TMP_DIR/rendered/backend.env" || fail "missing frontend origin"
grep -q '^MULTICA_PUBLIC_URL=https://taskagent.example.com$' "$TMP_DIR/rendered/backend.env" || fail "missing public API origin"
grep -q '^REMOTE_API_URL=http://127.0.0.1:7301$' "$TMP_DIR/rendered/frontend.env" || fail "missing internal backend URL"
grep -q '^LOCAL_UPLOAD_BASE_URL=$' "$TMP_DIR/rendered/backend.env" || fail "upload base URL must stay relative"
grep -q 'id -un.*TASKAGENT_SERVICE_USER' "$ROOT_DIR/scripts/validate-config.sh" || fail "validator must support non-root service user self-check"

for path in '/api /api/*' '/auth /auth/*' '/uploads /uploads/*' '/v1 /v1/*' '/health /healthz' '/ws'; do
  grep -Fq "$path" "$TMP_DIR/rendered/Caddyfile" || fail "Caddyfile missing matcher: $path"
done
grep -q '@observer path /mcp /mcp/\*' "$TMP_DIR/rendered/Caddyfile" || fail "observer MCP route missing"
grep -q 'reverse_proxy @observer http://127.0.0.1:7391' "$TMP_DIR/rendered/Caddyfile" || fail "observer upstream missing"

sed -i 's#https://taskagent.example.com#https://broken.trycloudflare.com#' "$TMP_DIR/taskagent.env"
if "$ROOT_DIR/scripts/validate-config.sh" "$TMP_DIR/taskagent.env" --skip-filesystem >/dev/null 2>&1; then
  fail "temporary tunnel hostname accepted"
fi

write_valid_env
sed -i 's#TASKAGENT_UPLOAD_DIR=/srv/taskagent/uploads#TASKAGENT_UPLOAD_DIR=relative/uploads#' "$TMP_DIR/taskagent.env"
if "$ROOT_DIR/scripts/validate-config.sh" "$TMP_DIR/taskagent.env" --skip-filesystem >/dev/null 2>&1; then
  fail "relative upload directory accepted"
fi

write_valid_env
sed -i 's#TASKAGENT_BACKUP_ROOT=/backup/taskagent#TASKAGENT_BACKUP_ROOT=/srv/taskagent/uploads/backup#' "$TMP_DIR/taskagent.env"
if "$ROOT_DIR/scripts/validate-config.sh" "$TMP_DIR/taskagent.env" --skip-filesystem >/dev/null 2>&1; then
  fail "backup root nested under live uploads accepted"
fi

echo "config contract tests passed"
