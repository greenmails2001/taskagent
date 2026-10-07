#!/usr/bin/env bash
set -euo pipefail

EVIDENCE_DIR=${1:?evidence directory required}
OUTPUT=${2:?output receipt path required}

FIELDS=(backup restore config upload websocket rollback)
for field in "${FIELDS[@]}"; do
  evidence="$EVIDENCE_DIR/$field.ok"
  test -s "$evidence" || { echo "missing verified evidence: $evidence" >&2; exit 2; }
done

mkdir -p "$(dirname "$OUTPUT")"
created_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)
{
  printf '{\n  "schema_version": 1,\n  "created_at": "%s",\n' "$created_at"
  for index in "${!FIELDS[@]}"; do
    field=${FIELDS[$index]}
    digest=$(sha256sum "$EVIDENCE_DIR/$field.ok" | cut -d' ' -f1)
    printf '  "%s_verified": true,\n  "%s_evidence_sha256": "%s"' "$field" "$field" "$digest"
    if test "$index" -lt "$((${#FIELDS[@]} - 1))"; then printf ',\n'; else printf '\n'; fi
  done
  printf '}\n'
} >"$OUTPUT"
chmod 0600 "$OUTPUT"
echo "$OUTPUT"
