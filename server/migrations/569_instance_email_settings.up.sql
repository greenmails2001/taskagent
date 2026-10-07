CREATE TABLE instance_email_settings (
    singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton),
    transport TEXT NOT NULL DEFAULT 'smtp' CHECK (transport IN ('smtp')),
    smtp_host TEXT NOT NULL CHECK (btrim(smtp_host) <> ''),
    smtp_port INTEGER NOT NULL CHECK (smtp_port BETWEEN 1 AND 65535),
    smtp_tls TEXT NOT NULL CHECK (smtp_tls IN ('starttls', 'implicit')),
    smtp_username TEXT NOT NULL DEFAULT '',
    smtp_password_ciphertext BYTEA NOT NULL,
    smtp_from_email TEXT NOT NULL CHECK (btrim(smtp_from_email) <> ''),
    smtp_ehlo_name TEXT NOT NULL DEFAULT '',
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    updated_by UUID NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE instance_email_settings_audit (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_user_id UUID NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
    action TEXT NOT NULL CHECK (action IN ('create', 'update', 'test')),
    settings_snapshot JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_instance_email_settings_audit_created_at
    ON instance_email_settings_audit (created_at DESC);
