#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
# shellcheck source=lib.sh
source "$ROOT_DIR/scripts/lib.sh"

ENV_FILE=${1:?env file required}
OUTPUT_DIR=${2:?output directory required}
"$ROOT_DIR/scripts/validate-config.sh" "$ENV_FILE" --skip-filesystem >/dev/null
load_contract "$ENV_FILE"
mkdir -p "$OUTPUT_DIR"

cat >"$OUTPUT_DIR/backend.env" <<EOF
FRONTEND_ORIGIN=$TASKAGENT_APP_ORIGIN
MULTICA_APP_URL=$TASKAGENT_APP_ORIGIN
CORS_ALLOWED_ORIGINS=${CORS_ALLOWED_ORIGINS:-$TASKAGENT_APP_ORIGIN}
MULTICA_PUBLIC_URL=$TASKAGENT_API_ORIGIN
MULTICA_DAEMON_SERVER_URL=$TASKAGENT_API_ORIGIN
LOCAL_UPLOAD_DIR=$TASKAGENT_UPLOAD_DIR
LOCAL_UPLOAD_BASE_URL=
EOF

cat >"$OUTPUT_DIR/frontend.env" <<EOF
REMOTE_API_URL=$TASKAGENT_INTERNAL_BACKEND_URL
EOF

case "$TASKAGENT_INGRESS_MODE" in
  cloudflare_caddy|direct_domain_caddy) TASKAGENT_CADDY_SITE=$(origin_host "$TASKAGENT_APP_ORIGIN") ;;
  static_ip_caddy|localhost_maintenance) TASKAGENT_CADDY_SITE="$TASKAGENT_APP_ORIGIN" ;;
esac

sed \
  -e "s#{\$TASKAGENT_CADDY_SITE}#$TASKAGENT_CADDY_SITE#g" \
  -e "s#{\$TASKAGENT_INTERNAL_BACKEND_URL}#$TASKAGENT_INTERNAL_BACKEND_URL#g" \
  -e "s#{\$TASKAGENT_OBSERVER_URL}#$TASKAGENT_OBSERVER_URL#g" \
  -e "s#{\$TASKAGENT_FRONTEND_URL}#$TASKAGENT_FRONTEND_URL#g" \
  "$ROOT_DIR/caddy/Caddyfile.template" >"$OUTPUT_DIR/Caddyfile"

chmod 0600 "$OUTPUT_DIR/backend.env" "$OUTPUT_DIR/frontend.env"
echo "rendered TaskAgent config in $OUTPUT_DIR"
