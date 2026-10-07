# TaskAgent Network Operations

This package makes TaskAgent ingress transport-independent and provides bounded monitoring resources for the later `n9_network_ops` team.

## Safe order

1. Inventory current systemd, Caddy/tunnel and storage state.
2. Enter maintenance mode and run a recoverable database + upload backup.
3. Render and validate configuration.
4. Repair only the confirmed root upload directory permission when required.
5. Deploy observer and deterministic timers.
6. Verify direct backend, Caddy and public paths.
7. Only then dry-run TaskAgent resource provisioning.

The provisioner accepts `--apply` only with a deployment receipt whose backup, isolated restore, config, upload, WebSocket and rollback gates are all true. It leaves the incident autopilot paused and its webhook trigger disabled.

Generate that receipt only from six non-empty operator evidence files with `scripts/create-deployment-receipt.sh <evidence-dir> <receipt.json>`. The receipt records a SHA-256 digest for each evidence file so later provisioning can be tied to the exact verification artifacts.

See `docs/` for setup, configuration, operations, incident handling, topology switching, rollback and MCP/API notes.
