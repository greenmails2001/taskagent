# TaskAgent hybrid native runtime

TaskAgent backend and web run natively from the reviewed source checkout. PostgreSQL and any future unmodified infrastructure dependencies run in Docker. Do not add `backend` or `web` services to `compose.infra.yml`.

## Development

Use a dedicated worktree and database name. Run the backend with Air or `go run`, and run the web app with Next.js HMR:

```bash
cd /u01/apps/n9/sources/taskagent-source
set -a; . /u01/apps/n9/config/taskagent/backend.env; set +a
air -c /u01/apps/n9/config/taskagent/air.native.toml

set -a; . /u01/apps/n9/config/taskagent/web.env; set +a
pnpm --filter @multica/web dev --hostname 127.0.0.1
```

## Infrastructure

The PostgreSQL volume is external so a typo or Compose project rename cannot silently create an empty replacement database.

```bash
cd ops/taskagent-native
docker compose --env-file config/infra.env -f compose.infra.yml up -d postgres
docker compose --env-file config/infra.env -f compose.infra.yml ps
```

Never run `docker compose down -v` or delete `n9-taskagent_taskagent-postgres`.

## Native production build

```bash
ops/taskagent-native/scripts/build-native.sh /u01/apps/n9/sources/taskagent-source
```

The script builds `bin/taskagent-server`, typechecks the web package and creates the production `.next` artifact. It does not connect to the database, restart services or run migrations.

Install reviewed environment files under `/u01/apps/n9/config/taskagent/`, copy the two unit templates to `~/.config/systemd/user/`, then review the rendered units before enabling them:

```bash
systemctl --user daemon-reload
systemctl --user enable taskagent-backend-native.service taskagent-web-native.service
systemctl --user start taskagent-backend-native.service taskagent-web-native.service
```

Starting/restarting services and running migrations require the separate cutover approval. Verify with:

```bash
systemctl --user is-active taskagent-backend-native.service taskagent-web-native.service
curl -fsS http://127.0.0.1:7301/healthz
curl -fsS http://127.0.0.1:7300/login >/dev/null
```

## Rollback

Stop the native units, restore the pinned source commit and native artifacts, then start the units again. If a migration changed the database schema, restore the matching PostgreSQL backup rather than rolling back only the binaries. Uploads remain on the host path configured by `LOCAL_UPLOAD_DIR` and must be snapshotted with the database before cutover.
