-- Runtime-local provider configuration and optional agent overrides are the
-- execution authority. Preserve all legacy catalog/configuration rows, but
-- stop projecting those rows into agent.model and agent.thinking_level.
DROP TRIGGER IF EXISTS agent_ai_configuration_sync_agent ON agent_ai_configuration;
DROP TRIGGER IF EXISTS agent_ai_configuration_guard_projection ON agent;
DROP TRIGGER IF EXISTS agent_ai_configuration_clear_on_runtime_change ON agent;

DROP FUNCTION IF EXISTS sync_agent_from_ai_configuration();
DROP FUNCTION IF EXISTS guard_agent_ai_configuration_projection();
DROP FUNCTION IF EXISTS clear_agent_ai_configuration_on_runtime_change();

COMMENT ON TABLE agent_ai_configuration IS
    'Deprecated compatibility data. Runtime config plus optional agent.model/thinking_level overrides are authoritative; this table no longer projects into agent execution fields.';

COMMENT ON TABLE agent_ai_configuration_profile IS
    'Deprecated compatibility profiles retained without data loss; not an execution/default authority.';
