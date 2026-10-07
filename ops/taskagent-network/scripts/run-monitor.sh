#!/usr/bin/env bash
set -euo pipefail

ENV_FILE=${1:?env file required}
MODE=${2:-health}
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

BODY_FILE=$(mktemp)
PROBE_FILE=$(mktemp)
DOWNLOAD_FILE=$(mktemp)
ATTACHMENT_ID=
cleanup() {
  if test -n "$ATTACHMENT_ID"; then
    curl --fail --silent --show-error --max-time 15 -X DELETE \
      -H "Authorization: Bearer ${TASKAGENT_NETWORK_PAT:?}" \
      -H "X-Workspace-ID: ${TASKAGENT_NETWORK_WORKSPACE_ID:?}" \
      "$TASKAGENT_API_ORIGIN/api/attachments/$ATTACHMENT_ID" >/dev/null || true
  fi
  rm -f "$BODY_FILE" "$PROBE_FILE" "$DOWNLOAD_FILE"
}
trap cleanup EXIT

check_health() { curl --fail --silent --show-error --max-time 15 --output "$BODY_FILE" "$TASKAGENT_API_ORIGIN/healthz"; }
check_certificate() {
  check_health
  host=$(node -e 'process.stdout.write(new URL(process.argv[1]).hostname)' "$TASKAGENT_API_ORIGIN")
  port=$(node -e 'const u=new URL(process.argv[1]); process.stdout.write(u.port || (u.protocol === "https:" ? "443" : "80"))' "$TASKAGENT_API_ORIGIN")
  test "$port" = 443 || return 0
  openssl s_client -connect "$host:$port" -servername "$host" </dev/null 2>/dev/null | openssl x509 -checkend 604800 -noout
}
check_drift() {
  "$(dirname "$0")/validate-config.sh" "$ENV_FILE"
  test -z "${N9_NETWORK_EXPECTED_CONFIG_SHA256:-}" || test "$(sha256sum "$ENV_FILE" | cut -d' ' -f1)" = "$N9_NETWORK_EXPECTED_CONFIG_SHA256"
}
check_upload() {
  dd if=/dev/urandom of="$PROBE_FILE" bs=64 count=1 status=none
  curl --fail --silent --show-error --max-time 30 \
    -H "Authorization: Bearer ${TASKAGENT_NETWORK_PAT:?}" \
    -H "X-Workspace-ID: ${TASKAGENT_NETWORK_WORKSPACE_ID:?}" \
    -F "file=@$PROBE_FILE;filename=n9-network-monitor.bin" \
    "$TASKAGENT_API_ORIGIN/api/upload-file" --output "$BODY_FILE"
  ATTACHMENT_ID=$(jq -er .id "$BODY_FILE")
  download_url=$(jq -r '.download_url // .url // empty' "$BODY_FILE")
  test -n "$download_url" || download_url="/api/attachments/$ATTACHMENT_ID/download"
  curl --fail --silent --show-error --max-time 30 \
    -H "Authorization: Bearer $TASKAGENT_NETWORK_PAT" \
    -H "X-Workspace-ID: $TASKAGENT_NETWORK_WORKSPACE_ID" \
    "$(node -e 'process.stdout.write(new URL(process.argv[2], process.argv[1]).toString())' "$TASKAGENT_API_ORIGIN" "$download_url")" \
    --output "$DOWNLOAD_FILE"
  test "$(sha256sum "$PROBE_FILE" | cut -d' ' -f1)" = "$(sha256sum "$DOWNLOAD_FILE" | cut -d' ' -f1)"
  cleanup
  ATTACHMENT_ID=
}

case "$MODE" in
  health) TARGET="$TASKAGENT_API_ORIGIN/healthz"; CHECK=check_health ;;
  certificate) TARGET="$TASKAGENT_API_ORIGIN"; CHECK=check_certificate ;;
  drift) TARGET="$ENV_FILE"; CHECK=check_drift ;;
  upload) TARGET="$TASKAGENT_API_ORIGIN/api/upload-file"; CHECK=check_upload ;;
  *) echo "unknown monitor mode: $MODE" >&2; exit 2 ;;
esac

if "$CHECK"; then
  echo "{\"status\":\"healthy\",\"mode\":\"$MODE\"}"
  exit 0
fi

FINGERPRINT=$(printf '%s\n' "$MODE|$TARGET" | sha256sum | cut -d' ' -f1)
PAYLOAD=$(printf '{"mode":"%s","target":"%s","fingerprint":"%s","marker":"n9-network-fingerprint:%s"}' "$MODE" "$TARGET" "$FINGERPRINT" "$FINGERPRINT")
if test -n "${N9_NETWORK_INCIDENT_WEBHOOK:-}"; then
  curl --fail --silent --show-error --max-time 15 \
    -H 'Content-Type: application/json' \
    -H "X-N9-Network-Signature: ${N9_NETWORK_WEBHOOK_SECRET:?}" \
    --data "$PAYLOAD" "$N9_NETWORK_INCIDENT_WEBHOOK"
fi
echo "$PAYLOAD"
exit 1
