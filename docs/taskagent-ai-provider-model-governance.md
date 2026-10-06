# TaskAgent AI Provider → Model Contract

Date: 2026-10-03

## Trace

- PLAN_ID: `PLAN-TASKAGENT-AI-PROVIDER-20261003`
- PHASE_ID: `P2`
- SLICE_ID: `SLICE-TASKAGENT-PROVIDER-MODEL`
- REQ_IDS: `REQ-PROVIDER-MASTER-001`, `REQ-MODEL-DETAIL-002`, `REQ-AGENT-SELECTION-003`
- TASK_ID: `TASK-PROVIDER-MODEL-UI-001`
- BLOCK_ID: `BLOCK-AI-CONNECTION-001`

## Source of truth

`agent_ai_configuration` is the authoritative persisted relationship between an agent, its runtime, AI provider, provider account, provider-owned model, and provider-model-owned effort.

`agent.model` and `agent.thinking_level` remain compatibility projections used by the existing daemon launch path. Database triggers copy the selected `provider_model.model_key` and `effort_key` into those columns. Direct updates that would make the projection disagree with `agent_ai_configuration` are rejected.

## Required relationship

```text
agent runtime
→ runtime_provider_compatibility
→ ai_provider
→ ai_provider_account (only for control-plane-managed credentials)
→ provider_model
→ provider_model_effort
→ agent_ai_configuration
→ agent.model compatibility projection
```

Example for n9route:

```text
provider_key = 9route
display label = GPT-6 Sol
provider_model.model_key = cx/gpt-6-sol
agent.model projection = cx/gpt-6-sol
```

The OpenAI selector `gpt-6-sol` and the n9route selector `cx/gpt-6-sol` are different provider-owned records. The UI must never copy one selector into the other provider.

## Form transition rules

- Changing provider clears the unsaved account, model, and effort fields.
- Model options are loaded only from the selected provider ID.
- Effort options are loaded only from the selected provider-model ID.
- Runtime-managed providers reject a control-plane account ID.
- Control-plane-managed providers require an account belonging to the same workspace and provider.
- Saving provider/model/account/effort is one backend transaction.
- Changing runtime clears the previous `agent_ai_configuration`; the user must select a compatible provider/model for the new runtime.

## Deployment verification

After applying migrations `500` through `502` and deploying backend/web:

1. Select `9route` and `GPT-6 Sol`.
2. Verify `agent_ai_configuration.ai_provider_id` points to provider key `9route`.
3. Verify `provider_model.model_key = 'cx/gpt-6-sol'`.
4. Verify the compatibility projection `agent.model = 'cx/gpt-6-sol'`.
5. Run the agent and verify RouterAI does not resolve provider `openai`.
6. Switch provider to OpenAI and verify the previous n9route model is cleared before save.

Migration `503` backfills existing agents whose stored model selector exactly
matches a provider-owned catalog row. Selectors prefixed with `cx/` map to
`9route`; matching bare selectors map to `openai`. Unknown selectors remain
unconfigured instead of being guessed into the wrong provider.
