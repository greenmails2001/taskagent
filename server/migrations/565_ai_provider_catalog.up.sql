-- Runtime and AI provider are independent dimensions:
--   agent_runtime.provider identifies the executable/runtime protocol family;
--   ai_provider identifies the upstream model API used by that runtime.
-- Credentials remain outside this catalog. provider accounts store only the
-- environment-variable reference whose plaintext value is injected locally.

CREATE TABLE ai_provider (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_key TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    protocol TEXT NOT NULL CHECK (protocol IN (
        'openai_responses',
        'anthropic_messages',
        'openai_compatible_responses'
    )),
    default_base_url TEXT,
    credential_mode TEXT NOT NULL DEFAULT 'runtime_managed'
        CHECK (credential_mode IN ('runtime_managed', 'control_plane_managed')),
    enabled BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (provider_key = lower(provider_key)),
    CHECK (provider_key ~ '^[a-z0-9][a-z0-9_-]*$'),
    CHECK (default_base_url IS NULL OR default_base_url ~ '^https://')
);

CREATE TABLE runtime_provider_compatibility (
    runtime_provider TEXT NOT NULL,
    ai_provider_id UUID NOT NULL REFERENCES ai_provider(id) ON DELETE CASCADE,
    transport TEXT NOT NULL CHECK (transport IN ('native', 'openai_compatible')),
    enabled BOOLEAN NOT NULL DEFAULT true,
    PRIMARY KEY (runtime_provider, ai_provider_id),
    CHECK (runtime_provider ~ '^[a-z0-9][a-z0-9_-]*$')
);

CREATE TABLE ai_provider_account (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
    ai_provider_id UUID NOT NULL REFERENCES ai_provider(id) ON DELETE RESTRICT,
    owner_user_id UUID REFERENCES "user"(id) ON DELETE CASCADE,
    display_name TEXT NOT NULL,
    base_url TEXT,
    secret_env_key TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'unverified'
        CHECK (status IN ('unverified', 'valid', 'invalid', 'revoked')),
    last_validated_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (workspace_id, ai_provider_id, owner_user_id, display_name),
    UNIQUE (id, workspace_id),
    UNIQUE (id, ai_provider_id),
    CHECK (base_url IS NULL OR base_url ~ '^https://'),
    CHECK (secret_env_key ~ '^[A-Z_][A-Z0-9_]*$')
);

CREATE INDEX idx_ai_provider_account_workspace
    ON ai_provider_account(workspace_id, ai_provider_id);

CREATE TABLE provider_model (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ai_provider_id UUID NOT NULL REFERENCES ai_provider(id) ON DELETE CASCADE,
    model_key TEXT NOT NULL,
    display_name TEXT NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (ai_provider_id, model_key),
    UNIQUE (id, ai_provider_id)
);

CREATE TABLE provider_model_effort (
    provider_model_id UUID NOT NULL REFERENCES provider_model(id) ON DELETE CASCADE,
    effort_key TEXT NOT NULL,
    display_name TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    enabled BOOLEAN NOT NULL DEFAULT true,
    PRIMARY KEY (provider_model_id, effort_key),
    CHECK (effort_key ~ '^[a-z0-9][a-z0-9_-]*$')
);

-- Composite foreign keys below require matching unique keys to exist before
-- PostgreSQL creates agent_ai_configuration.
ALTER TABLE agent ADD CONSTRAINT agent_id_workspace_unique UNIQUE (id, workspace_id);
ALTER TABLE agent_runtime ADD CONSTRAINT agent_runtime_id_workspace_unique UNIQUE (id, workspace_id);

CREATE TABLE agent_ai_configuration (
    agent_id UUID PRIMARY KEY,
    workspace_id UUID NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
    runtime_id UUID NOT NULL,
    ai_provider_id UUID NOT NULL REFERENCES ai_provider(id) ON DELETE RESTRICT,
    credential_mode TEXT NOT NULL DEFAULT 'runtime_managed'
        CHECK (credential_mode IN ('runtime_managed', 'control_plane_managed')),
    provider_account_id UUID,
    provider_model_id UUID NOT NULL,
    effort_key TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    FOREIGN KEY (agent_id, workspace_id)
        REFERENCES agent(id, workspace_id) ON DELETE CASCADE,
    FOREIGN KEY (runtime_id, workspace_id)
        REFERENCES agent_runtime(id, workspace_id) ON DELETE RESTRICT,
    FOREIGN KEY (provider_account_id, workspace_id)
        REFERENCES ai_provider_account(id, workspace_id) ON DELETE RESTRICT,
    FOREIGN KEY (provider_account_id, ai_provider_id)
        REFERENCES ai_provider_account(id, ai_provider_id) ON DELETE RESTRICT,
    FOREIGN KEY (provider_model_id, ai_provider_id)
        REFERENCES provider_model(id, ai_provider_id) ON DELETE RESTRICT,
    FOREIGN KEY (provider_model_id, effort_key)
        REFERENCES provider_model_effort(provider_model_id, effort_key)
        ON DELETE RESTRICT,
    CHECK (
        (credential_mode = 'runtime_managed' AND provider_account_id IS NULL)
        OR
        (credential_mode = 'control_plane_managed' AND provider_account_id IS NOT NULL)
    )
);

CREATE INDEX idx_agent_ai_configuration_account
    ON agent_ai_configuration(provider_account_id);

INSERT INTO ai_provider (
    provider_key,
    display_name,
    protocol,
    default_base_url,
    credential_mode
)
VALUES
    ('openai', 'OpenAI', 'openai_responses', 'https://api.openai.com/v1', 'runtime_managed'),
    ('9route', '9route', 'openai_compatible_responses', 'https://route.proj.vn/v1', 'runtime_managed');

INSERT INTO runtime_provider_compatibility (runtime_provider, ai_provider_id, transport)
SELECT 'codex', id,
       CASE provider_key WHEN 'openai' THEN 'native' ELSE 'openai_compatible' END
FROM ai_provider
WHERE provider_key IN ('openai', '9route');
