import type { AgentAIConfigurationProfile } from "@multica/core/types";

export function aiConfigurationProfileKey(providerId: string, accountId: string | null) {
  return `${providerId}:${accountId ?? "runtime-managed"}`;
}

export function findAIConfigurationProfile(
  profiles: AgentAIConfigurationProfile[],
  providerId: string,
  accountId: string | null,
) {
  return profiles.find(
    (profile) =>
      profile.ai_provider_id === providerId &&
      profile.provider_account_id === accountId,
  ) ?? null;
}
