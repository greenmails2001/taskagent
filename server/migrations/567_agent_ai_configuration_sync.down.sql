DROP TRIGGER IF EXISTS agent_ai_configuration_clear_on_runtime_change ON agent;
DROP FUNCTION IF EXISTS clear_agent_ai_configuration_on_runtime_change();
DROP TRIGGER IF EXISTS agent_ai_configuration_guard_projection ON agent;
DROP FUNCTION IF EXISTS guard_agent_ai_configuration_projection();
DROP TRIGGER IF EXISTS agent_ai_configuration_sync_agent ON agent_ai_configuration;
DROP FUNCTION IF EXISTS sync_agent_from_ai_configuration();
