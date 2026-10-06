DROP TABLE IF EXISTS agent_ai_configuration;
ALTER TABLE agent_runtime DROP CONSTRAINT IF EXISTS agent_runtime_id_workspace_unique;
ALTER TABLE agent DROP CONSTRAINT IF EXISTS agent_id_workspace_unique;
DROP TABLE IF EXISTS provider_model_effort;
DROP TABLE IF EXISTS provider_model;
DROP TABLE IF EXISTS ai_provider_account;
DROP TABLE IF EXISTS runtime_provider_compatibility;
DROP TABLE IF EXISTS ai_provider;
