"use client";

import { useEffect, useState } from "react";
import { Button } from "@multica/ui/components/ui/button";
import { Input } from "@multica/ui/components/ui/input";
import { Label } from "@multica/ui/components/ui/label";
import { useChatStore, type UserMessageAppearance } from "@multica/core/chat";
import { useT } from "../../i18n";

const HEX_COLOR_PATTERN = /^#(?:[\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/i;
type ColorField = keyof UserMessageAppearance;

export function UserMessageAppearanceSettings() {
  const { t } = useT("settings");
  const appearance = useChatStore((state) => state.userMessageAppearance);
  const setAppearance = useChatStore((state) => state.setUserMessageAppearance);
  const resetAppearance = useChatStore((state) => state.resetUserMessageAppearance);
  const [drafts, setDrafts] = useState(() => toDrafts(appearance));
  const fields: Array<{ field: ColorField; label: string }> = [
    { field: "textColor", label: t(($) => $.chat.text_color) },
    { field: "backgroundColor", label: t(($) => $.chat.background_color) },
    { field: "borderColor", label: t(($) => $.chat.border_color) },
  ];

  useEffect(() => setDrafts(toDrafts(appearance)), [appearance]);

  const updateColor = (field: ColorField, value: string) => {
    setDrafts((current) => ({ ...current, [field]: value }));
    if (value === "" || HEX_COLOR_PATTERN.test(value)) {
      setAppearance({ ...appearance, [field]: value || null });
    }
  };

  return (
    <div className="space-y-4 border-t border-surface-border p-4">
      <div>
        <p className="text-label font-medium">{t(($) => $.chat.appearance_title)}</p>
        <p className="text-caption text-muted-foreground">
          {t(($) => $.chat.appearance_hint)}
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {fields.map(({ field, label }) => (
          <div key={field} className="space-y-1.5">
            <Label htmlFor={`user-message-${field}`}>{label}</Label>
            <Input
              id={`user-message-${field}`}
              aria-label={label}
              value={drafts[field]}
              placeholder={t(($) => $.chat.theme_default)}
              spellCheck={false}
              className="font-mono"
              onChange={(event) => updateColor(field, event.target.value)}
            />
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1 rounded-lg border border-surface-border bg-surface p-3">
          <div className="flex justify-end">
            <div
              data-testid="user-message-appearance-preview"
              className="max-w-[80%] rounded-2xl bg-muted px-3.5 py-2 text-body break-words"
              style={{
                color: appearance.textColor ?? undefined,
                backgroundColor: appearance.backgroundColor ?? undefined,
                borderColor: appearance.borderColor ?? undefined,
                borderWidth: appearance.borderColor ? 1 : undefined,
                borderStyle: appearance.borderColor ? "solid" : undefined,
              }}
            >
              {t(($) => $.chat.preview_message)}
            </div>
          </div>
        </div>
        <Button variant="outline" onClick={resetAppearance}>
          {t(($) => $.chat.restore_defaults)}
        </Button>
      </div>
    </div>
  );
}

function toDrafts(appearance: UserMessageAppearance) {
  return {
    textColor: appearance.textColor ?? "",
    backgroundColor: appearance.backgroundColor ?? "",
    borderColor: appearance.borderColor ?? "",
  };
}
