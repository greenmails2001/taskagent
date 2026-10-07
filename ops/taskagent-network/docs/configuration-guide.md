# Configuration Guide

`TASKAGENT_APP_ORIGIN` is the browser frontend origin. `TASKAGENT_API_ORIGIN` is the externally reachable API/runtime origin. `TASKAGENT_INTERNAL_BACKEND_URL` is the private Next/Caddy upstream. They may coincide in single-origin deployments but retain separate responsibilities.

`CORS_ALLOWED_ORIGINS` is an explicit comma-separated browser/WebSocket allowlist. `LOCAL_UPLOAD_BASE_URL` is deliberately empty so stored attachment URLs remain relative and survive domain/IP changes.

Ingress modes are `cloudflare_caddy`, `direct_domain_caddy`, `static_ip_caddy`, and `localhost_maintenance`. Persistent configuration rejects temporary tunnel hostnames.
