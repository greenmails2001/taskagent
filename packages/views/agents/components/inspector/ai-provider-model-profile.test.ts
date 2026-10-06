// @vitest-environment node

import { describe, expect, it } from "vitest";
import type { AgentAIConfigurationProfile } from "@multica/core/types";
import { aiConfigurationProfileKey, findAIConfigurationProfile } from "./ai-provider-model-profile";

const profiles: AgentAIConfigurationProfile[] = [
  {
    ai_provider_id: "provider-a",
    provider_account_id: null,
    provider_model_id: "model-a",
    effort_key: "high",
  },
  {
    ai_provider_id: "provider-b",
    provider_account_id: "account-b1",
    provider_model_id: "model-b1",
    effort_key: "medium",
  },
  {
    ai_provider_id: "provider-b",
    provider_account_id: "account-b2",
    provider_model_id: "model-b2",
    effort_key: null,
  },
];

describe("AI configuration master-detail profiles", () => {
  it("uses stable provider and account identifiers as the profile key", () => {
    expect(aiConfigurationProfileKey("provider-a", null)).toBe("provider-a:runtime-managed");
    expect(aiConfigurationProfileKey("provider-b", "account-b1")).toBe("provider-b:account-b1");
  });

  it("restores the saved model and effort for the selected provider/account", () => {
    expect(findAIConfigurationProfile(profiles, "provider-a", null)).toEqual(profiles[0]);
    expect(findAIConfigurationProfile(profiles, "provider-b", "account-b2")).toEqual(profiles[2]);
  });

  it("does not inherit a sibling account profile", () => {
    expect(findAIConfigurationProfile(profiles, "provider-b", "account-new")).toBeNull();
  });
});
