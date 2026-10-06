"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@multica/core/api";
import { useWorkspaceId } from "@multica/core/hooks";
import type { Agent, AgentRuntime } from "@multica/core/types";
import { Button } from "@multica/ui/components/ui/button";
import { Label } from "@multica/ui/components/ui/label";
import type { AgentAIConfigurationProfile } from "@multica/core/types";
import { aiConfigurationProfileKey, findAIConfigurationProfile } from "./ai-provider-model-profile";

const selectClass =
  "min-h-10 w-full rounded-lg border border-input bg-transparent px-3 text-body disabled:cursor-not-allowed disabled:opacity-50";

export function AIProviderModelField({
  agent,
  runtime,
  canEdit,
}: {
  agent: Agent;
  runtime: AgentRuntime | null;
  canEdit: boolean;
}) {
  const workspaceId = useWorkspaceId();
  const queryClient = useQueryClient();
  const configKey = ["agent-ai-configuration", agent.id] as const;
  const configQuery = useQuery({
    queryKey: configKey,
    queryFn: () => api.getAgentAIConfiguration(agent.id),
  });
  const providersQuery = useQuery({
    queryKey: ["ai-providers", workspaceId, runtime?.provider],
    queryFn: () => api.listCompatibleAIProviders(workspaceId, runtime!.provider),
    enabled: Boolean(workspaceId && runtime?.provider),
  });
  const saved = configQuery.data?.ai_configuration ?? null;
  const persistedProfiles = configQuery.data?.ai_configuration_profiles ?? [];
  const [providerId, setProviderId] = useState("");
  const [modelId, setModelId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [effortKey, setEffortKey] = useState("");
  const [saving, setSaving] = useState(false);
  const draftProfiles = useRef(new Map<string, AgentAIConfigurationProfile>());

  useEffect(() => {
    setProviderId(saved?.ai_provider_id ?? "");
    setModelId(saved?.provider_model_id ?? "");
    setAccountId(saved?.provider_account_id ?? "");
    setEffortKey(saved?.effort_key ?? "");
  }, [saved]);

  const currentProfile = (): AgentAIConfigurationProfile | null => {
    if (!providerId) return null;
    return {
      ai_provider_id: providerId,
      provider_account_id: accountId || null,
      provider_model_id: modelId,
      effort_key: effortKey || null,
    };
  };

  const snapshotCurrentProfile = () => {
    const profile = currentProfile();
    if (!profile) return;
    draftProfiles.current.set(
      aiConfigurationProfileKey(profile.ai_provider_id, profile.provider_account_id),
      profile,
    );
  };

  const loadProfile = (nextProviderId: string, nextAccountId: string | null) => {
    const key = aiConfigurationProfileKey(nextProviderId, nextAccountId);
    const profile = draftProfiles.current.get(key)
      ?? findAIConfigurationProfile(persistedProfiles, nextProviderId, nextAccountId);
    setModelId(profile?.provider_model_id ?? "");
    setEffortKey(profile?.effort_key ?? "");
  };

  const providers = providersQuery.data?.ai_providers ?? [];
  const selectedProvider = providers.find((provider) => provider.id === providerId) ?? null;
  const accountsQuery = useQuery({
    queryKey: ["ai-provider-accounts", workspaceId, providerId],
    queryFn: () => api.listAIProviderAccounts(workspaceId, providerId),
    enabled: Boolean(providerId),
  });
  const modelsQuery = useQuery({
    queryKey: ["ai-provider-models", workspaceId, providerId],
    queryFn: () => api.listAIProviderModels(workspaceId, providerId),
    enabled: Boolean(providerId),
  });
  const effortsQuery = useQuery({
    queryKey: ["ai-provider-model-efforts", workspaceId, providerId, modelId],
    queryFn: () => api.listAIProviderModelEfforts(workspaceId, providerId, modelId),
    enabled: Boolean(providerId && modelId),
  });
  const models = modelsQuery.data?.provider_models ?? [];
  const efforts = effortsQuery.data?.provider_model_efforts ?? [];
  const accounts = accountsQuery.data?.ai_provider_accounts ?? [];
  const dirty = useMemo(
    () =>
      providerId !== (saved?.ai_provider_id ?? "") ||
      modelId !== (saved?.provider_model_id ?? "") ||
      accountId !== (saved?.provider_account_id ?? "") ||
      effortKey !== (saved?.effort_key ?? ""),
    [accountId, effortKey, modelId, providerId, saved],
  );
  const accountValid =
    selectedProvider?.credential_mode !== "control_plane_managed" || Boolean(accountId);

  const save = async () => {
    if (!providerId || !modelId || !accountValid) return;
    setSaving(true);
    try {
      await api.updateAgentAIConfiguration(agent.id, {
        ai_provider_id: providerId,
        provider_model_id: modelId,
        provider_account_id: accountId || null,
        effort_key: effortKey || null,
      });
      await queryClient.invalidateQueries({ queryKey: configKey });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="agent-ai-provider">AI provider</Label>
          <select
            id="agent-ai-provider"
            className={selectClass}
            value={providerId}
            disabled={!canEdit || providersQuery.isLoading}
            onChange={(event) => {
              snapshotCurrentProfile();
              const nextProviderId = event.target.value;
              const nextProvider = providers.find((provider) => provider.id === nextProviderId);
              setProviderId(nextProviderId);
              setAccountId("");
              if (nextProvider?.credential_mode === "runtime_managed") {
                loadProfile(nextProviderId, null);
              } else {
                setModelId("");
                setEffortKey("");
              }
            }}
          >
            <option value="">Select provider</option>
            {providers.map((provider) => (
              <option key={provider.id} value={provider.id}>{provider.display_name}</option>
            ))}
          </select>
        </div>
        {selectedProvider?.credential_mode === "control_plane_managed" ? (
          <div className="space-y-1.5">
            <Label htmlFor="agent-ai-account">AI account</Label>
            <select id="agent-ai-account" className={selectClass} value={accountId} disabled={!canEdit} onChange={(event) => { snapshotCurrentProfile(); const nextAccountId = event.target.value; setAccountId(nextAccountId); loadProfile(providerId, nextAccountId || null); }}>
              <option value="">Select account</option>
              {accounts.map((account) => <option key={account.id} value={account.id}>{account.display_name}</option>)}
            </select>
          </div>
        ) : null}
        <div className="space-y-1.5">
          <Label htmlFor="agent-provider-model">Model</Label>
          <select id="agent-provider-model" className={selectClass} value={modelId} disabled={!canEdit || !providerId} onChange={(event) => { setModelId(event.target.value); setEffortKey(""); }}>
            <option value="">Select model</option>
            {models.map((model) => <option key={model.id} value={model.id}>{model.display_name} · {model.model_key}</option>)}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="agent-provider-effort">Reasoning effort</Label>
          <select id="agent-provider-effort" className={selectClass} value={effortKey} disabled={!canEdit || !modelId} onChange={(event) => setEffortKey(event.target.value)}>
            <option value="">Runtime default</option>
            {efforts.map((effort) => <option key={effort.effort_key} value={effort.effort_key}>{effort.display_name}</option>)}
          </select>
        </div>
      </div>
      {canEdit ? <Button type="button" disabled={!dirty || !providerId || !modelId || !accountValid || saving} onClick={() => void save()}>{saving ? "Saving…" : "Save AI configuration"}</Button> : null}
    </div>
  );
}
