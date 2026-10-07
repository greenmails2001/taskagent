# Topology Switch Guide

1. Create and verify a fresh backup receipt.
2. Change only canonical environment values and `TASKAGENT_INGRESS_MODE`.
3. Render into a staging directory.
4. Validate Caddy configuration and origin/CORS consistency.
5. Enter maintenance, install rendered config and gracefully reload Caddy.
6. Verify login, `/api/config`, WebSocket, upload/download checksum and an existing attachment.
7. Keep the previous rendered directory until the observation window closes.

No application rebuild or attachment database migration is expected.
