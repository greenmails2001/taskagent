# TaskAgent Native Development Runtime

Date: 2026-10-04

## Purpose

TaskAgent application code runs directly from the host source tree so Go and Next.js changes are reloaded without rebuilding application container images. PostgreSQL remains containerized because it is infrastructure, not a component being customized.

## Source of truth

- Source: `/u01/apps/n9/sources/taskagent-source`
- Backend environment: `/u01/apps/n9/config/taskagent/backend.env`
- Web environment: `/u01/apps/n9/config/taskagent/web.env`
- Air configuration: `/u01/apps/n9/config/taskagent/air.native.toml`
- PostgreSQL compose: `/u01/apps/n9/external-coder-deploy/taskagent/compose.infra.yml`
- PostgreSQL data volume: `n9-taskagent_taskagent-postgres`
- Local uploads: `/u01/apps/n9/data/taskagent/uploads`

The PostgreSQL volume is the only database source of truth. Do not create a second development database for this runtime unless an explicit data-isolation migration is approved.

## Runtime topology

- `taskagent-web-native.service`: Next.js development server on `192.168.1.246:7300` with HMR.
- `taskagent-backend-native.service`: Go server managed by Air on TCP `7301` with source-triggered rebuild and restart.
- `taskagent-backend-firewall.service`: blocks non-loopback callers from TCP `7301`; only local web/backend integration may call it directly.
- `n9-taskagent-postgres-1`: PostgreSQL/pgvector on `127.0.0.1:7432`, backed by the existing persistent volume.
- Caddy/Authelia continues to protect `https://taskagent.proj.vn` and forwards to the web service.

## Daily development commands

```bash
systemctl --user status taskagent-backend-native.service taskagent-web-native.service
journalctl --user -u taskagent-backend-native.service -f
journalctl --user -u taskagent-web-native.service -f
systemctl --user restart taskagent-backend-native.service
systemctl --user restart taskagent-web-native.service
```

Editing a `.go`, `.sql`, or `.json` file under `server/` causes Air to rebuild the backend binary and restart the process. Editing frontend source causes Next.js to recompile the affected route/module through HMR. Neither workflow requires a Docker image build.

## PostgreSQL operations

```bash
cd /u01/apps/n9/external-coder-deploy/taskagent
docker compose -p n9-taskagent -f compose.infra.yml --env-file .env up -d postgres
docker inspect -f {{.State.Health.Status}} n9-taskagent-postgres-1
```

Never run `docker compose down -v`, `docker volume rm n9-taskagent_taskagent-postgres`, or replace the external volume declaration. Those commands would remove or detach the database source of truth.

## Verification

```bash
curl -fsS http://127.0.0.1:7301/healthz
curl -fsS http://192.168.1.246:7300/login >/dev/null
curl -skI https://taskagent.proj.vn
pnpm --filter @multica/web typecheck
```

Expected backend health includes both `db=ok` and `migrations=ok`. The public unauthenticated domain should return an HTTP redirect to `auth.proj.vn` from Authelia.

## Rollback to application containers

Rollback reuses the same database volume and preserves the native source tree:

```bash
systemctl --user stop taskagent-web-native.service taskagent-backend-native.service
cd /u01/apps/n9/external-coder-deploy/taskagent
docker compose -p n9-taskagent -f compose.dev.yml --env-file .env up -d backend web
curl -fsS http://127.0.0.1:7301/healthz
curl -skI https://taskagent.proj.vn
```

Stop native services before starting Docker application containers because both implementations claim ports `7300` and `7301`. PostgreSQL is not rolled back; both application modes use the same persistent database.

## Backup evidence

The pre-migration PostgreSQL custom-format backup is:

```text
/u01/apps/n9/external-coder-deploy/taskagent/backups/multica-before-native-20261004-032427.dump
```

Validate it without restoring:

```bash
pg_restore --list /u01/apps/n9/external-coder-deploy/taskagent/backups/multica-before-native-20261004-032427.dump >/dev/null
```

## Instance email settings

TaskAgent exposes `Settings → Instance → Email`. The backend authorizes this screen against `MULTICA_INSTANCE_ADMIN_EMAILS`; workspace `owner` or `admin` roles do not grant instance-level SMTP administration.

The active SMTP metadata and AES-256-GCM ciphertext are stored in PostgreSQL tables `instance_email_settings` and `instance_email_settings_audit`. The encryption key is loaded from `EMAIL_SETTINGS_MASTER_KEY` in `/u01/apps/n9/config/taskagent/backend.env` and must never be placed in PostgreSQL, logs, audit JSON, Git, or screenshots.

Back up the PostgreSQL database and `backend.env` together. A database dump without the matching master key cannot decrypt the SMTP password. Before rotating the password, use the Email screen to save the new password and send a test message. Leaving the password field blank preserves the existing ciphertext.

Environment variables `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `SMTP_FROM_EMAIL`, `SMTP_TLS`, and `SMTP_EHLO_NAME` remain the rollback source when no enabled database setting can be loaded. Migration `504_instance_email_settings` is applied with:

```bash
cd /u01/apps/n9/sources/taskagent-source/server
set -a; . /u01/apps/n9/config/taskagent/backend.env; set +a
/u01/apps/n9/toolchains/go/bin/go run ./cmd/migrate up
```

Current pre-capability backup:

```text
/u01/apps/n9/external-coder-deploy/taskagent/backups/multica-before-email-settings-20261004-083725.dump
```

## Production frontend runtime (2026-10-05 Asia/Ho_Chi_Minh)

The public TaskAgent frontend now runs as a precompiled Next.js production server through `taskagent-web-native.service`:

```text
pnpm --filter @multica/web exec next start --hostname 192.168.1.246 --port 7300
```

Production source changes do not hot-reload. After frontend tests and typecheck pass, publish changes with:

```bash
systemctl --user stop taskagent-web-native.service
cd /u01/apps/n9/sources/taskagent-source
rm -rf apps/web/.next
set -a; . /u01/apps/n9/config/taskagent/web.env; set +a
pnpm --filter @multica/web build
systemctl --user start taskagent-web-native.service
```

The first measured clean production build on this host completed in 290.17 seconds with peak RSS 3,527,748 KiB. Stop the frontend before building so the development server does not retain 6-8 GiB while Webpack builds.

Rollback to development/HMR:

```bash
cp /home/localai/.config/systemd/user/taskagent-web-native.service.dev-backup-20261004-173404 \
  /home/localai/.config/systemd/user/taskagent-web-native.service
systemctl --user daemon-reload
systemctl --user restart taskagent-web-native.service
```

Production verification:

```bash
systemctl --user is-active taskagent-web-native.service taskagent-backend-native.service
curl -fsS http://192.168.1.246:7300/login >/dev/null
curl -fsS http://192.168.1.246:7301/healthz
curl -sS -o /dev/null -w '%{http_code}\n' http://192.168.1.246:7300/api/me
```

An unauthenticated `/api/me` must return `401`; this proves the frontend rewrite reaches the backend authentication boundary. `/auth/send-code` must continue to return `200` for an existing permitted account, subject to the resend cooldown.
