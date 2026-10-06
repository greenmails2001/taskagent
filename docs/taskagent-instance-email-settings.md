# TaskAgent instance email settings

## Authorization

Only users whose normalized database email appears in `MULTICA_INSTANCE_ADMIN_EMAILS` may call `GET`, `PUT`, or `POST /api/admin/email-settings*`. This is instance authority and is intentionally separate from workspace roles.

## Secret storage

PostgreSQL stores SMTP metadata plus AES-256-GCM ciphertext. `EMAIL_SETTINGS_MASTER_KEY` is the external key source. API responses return `password_configured` but never return plaintext or ciphertext. Audit rows record metadata and whether the password changed, never the password itself.

## API

- `GET /api/admin/email-settings` returns active metadata.
- `PUT /api/admin/email-settings` validates host, port, TLS mode and from-address; a blank password preserves the existing encrypted password.
- `POST /api/admin/email-settings/test` sends a test message using the in-memory active configuration.

A successful update commits settings and audit in one PostgreSQL transaction, then atomically reloads `EmailService` through its mutex-protected configuration snapshot.

## Backup and restore

Back up the database dump and `/u01/apps/n9/config/taskagent/backend.env` as one recovery unit. Restore both from the same backup generation. Retaining only one side creates an undecryptable secret.

## Rollback

Keep the existing `SMTP_*` environment variables until the UI-backed configuration has operated reliably. Removing or disabling the database row lets the environment configuration remain the recovery source.
