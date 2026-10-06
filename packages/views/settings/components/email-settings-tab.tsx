"use client";

import { useEffect, useState } from "react";
import { api, type InstanceEmailSettings } from "@multica/core/api";
import { Button } from "@multica/ui/components/ui/button";
import { Input } from "@multica/ui/components/ui/input";
import { Label } from "@multica/ui/components/ui/label";
import { Switch } from "@multica/ui/components/ui/switch";
import { toast } from "sonner";
import { SettingsCard, SettingsSection, SettingsTab } from "./settings-layout";

const emptySettings: InstanceEmailSettings = {
  source: "environment",
  enabled: true,
  smtp_host: "",
  smtp_port: 587,
  smtp_tls: "starttls",
  smtp_username: "",
  smtp_from_email: "",
  smtp_ehlo_name: "",
  password_configured: false,
};

export function EmailSettingsTab() {
  const [settings, setSettings] = useState(emptySettings);
  const [password, setPassword] = useState("");
  const [testEmail, setTestEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [forbidden, setForbidden] = useState(false);

  useEffect(() => {
    api.getInstanceEmailSettings()
      .then(setSettings)
      .catch((error) => {
        if (error instanceof Error && /administrator|403|forbidden/i.test(error.message)) {
          setForbidden(true);
        } else {
          toast.error(error instanceof Error ? error.message : "Could not load email settings");
        }
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <SettingsTab title="Email"><p>Loading email settings…</p></SettingsTab>;
  if (forbidden) {
    return (
      <SettingsTab title="Email">
        <SettingsSection title="Instance email">
          <SettingsCard><p className="p-4 text-body text-muted-foreground">Only an instance administrator can view or change SMTP settings.</p></SettingsCard>
        </SettingsSection>
      </SettingsTab>
    );
  }

  const update = <K extends keyof InstanceEmailSettings>(key: K, value: InstanceEmailSettings[K]) =>
    setSettings((current) => ({ ...current, [key]: value }));

  const save = async () => {
    setSaving(true);
    try {
      const updated = await api.updateInstanceEmailSettings({
        enabled: settings.enabled,
        smtp_host: settings.smtp_host,
        smtp_port: settings.smtp_port,
        smtp_tls: settings.smtp_tls === "implicit" ? "implicit" : "starttls",
        smtp_username: settings.smtp_username,
        smtp_password: password,
        smtp_from_email: settings.smtp_from_email,
        smtp_ehlo_name: settings.smtp_ehlo_name,
      });
      setSettings(updated);
      setPassword("");
      toast.success("Email settings saved and activated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save email settings");
    } finally {
      setSaving(false);
    }
  };

  const test = async () => {
    try {
      const result = await api.testInstanceEmailSettings(testEmail);
      toast.success(result.message);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Test email failed");
    }
  };

  return (
    <SettingsTab title="Email">
      <SettingsSection title="Instance SMTP" description={`Active source: ${settings.source}`}>
        <SettingsCard>
          <div className="grid gap-4 p-5 sm:grid-cols-2">
            <div className="flex items-center justify-between sm:col-span-2"><Label htmlFor="smtp-enabled">Enabled</Label><Switch id="smtp-enabled" checked={settings.enabled} onCheckedChange={(value) => update("enabled", value)} /></div>
            <div><Label htmlFor="smtp-host">SMTP host</Label><Input id="smtp-host" value={settings.smtp_host} onChange={(e) => update("smtp_host", e.target.value)} /></div>
            <div><Label htmlFor="smtp-port">Port</Label><Input id="smtp-port" type="number" value={settings.smtp_port} onChange={(e) => update("smtp_port", Number(e.target.value))} /></div>
            <div><Label htmlFor="smtp-tls">TLS mode</Label><select id="smtp-tls" className="h-10 w-full rounded-lg border border-input bg-background px-3" value={settings.smtp_tls || "starttls"} onChange={(e) => update("smtp_tls", e.target.value as "starttls" | "implicit")}><option value="starttls">STARTTLS</option><option value="implicit">Implicit TLS / SMTPS</option></select></div>
            <div><Label htmlFor="smtp-user">Username</Label><Input id="smtp-user" value={settings.smtp_username} onChange={(e) => update("smtp_username", e.target.value)} /></div>
            <div><Label htmlFor="smtp-password">Password</Label><Input id="smtp-password" type="password" autoComplete="new-password" value={password} placeholder={settings.password_configured ? "Configured — leave blank to keep" : "Required for initial setup"} onChange={(e) => setPassword(e.target.value)} /></div>
            <div><Label htmlFor="smtp-from">From email</Label><Input id="smtp-from" type="email" value={settings.smtp_from_email} onChange={(e) => update("smtp_from_email", e.target.value)} /></div>
            <div className="sm:col-span-2"><Label htmlFor="smtp-ehlo">EHLO name</Label><Input id="smtp-ehlo" value={settings.smtp_ehlo_name} onChange={(e) => update("smtp_ehlo_name", e.target.value)} /></div>
            <div className="sm:col-span-2 flex justify-end"><Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save changes"}</Button></div>
          </div>
        </SettingsCard>
      </SettingsSection>
      <SettingsSection title="Send test email">
        <SettingsCard><div className="flex gap-3 p-5"><Input type="email" value={testEmail} placeholder="recipient@example.com" onChange={(e) => setTestEmail(e.target.value)} /><Button variant="outline" onClick={test} disabled={!testEmail}>Send test</Button></div></SettingsCard>
      </SettingsSection>
    </SettingsTab>
  );
}
