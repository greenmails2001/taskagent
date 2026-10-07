# Incident Runbook

Investigate DNS → TCP → TLS → Caddy → frontend proxy → backend/API/auth → upload storage → runtime control plane. Record exact timestamps, path, status, duration and redacted logs.

For upload failures, test direct backend first. If direct succeeds but public upload stalls or fails, inspect ingress request-body transport rather than changing the Go multipart handler.

Close an incident only after `n9_network_verifier` reproduces the original scenario successfully and verifies backup/rollback availability.
