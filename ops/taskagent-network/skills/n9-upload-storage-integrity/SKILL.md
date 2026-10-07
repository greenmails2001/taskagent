---
name: n9-upload-storage-integrity
description: Verify TaskAgent upload permissions and attachment integrity without risking user data.
---

# Upload Storage Integrity

Check the backend service account against the absolute upload directory. Mode `0755` permits writes only for the owner; report both owner and effective service user.

Probe files must use `n9-network-probe-<run-id>`. Delete only the exact attachment ID created by the same run nonce, then verify both database row and file are gone. Never use a wildcard delete, recursive ownership repair, or direct database mutation.
