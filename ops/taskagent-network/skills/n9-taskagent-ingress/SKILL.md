---
name: n9-taskagent-ingress
description: Validate TaskAgent Cloudflare, Caddy, domain, static-IP and WebSocket routing contracts.
---

# TaskAgent Ingress

Treat Caddy as the stable ingress authority and Cloudflare Tunnel as optional transport. Compare browser app origin, externally reachable API origin and internal backend upstream separately.

Verify exact and descendant routes for `/api`, `/auth`, `/uploads`, `/v1`; verify `/health`, `/healthz`, and `/ws`. A working HTTP page does not prove WebSocket, upload-body or cookie-origin correctness.

Never persist temporary tunnel hostnames or disable TLS verification.
