# TaskAgent Runtime Provider and Model Contract

Date: 2026-10-06

## Source of truth

The selected Multica runtime is the execution boundary. For Codex runtimes,
the runtime user's effective `CODEX_HOME/config.toml` owns `model_provider`,
the corresponding `[model_providers.<id>]` endpoint/protocol profile, `model`,
and `model_reasoning_effort`.

Multica owns the agent-to-runtime binding and optional per-agent overrides in
`agent.model`, `agent.thinking_level`, and `agent.service_tier`. An empty value
is intentional inheritance; the daemon does not replace it with a hardcoded
model or effort.

This is a conflict resolution, not two complementary authorities:
`agent_ai_configuration`, `provider_model`, and related catalog/profile tables
are retained as deprecated compatibility data but no longer write into agent
execution fields after migration `506`.

## Dynamic catalog flow

```text
Agent inspector
  -> POST /api/runtimes/{runtime_id}/models
  -> pending request delivered in daemon heartbeat
  -> daemon reads the runtime-local Codex provider profile
  -> authenticated GET {base_url}/models
  -> provider IDs merged with local Codex bundled metadata
  -> result returned to the inspector
```

Provider model IDs are preserved exactly, including namespaces such as
`cx/gpt-6.1-sol`. Bundled metadata supplies reasoning levels and service tiers
when a provider ID, or its namespace-stripped suffix, matches. Unknown models
returned by the provider remain selectable; Multica never drops them merely
because the installed build does not recognize them.

## Failure behavior

1. The server keeps the last-known-good runtime catalog and does not overwrite
   it with a fallback response.
2. When no live catalog can be obtained, the daemon reports the Codex bundled
   catalog as `catalog_source=bundled_fallback` and `fallback=true`.
3. Manual model entry remains available in the inspector.

The daemon sends only non-secret metadata: provider ID/display name, catalog
source, effective default model, and effective default effort. It never sends
the API key, `auth.json`, raw `config.toml`, or provider headers to the server.

## Runtime-local 9Route configuration

Configure the account that runs `multica daemon`; do not configure another
login user's home directory. The effective runtime config is the daemon user's
`$CODEX_HOME/config.toml` (or `~/.codex/config.toml` when `CODEX_HOME` is not
set). A sanitized 9Route profile is:

```toml
model_provider = "9router"
model = "cx/gpt-6.1-sol"
model_reasoning_effort = "low"

[model_providers.9router]
name = "9Router"
base_url = "https://route.proj.vn/v1"
wire_api = "responses"
requires_openai_auth = true
```

The provider credential stays in that runtime user's local Codex credential
store or an approved provider-specific environment variable readable only by
the daemon account. Keep secret files mode `0600`; do not put keys in this TOML,
the TaskAgent database, deployment archives, screenshots, or runtime metadata.

After editing the source config, validate the effective process before restart:

```bash
pgrep -af 'multica daemon|codex app-server'
tr '\0' '\n' </proc/<multica-pid>/environ \
  | sed -E '/(KEY|TOKEN|SECRET|AUTH|PASSWORD)=/Id' \
  | grep -E '^(CODEX_HOME|HOME|PATH)='
multica runtime list --output json
multica agent get <agent-id> --output json
```

Never paste the unfiltered process environment into a ticket, log, screenshot,
or chat transcript; it can contain the provider credential.

The expected agent fields for inheritance are empty/null. A populated agent
field is an explicit override and therefore wins over the runtime default.

## Model-list API contract

The authenticated, workspace-scoped request is:

```http
POST /api/runtimes/{runtime_id}/models[?force=true]
Authorization: Bearer <session-token>
X-Workspace-ID: <workspace-id>
```

- Without `force=true`, the server may return a recent last-known-good catalog
  immediately with `cached=true` and revalidate it in the background.
- With `force=true`, the request bypasses the serve cache, waits for the daemon,
  and proves the current runtime/provider path.
- `pending` means the daemon has not claimed the request; `running` means the
  daemon claimed it; `completed` contains a usable catalog; `failed` or
  `timeout` contains `error` and must not be presented as an empty authoritative
  catalog.
- Poll a non-terminal request with
  `GET /api/runtimes/{runtime_id}/models/{request_id}`.

The additive completion fields are:

```json
{
  "status": "completed",
  "models": [{ "id": "cx/gpt-6.1-sol", "provider": "9Router", "default": true }],
  "supported": true,
  "cached": false,
  "upstream_provider": "9router",
  "upstream_provider_name": "9Router",
  "catalog_source": "provider_api",
  "effective_default_model": "cx/gpt-6.1-sol",
  "effective_default_effort": "low"
}
```

`fallback=true` with `catalog_source=bundled_fallback` is explicitly
non-authoritative. The server preserves the previous provider-derived catalog
instead of replacing it with fallback rows.

## Runtime enrollment and rollout

- Configure each runtime locally; never copy credentials from 1.247.
- Use a stable provider endpoint. Persistent `trycloudflare.com` and
  `abc-tunnel.us` URLs are prohibited.
- Verify an authenticated `/models` request and one fresh Multica task with
  empty agent model/effort.
- Roll out to 1.246 first, then 1.244, 1.243, 1.245, and 1.247 last.

### Per-host rollout checklist

1. Confirm the exact target host/runtime ID and stop if it does not match the
   approved rollout entry.
2. Back up PostgreSQL, deployment environment files, runtime config, current
   source revision, daemon binary, file hashes, and pre-change row counts.
3. Verify the backup is readable before applying migration or replacing a
   binary. Never move or delete workspace directories.
4. Apply the additive application build and migration 506; restart only the
   target backend/daemon/frontend services that cache changed state.
5. Require `/healthz` to report both `db=ok` and `migrations=ok`.
6. Force model discovery and require `catalog_source=provider_api`, expected
   provider/default metadata, and a non-empty provider catalog.
7. Open the real agent inspector and verify default inheritance, provider,
   dynamic picker, manual entry, refresh, and runtime-default effort.
8. Execute one fresh task with empty agent model/effort. Go only when the run is
   `completed`, `error=null`, and logs identify the intended provider/model.
9. Recount preserved tables and compare with the pre-change receipt.

Stop the rollout on any host if health fails, the provider catalog is fallback
only, the inherited-default task fails, a credential/config path cannot be
traced, or any protected row/workspace count changes unexpectedly.

### Canary receipt (1.246)

- Backup: `/u01/apps/n9/backups/taskagent-runtime-provider-20261006-105234`
- Runtime: `27a8cb03-65df-4f0e-8c4b-249f7515a7ee`
- Agent: `2dcc5b5e-f114-4d4b-a8c9-b8b4b139cc21` (`n9-1246 Local Lead`)
- Forced discovery: `provider_api`, provider `9router`/`9Router`, 17 models,
  default `cx/gpt-6.1-sol`, effort `low`, no fallback.
- Canary: issue `LANPQ53143-24`, run
  `01a110dd-f1b9-78a7-9c7f-176c86deb098`, output
  `RUNTIME_1246_DYNAMIC_CATALOG_OK`, `error=null`.
- UI: production build and restart passed; authenticated Playwright showed the
  inherited default/provider/effort, all 17 IDs, manual entry, and refresh.
- Data: `agent=19`, `agent_ai_configuration=10`,
  `agent_ai_configuration_profile=11`, `provider_model=6`, `ai_provider=2`
  before and after migration.

### Per-host rollback

Stop only the affected TaskAgent services, restore that host's backed-up daemon
binary and application revision/config, run migration 506 down only if the old
application requires the projection triggers, then restart and repeat health,
runtime binding, provider probe, and row-count checks. Restore the PostgreSQL
dump only when database integrity evidence shows an actual data mutation; an
application rollback normally does not require DB restore because migration 506
deletes no rows or tables. Never restore credentials or workspaces from another
machine's backup.

## Data-preserving migration

Migration `571_retire_agent_ai_configuration_projection` drops only the three
projection triggers and their functions. It does not drop, truncate, rewrite,
or delete any provider/model/configuration table or row. Its down migration can
restore the prior trigger behavior if an application rollback requires it.
