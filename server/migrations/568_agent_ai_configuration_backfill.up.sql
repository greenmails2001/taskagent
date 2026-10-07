-- The legacy agent fields remain the execution authority. Suppress the
-- compatibility projection while copying rows so existing model/effort values
-- cannot be normalized or erased by the temporary sync trigger.
ALTER TABLE agent_ai_configuration
    DISABLE TRIGGER agent_ai_configuration_sync_agent;

INSERT INTO agent_ai_configuration (
    agent_id,
    workspace_id,
    runtime_id,
    ai_provider_id,
    credential_mode,
    provider_account_id,
    provider_model_id,
    effort_key
)
SELECT
    agent.id,
    agent.workspace_id,
    agent.runtime_id,
    provider.id,
    provider.credential_mode,
    NULL,
    model.id,
    CASE
        WHEN effort.provider_model_id IS NOT NULL THEN agent.thinking_level
        ELSE NULL
    END
FROM agent
JOIN agent_runtime AS runtime
  ON runtime.id = agent.runtime_id
 AND runtime.workspace_id = agent.workspace_id
JOIN ai_provider AS provider
  ON provider.provider_key = CASE
      WHEN agent.model LIKE 'cx/%' THEN '9route'
      ELSE 'openai'
  END
JOIN runtime_provider_compatibility AS compatibility
  ON compatibility.runtime_provider = runtime.provider
 AND compatibility.ai_provider_id = provider.id
 AND compatibility.enabled
JOIN provider_model AS model
  ON model.ai_provider_id = provider.id
 AND model.model_key = agent.model
 AND model.enabled
LEFT JOIN provider_model_effort AS effort
  ON effort.provider_model_id = model.id
 AND effort.effort_key = agent.thinking_level
 AND effort.enabled
WHERE agent.runtime_id IS NOT NULL
  AND agent.model IS NOT NULL
  AND agent.model <> ''
  AND provider.credential_mode = 'runtime_managed'
ON CONFLICT (agent_id) DO NOTHING;

ALTER TABLE agent_ai_configuration
    ENABLE TRIGGER agent_ai_configuration_sync_agent;
