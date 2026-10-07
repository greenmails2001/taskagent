# API And MCP Integration

`n9-network-observer` is a loopback-bound Streamable HTTP MCP server at `/mcp`, protected by a dedicated bearer secret. TaskAgent stores the remote MCP entry as write-only workspace configuration and binds it explicitly to selected agents.

Tools accept logical target/service IDs. They do not accept arbitrary URLs, unit names or shell commands. DNS results are checked against configured CIDRs, redirects are not followed, log output is bounded/redacted, and incident creation is restricted to configured TaskAgent scope.

`storage_verify_upload_roundtrip` creates one 64-byte random attachment through `/api/upload-file`, downloads it through the URL returned by TaskAgent, compares SHA-256 digests, and deletes exactly that attachment through `DELETE /api/attachments/{id}` in a `finally` cleanup block. It never scans or removes existing user attachments.

Provisioning resolves runtime, provider, model and effort through TaskAgent APIs. Required selection is `9route`, `cx/gpt-6.1-sol`, `low`; missing catalog entries stop provisioning rather than triggering fallback.
