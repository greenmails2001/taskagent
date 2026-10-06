-- name: ListCompatibleAIProviders :many
SELECT p.*, c.transport
FROM ai_provider p
JOIN runtime_provider_compatibility c ON c.ai_provider_id = p.id
WHERE c.runtime_provider = $1
  AND c.enabled = true
  AND p.enabled = true
ORDER BY p.display_name;

-- name: ListAIProviderAccounts :many
SELECT a.*
FROM ai_provider_account a
JOIN ai_provider p ON p.id = a.ai_provider_id
WHERE a.workspace_id = $1
  AND a.ai_provider_id = $2
  AND p.credential_mode = 'control_plane_managed'
  AND (a.owner_user_id IS NULL OR a.owner_user_id = $3)
ORDER BY a.display_name;

-- name: GetAIProviderCredentialMode :one
SELECT credential_mode
FROM ai_provider
WHERE id = $1 AND enabled = true;

-- name: ListProviderModels :many
SELECT * FROM provider_model
WHERE ai_provider_id = $1 AND enabled = true
ORDER BY display_name;

-- name: ListProviderModelEfforts :many
SELECT * FROM provider_model_effort
WHERE provider_model_id = $1 AND enabled = true
ORDER BY sort_order, display_name;

-- name: GetAgentAIConfiguration :one
SELECT * FROM agent_ai_configuration WHERE agent_id = $1;
