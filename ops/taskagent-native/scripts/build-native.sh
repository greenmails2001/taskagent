#!/usr/bin/env bash
set -euo pipefail

repo_root="${1:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)}"
go_bin="${GO_BIN:-go}"
pnpm_bin="${PNPM_BIN:-pnpm}"

mkdir -p "${repo_root}/bin"
(
  cd "${repo_root}/server"
  CGO_ENABLED=0 "${go_bin}" build -ldflags "-s -w -X main.version=n9-native -X main.commit=$(git -C "${repo_root}" rev-parse --short HEAD)" \
    -o "${repo_root}/bin/taskagent-server" ./cmd/server
)

(
  cd "${repo_root}"
  "${pnpm_bin}" --filter @multica/web typecheck
  "${pnpm_bin}" --filter @multica/web build
)

echo "Native TaskAgent backend and web artifacts are ready."
