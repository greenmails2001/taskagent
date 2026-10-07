# Rollback Guide

Restore the prior rendered environment, Caddy configuration and systemd drop-ins, then gracefully reload/restart only the affected services. Verify direct and public access.

Do not restore database or uploads for a configuration rollback. Restore data only when corruption/loss is proven, from the verified backup copy, under a separate approval and maintenance window.
