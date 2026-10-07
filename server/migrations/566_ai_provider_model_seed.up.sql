INSERT INTO provider_model (ai_provider_id, model_key, display_name)
SELECT provider.id, models.model_key, models.display_name
FROM ai_provider AS provider
CROSS JOIN (VALUES
    ('openai', 'gpt-6-sol', 'GPT-6 Sol'),
    ('openai', 'gpt-5.6-sol', 'GPT-5.6 Sol'),
    ('openai', 'gpt-5.3-codex-xhigh', 'GPT-5.3 Codex XHigh'),
    ('9route', 'cx/gpt-6-sol', 'GPT-6 Sol'),
    ('9route', 'cx/gpt-5.6-sol', 'GPT-5.6 Sol'),
    ('9route', 'cx/gpt-5.3-codex-xhigh', 'GPT-5.3 Codex XHigh')
) AS models(provider_key, model_key, display_name)
WHERE provider.provider_key = models.provider_key
ON CONFLICT (ai_provider_id, model_key) DO UPDATE
SET display_name = EXCLUDED.display_name,
    enabled = true,
    updated_at = now();
