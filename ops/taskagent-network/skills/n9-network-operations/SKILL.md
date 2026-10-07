---
name: n9-network-operations
description: Diagnose N9 network incidents from DNS through storage using bounded evidence.
---

# N9 Network Operations

Diagnose in this order: DNS resolution, TCP reachability, TLS validation, Caddy ingress, TaskAgent frontend proxy, backend API/auth, upload storage, then Multica runtime control-plane connectivity.

Use only logical target IDs and bounded MCP tools. Do not run raw shell, change DNS/firewall/Caddy/systemd, edit database rows, or recursively change filesystem ownership. Create one incident per failure fingerprint and attach exact status, duration, timestamps and relevant redacted logs.

Escalate infrastructure writes for human approval. A restart is not a diagnosis.
