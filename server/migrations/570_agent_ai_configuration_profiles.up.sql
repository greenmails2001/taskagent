CREATE TABLE agent_ai_configuration_profile (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID NOT NULL,
    workspace_id UUID NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
    ai_provider_id UUID NOT NULL REFERENCES ai_provider(id) ON DELETE RESTRICT,
    credential_mode TEXT NOT NULL
        CHECK (credential_mode IN ('runtime_managed', 'control_plane_managed')),
    provider_account_id UUID,
    provider_model_id UUID NOT NULL,
    effort_key TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    FOREIGN KEY (agent_id, workspace_id)
        REFERENCES agent(id, workspace_id) ON DELETE CASCADE,
    FOREIGN KEY (provider_account_id, workspace_id)
        REFERENCES ai_provider_account(id, workspace_id) ON DELETE RESTRICT,
    FOREIGN KEY (provider_account_id, ai_provider_id)
        REFERENCES ai_provider_account(id, ai_provider_id) ON DELETE RESTRICT,
    FOREIGN KEY (provider_model_id, ai_provider_id)
        REFERENCES provider_model(id, ai_provider_id) ON DELETE RESTRICT,
    FOREIGN KEY (provider_model_id, effort_key)
        REFERENCES provider_model_effort(provider_model_id, effort_key) ON DELETE RESTRICT,
    UNIQUE NULLS NOT DISTINCT (agent_id, ai_provider_id, provider_account_id),
    CHECK (
        (credential_mode = 'runtime_managed' AND provider_account_id IS NULL)
        OR
        (credential_mode = 'control_plane_managed' AND provider_account_id IS NOT NULL)
    )
);

CREATE INDEX idx_agent_ai_configuration_profile_lookup
    ON agent_ai_configuration_profile(agent_id, ai_provider_id, provider_account_id);

INSERT INTO agent_ai_configuration_profile (
    agent_id, workspace_id, ai_provider_id, credential_mode,
    provider_account_id, provider_model_id, effort_key, created_at, updated_at
)
SELECT agent_id, workspace_id, ai_provider_id, credential_mode,
       provider_account_id, provider_model_id, effort_key, created_at, updated_at
FROM agent_ai_configuration
ON CONFLICT (agent_id, ai_provider_id, provider_account_id)
DO NOTHING;
