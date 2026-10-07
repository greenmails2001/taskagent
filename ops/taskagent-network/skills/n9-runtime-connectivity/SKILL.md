---
name: n9-runtime-connectivity
description: Diagnose Multica runtime heartbeat, provider catalog and execution without copying credentials.
---

# Runtime Connectivity

Use the control-plane API as source of truth for runtime binding and online state. Runtime `1.247` is the `network_ops_primary` reference, not a credential source.

Provider, model and effort must be resolved from the active catalog. For this team require `9route`, `cx/gpt-6.1-sol`, `low`; stop rather than silently selecting another provider or model. Online heartbeat alone does not prove provider execution: require a real task receipt.
