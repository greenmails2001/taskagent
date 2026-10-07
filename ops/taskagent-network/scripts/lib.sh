#!/usr/bin/env bash
set -euo pipefail

load_contract() {
  local env_file=$1
  test -f "$env_file" || { echo "config not found: $env_file" >&2; return 2; }
  set -a
  # shellcheck disable=SC1090
  source "$env_file"
  set +a
}

require_vars() {
  local name
  for name in "$@"; do
    test -n "${!name:-}" || { echo "missing required variable: $name" >&2; return 2; }
  done
}

origin_host() {
  local origin=$1
  node -e 'const u=new URL(process.argv[1]); if(!["http:","https:"].includes(u.protocol)||u.pathname!=="/"||u.search||u.hash||u.username||u.password)process.exit(2); process.stdout.write(u.host)' "$origin"
}

contains_temporary_tunnel() {
  case "$1" in
    *trycloudflare.com*|*.abc-tunnel.us*) return 0 ;;
    *) return 1 ;;
  esac
}
