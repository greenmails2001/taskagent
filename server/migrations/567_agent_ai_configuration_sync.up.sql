CREATE OR REPLACE FUNCTION sync_agent_from_ai_configuration()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    selected_model_key TEXT;
BEGIN
    SELECT model_key INTO selected_model_key
    FROM provider_model
    WHERE id = NEW.provider_model_id
      AND ai_provider_id = NEW.ai_provider_id;

    IF selected_model_key IS NULL THEN
        RAISE EXCEPTION 'provider model does not belong to selected AI provider';
    END IF;

    UPDATE agent
    SET model = selected_model_key,
        thinking_level = COALESCE(NEW.effort_key, ''),
        updated_at = now()
    WHERE id = NEW.agent_id;

    RETURN NEW;
END;
$$;

CREATE TRIGGER agent_ai_configuration_sync_agent
AFTER INSERT OR UPDATE OF ai_provider_id, provider_model_id, effort_key
ON agent_ai_configuration
FOR EACH ROW
EXECUTE FUNCTION sync_agent_from_ai_configuration();

CREATE OR REPLACE FUNCTION guard_agent_ai_configuration_projection()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    configured_model_key TEXT;
    configured_effort_key TEXT;
BEGIN
    IF NEW.runtime_id IS DISTINCT FROM OLD.runtime_id THEN
        RETURN NEW;
    END IF;

    SELECT m.model_key, COALESCE(c.effort_key, '')
    INTO configured_model_key, configured_effort_key
    FROM agent_ai_configuration c
    JOIN provider_model m ON m.id = c.provider_model_id
    WHERE c.agent_id = NEW.id;

    IF FOUND AND (
        NEW.model IS DISTINCT FROM configured_model_key
        OR COALESCE(NEW.thinking_level, '') IS DISTINCT FROM configured_effort_key
    ) THEN
        RAISE EXCEPTION 'agent model and effort are managed by agent_ai_configuration';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER agent_ai_configuration_guard_projection
BEFORE UPDATE OF model, thinking_level, runtime_id
ON agent
FOR EACH ROW
EXECUTE FUNCTION guard_agent_ai_configuration_projection();

CREATE OR REPLACE FUNCTION clear_agent_ai_configuration_on_runtime_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.runtime_id IS DISTINCT FROM OLD.runtime_id THEN
        DELETE FROM agent_ai_configuration WHERE agent_id = NEW.id;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER agent_ai_configuration_clear_on_runtime_change
AFTER UPDATE OF runtime_id
ON agent
FOR EACH ROW
EXECUTE FUNCTION clear_agent_ai_configuration_on_runtime_change();
