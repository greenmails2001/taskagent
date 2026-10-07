import type { ReactNode } from "react";
import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { I18nProvider } from "@multica/core/i18n/react";
import { createChatStore, registerChatStore, type ChatState } from "@multica/core/chat";
import type { StorageAdapter } from "@multica/core/types";
import enSettings from "../../locales/en/settings.json";
import { UserMessageAppearanceSettings } from "./user-message-appearance-settings";

describe("UserMessageAppearanceSettings", () => {
  let getState: () => ChatState;

  beforeEach(() => {
    const store = createChatStore({ storage: memStorage() });
    registerChatStore(store);
    getState = store.getState;
  });

  it("persists valid colors and previews the user message", () => {
    render(<UserMessageAppearanceSettings />, { wrapper: Wrapper });

    fireEvent.change(screen.getByLabelText("Text color"), {
      target: { value: "#123456" },
    });

    expect(getState().userMessageAppearance.textColor).toBe("#123456");
    expect(screen.getByTestId("user-message-appearance-preview")).toHaveStyle({
      color: "#123456",
    });
  });
});

function memStorage(): StorageAdapter {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

function Wrapper({ children }: { children: ReactNode }) {
  return (
    <I18nProvider locale="en" resources={{ en: { settings: enSettings } }}>
      {children}
    </I18nProvider>
  );
}
