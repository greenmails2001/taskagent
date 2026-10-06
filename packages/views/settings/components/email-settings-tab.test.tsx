import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithI18n } from "../../test/i18n";

const apiMock = vi.hoisted(() => ({
  getInstanceEmailSettings: vi.fn(),
  updateInstanceEmailSettings: vi.fn(),
  testInstanceEmailSettings: vi.fn(),
}));

vi.mock("@multica/core/api", () => ({ api: apiMock }));

import { EmailSettingsTab } from "./email-settings-tab";

const settings = {
  source: "database" as const,
  enabled: true,
  smtp_host: "mail.example.com",
  smtp_port: 587,
  smtp_tls: "starttls" as const,
  smtp_username: "mailer@example.com",
  smtp_from_email: "mailer@example.com",
  smtp_ehlo_name: "taskagent.example.com",
  password_configured: true,
};

beforeEach(() => {
  apiMock.getInstanceEmailSettings.mockReset();
  apiMock.updateInstanceEmailSettings.mockReset();
  apiMock.testInstanceEmailSettings.mockReset();
});

describe("EmailSettingsTab", () => {
  it("never populates the stored password and preserves it with a blank update", async () => {
    apiMock.getInstanceEmailSettings.mockResolvedValue(settings);
    apiMock.updateInstanceEmailSettings.mockResolvedValue(settings);
    renderWithI18n(<EmailSettingsTab />);

    const password = await screen.findByLabelText("Password");
    expect(password).toHaveValue("");
    expect(password).toHaveAttribute("placeholder", "Configured — leave blank to keep");

    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(apiMock.updateInstanceEmailSettings).toHaveBeenCalledWith(
      expect.objectContaining({ smtp_password: "" }),
    ));
  });

  it("shows the instance-admin boundary when the API returns forbidden", async () => {
    apiMock.getInstanceEmailSettings.mockRejectedValue(new Error("403 forbidden"));
    renderWithI18n(<EmailSettingsTab />);
    expect(await screen.findByText(/Only an instance administrator/)).toBeInTheDocument();
  });

  it("requires a recipient before sending a test message", async () => {
    apiMock.getInstanceEmailSettings.mockResolvedValue(settings);
    renderWithI18n(<EmailSettingsTab />);
    expect(await screen.findByRole("button", { name: "Send test" })).toBeDisabled();
  });
});
