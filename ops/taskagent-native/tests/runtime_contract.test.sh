#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

grep -q '^  postgres:' "${root}/compose.infra.yml"
! grep -q '^  backend:' "${root}/compose.infra.yml"
! grep -q '^  web:' "${root}/compose.infra.yml"
grep -q 'taskagent-postgres:/var/lib/postgresql/data' "${root}/compose.infra.yml"

grep -q 'ExecStart=.*/bin/taskagent-server' "${root}/systemd/taskagent-backend-native.service"
grep -q 'EnvironmentFile=.*/backend.env' "${root}/systemd/taskagent-backend-native.service"
grep -q 'ExecStart=.*pnpm.*next start' "${root}/systemd/taskagent-web-native.service"
grep -q 'EnvironmentFile=.*/web.env' "${root}/systemd/taskagent-web-native.service"

grep -q '^DATABASE_URL=postgres://.*127.0.0.1:7432/' "${root}/config/backend.env.example"
grep -q '^REMOTE_API_URL=http://127.0.0.1:7301$' "${root}/config/web.env.example"
grep -q 'docker compose.*compose.infra.yml.*up -d postgres' "${root}/README.md"
grep -q 'systemctl --user.*taskagent-backend-native.service' "${root}/README.md"

echo "native runtime contract tests passed"
