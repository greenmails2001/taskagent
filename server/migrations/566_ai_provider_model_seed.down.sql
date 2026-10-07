DELETE FROM provider_model
WHERE (ai_provider_id, model_key) IN (
    SELECT p.id, models.model_key
    FROM ai_provider p
    CROSS JOIN (VALUES
        ('openai', 'gpt-6-sol'),
        ('openai', 'gpt-5.6-sol'),
        ('openai', 'gpt-5.3-codex-xhigh'),
        ('9route', 'cx/gpt-6-sol'),
        ('9route', 'cx/gpt-5.6-sol'),
        ('9route', 'cx/gpt-5.3-codex-xhigh')
    ) AS models(provider_key, model_key)
    WHERE p.provider_key = models.provider_key
);
