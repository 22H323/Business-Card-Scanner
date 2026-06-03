import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Mail, MessageCircle, Moon, Bell, Shield, User, Loader2, Trash2 } from "lucide-react";
import { clearLocalQueueOnly, wipeAllAppData } from "@/lib/wipeAllData";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { PageShell } from "@/components/page-shell";
import { toast } from "sonner";
import { API_BASE_URL } from "@/lib/api";
import {
  DEFAULT_USER_SETTINGS,
  getUserInitials,
  loadUserSettings,
  saveUserSettings,
  type UserSettings,
} from "@/lib/settingsStorage";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings · CardSync AI" },
      { name: "description", content: "Profile, integrations, notification and appearance preferences." },
      { property: "og:title", content: "Settings · CardSync AI" },
      { property: "og:description", content: "Manage your CardSync workspace preferences." },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const [profile, setProfile] = useState<UserSettings>(DEFAULT_USER_SETTINGS);
  const [dark, setDark] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [isWhatsappConnected, setIsWhatsappConnected] = useState(false);
  const [isTestingWhatsapp, setIsTestingWhatsapp] = useState(false);
  const [isMailConnected, setIsMailConnected] = useState(false);
  const [isTestingMail, setIsTestingMail] = useState(false);
  const [isWiping, setIsWiping] = useState(false);
  const [isClearingQueue, setIsClearingQueue] = useState(false);

  const initials = useMemo(() => getUserInitials(profile.fullName), [profile.fullName]);

  useEffect(() => {
    setProfile(loadUserSettings());

    const stored = localStorage.getItem("cs-dark") === "1";
    setDark(stored);
    document.documentElement.classList.toggle("dark", stored);

    setIsWhatsappConnected(localStorage.getItem("wa-connected") === "1");
    setIsMailConnected(localStorage.getItem("mail-connected") === "1");
  }, []);

  const updateProfileField = <K extends keyof UserSettings>(key: K, value: UserSettings[K]) => {
    setProfile((prev) => ({ ...prev, [key]: value }));
  };

  const toggleDark = (v: boolean) => {
    setDark(v);
    document.documentElement.classList.toggle("dark", v);
    localStorage.setItem("cs-dark", v ? "1" : "0");
  };

  const handleSaveProfile = () => {
    setIsSaving(true);
    try {
      saveUserSettings(profile);
      toast.success("Profile saved to this device.");
    } catch {
      toast.error("Failed to save profile.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleClearQueue = async () => {
    if (!window.confirm("Clear the offline sync queue on this device? Contacts already saved elsewhere are not removed.")) {
      return;
    }
    setIsClearingQueue(true);
    try {
      await clearLocalQueueOnly();
      toast.success("Offline queue cleared on this device.");
    } catch {
      toast.error("Failed to clear queue.");
    } finally {
      setIsClearingQueue(false);
    }
  };

  const handleWipeAll = async () => {
    const ok = window.confirm(
      "Delete ALL contacts from local PostgreSQL, Zoho CRM, and this browser?\n\nThis cannot be undone.",
    );
    if (!ok) return;
    setIsWiping(true);
    try {
      const result = await wipeAllAppData({ includeZoho: true });
      const localCount = result.localDb?.deleted ?? 0;
      const zohoCount = (result.zoho as { deleted?: number } | undefined)?.deleted ?? 0;
      const localErr = result.localDb?.error;
      if (localErr) {
        toast.warning(
          `Wiped Zoho (${zohoCount}), browser. Local DB: ${localErr}`,
        );
      } else {
        toast.success(
          `All data wiped. Zoho: ${zohoCount}, local DB: ${localCount}. Browser cache cleared.`,
        );
      }
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : import.meta.env.DEV
            ? "Wipe failed. Is the Python API running? (npm run server, port 5000)"
            : "Wipe failed. Is the Python API running? (npm run backend)",
      );
    } finally {
      setIsWiping(false);
    }
  };

  const toggleWhatsapp = () => {
    const newState = !isWhatsappConnected;
    setIsWhatsappConnected(newState);
    localStorage.setItem("wa-connected", newState ? "1" : "0");
    toast[newState ? "success" : "info"](
      newState ? "WhatsApp Business connected." : "WhatsApp Business disconnected.",
    );
  };

  const testWhatsapp = async () => {
    if (!isWhatsappConnected) return;
    setIsTestingWhatsapp(true);
    try {
      const res = await fetch(`${API_BASE_URL}/integrations/whatsapp/queue`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contact_phone: profile.whatsappPhone || "+15550199",
          message: "Test message from CardSync AI settings",
        }),
      });
      if (res.ok) {
        toast.success("Test message enqueued!");
      } else {
        toast.error("Failed to enqueue message.");
      }
    } catch {
      toast.error("Network error while enqueueing message.");
    } finally {
      setIsTestingWhatsapp(false);
    }
  };

  const toggleMail = () => {
    const newState = !isMailConnected;
    setIsMailConnected(newState);
    localStorage.setItem("mail-connected", newState ? "1" : "0");
    toast[newState ? "success" : "info"](
      newState ? "Email connected." : "Email disconnected.",
    );
  };

  const testMail = async () => {
    if (!isMailConnected) return;
    const to = (profile.integrationEmail || profile.email || "").trim();
    if (!to) {
      toast.error("Set an integration or profile email in Settings first.");
      return;
    }
    setIsTestingMail(true);
    try {
      const res = await fetch(`${API_BASE_URL}/integrations/email/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contact_email: to,
          test_override: to,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok && body.success) {
        toast.success(`Test email sent to ${to} via Gmail SMTP.`);
      } else {
        const detail =
          typeof body.detail === "string"
            ? body.detail
            : body.result?.error || "SMTP send failed. Check GMAIL_USER and GMAIL_APP_PASSWORD in .env.";
        toast.error(detail);
      }
    } catch {
      toast.error("Cannot reach the API. Is npm run backend running on port 5000?");
    } finally {
      setIsTestingMail(false);
    }
  };

  const toggleNotifications = (enabled: boolean) => {
    updateProfileField("notificationsEnabled", enabled);
    saveUserSettings({ notificationsEnabled: enabled });
    toast.success(enabled ? "Notifications enabled." : "Notifications disabled.");
  };

  const toggleEmailNotifications = (enabled: boolean) => {
    updateProfileField("emailNotificationsEnabled", enabled);
    saveUserSettings({ emailNotificationsEnabled: enabled });
    toast.success(enabled ? "Email notifications enabled." : "Email notifications disabled.");
  };

  const toggleWhatsappNotifications = (enabled: boolean) => {
    updateProfileField("whatsappNotificationsEnabled", enabled);
    saveUserSettings({ whatsappNotificationsEnabled: enabled });
    toast.success(enabled ? "WhatsApp notifications enabled." : "WhatsApp notifications disabled.");
  };

  return (
    <PageShell title="Settings" description="Personalise your workspace and connect your follow-up channels.">
      <div className="grid gap-5 lg:grid-cols-2">
        {/* Profile */}
        <Card className="rounded-2xl border-border/60 p-6 shadow-soft lg:col-span-2">
          <div className="flex items-center gap-2 text-sm font-medium">
            <User className="h-4 w-4 text-primary" /> Profile
          </div>
          <div className="mt-5 flex flex-col gap-5 sm:flex-row sm:items-start">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-primary text-lg font-semibold text-primary-foreground shadow-glow">
              {initials}
            </div>
            <div className="grid flex-1 grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label className="text-xs text-muted-foreground">Full name</Label>
                <Input
                  value={profile.fullName}
                  onChange={(e) => updateProfileField("fullName", e.target.value)}
                  className="mt-1.5 h-10 rounded-xl"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Email</Label>
                <Input
                  value={profile.email}
                  onChange={(e) => updateProfileField("email", e.target.value)}
                  className="mt-1.5 h-10 rounded-xl"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Role</Label>
                <Input
                  value={profile.role}
                  onChange={(e) => updateProfileField("role", e.target.value)}
                  className="mt-1.5 h-10 rounded-xl"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Timezone</Label>
                <Input
                  value={profile.timezone}
                  onChange={(e) => updateProfileField("timezone", e.target.value)}
                  className="mt-1.5 h-10 rounded-xl"
                />
              </div>
            </div>
          </div>
          <div className="mt-5 flex justify-end">
            <Button onClick={handleSaveProfile} disabled={isSaving} className="rounded-xl bg-gradient-primary shadow-glow">
              {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {isSaving ? "Saving..." : "Save changes"}
            </Button>
          </div>
        </Card>

        {/* Appearance */}
        <Card className="rounded-2xl border-border/60 p-6 shadow-soft h-full flex flex-col">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Moon className="h-4 w-4 text-primary" /> Appearance
          </div>
          <div className="mt-5 flex items-center justify-between rounded-xl border border-border/60 bg-muted/30 p-4">
            <div>
              <div className="text-sm font-medium">Dark mode</div>
              <div className="text-[11px] text-muted-foreground">Use a darker palette across the app</div>
            </div>
            <Switch checked={dark} onCheckedChange={toggleDark} />
          </div>
        </Card>

        {/* Notifications */}
        <Card className="rounded-2xl border-border/60 p-6 shadow-soft h-full flex flex-col">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Bell className="h-4 w-4 text-primary" /> Notifications
          </div>
          <div className="mt-5 space-y-3">
            <div className="flex items-center justify-between rounded-xl border border-border/60 bg-muted/30 p-4">
              <div>
                <div className="text-sm font-medium">Sync alerts</div>
                <div className="text-[11px] text-muted-foreground">Show toasts when contacts sync or fail</div>
              </div>
              <Switch
                checked={profile.notificationsEnabled}
                onCheckedChange={toggleNotifications}
              />
            </div>
            <div className="flex items-center justify-between rounded-xl border border-border/60 bg-muted/30 p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Mail className="h-4 w-4" />
                </div>
                <div>
                  <div className="text-sm font-medium">Email notifications</div>
                  <div className="text-[11px] text-muted-foreground">Follow-up emails after saving a contact</div>
                </div>
              </div>
              <Switch
                checked={profile.emailNotificationsEnabled}
                onCheckedChange={toggleEmailNotifications}
              />
            </div>
            <div className="flex items-center justify-between rounded-xl border border-border/60 bg-muted/30 p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-success/10 text-success">
                  <MessageCircle className="h-4 w-4" />
                </div>
                <div>
                  <div className="text-sm font-medium">WhatsApp notifications</div>
                  <div className="text-[11px] text-muted-foreground">Thank-you messages via WhatsApp Business</div>
                </div>
              </div>
              <Switch
                checked={profile.whatsappNotificationsEnabled}
                onCheckedChange={toggleWhatsappNotifications}
              />
            </div>
          </div>
        </Card>

        {/* Integrations */}
        <Card className="rounded-2xl border-border/60 p-6 shadow-soft h-full flex flex-col lg:col-span-2">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Shield className="h-4 w-4 text-primary" /> Integrations
          </div>
          <div className="mt-5 space-y-3">
            <div className="flex flex-col gap-3 rounded-xl border border-border/60 bg-card p-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${isWhatsappConnected ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"}`}>
                    <MessageCircle className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="text-sm font-medium">WhatsApp Business</div>
                    <Input
                      value={profile.whatsappPhone}
                      onChange={(e) => updateProfileField("whatsappPhone", e.target.value)}
                      className="mt-1 h-8 w-full max-w-[220px] rounded-lg text-[11px]"
                      placeholder="+1 415 555 0142"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {isWhatsappConnected && (
                    <Button variant="outline" size="sm" onClick={testWhatsapp} disabled={isTestingWhatsapp} className="h-7 text-xs">
                      {isTestingWhatsapp ? <Loader2 className="mr-1.5 h-3 w-3 animate-spin" /> : null}
                      Test
                    </Button>
                  )}
                  <Button variant={isWhatsappConnected ? "outline" : "default"} size="sm" onClick={toggleWhatsapp} className={`h-7 text-xs ${!isWhatsappConnected && "bg-gradient-primary shadow-glow"}`}>
                    {isWhatsappConnected ? "Disconnect" : "Connect"}
                  </Button>
                </div>
              </div>
            </div>
            <div className="flex flex-col gap-3 rounded-xl border border-border/60 bg-card p-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${isMailConnected ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                    <Mail className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="text-sm font-medium">Email · Postmark</div>
                    <Input
                      value={profile.integrationEmail}
                      onChange={(e) => updateProfileField("integrationEmail", e.target.value)}
                      className="mt-1 h-8 w-full max-w-[220px] rounded-lg text-[11px]"
                      placeholder="hello@cardsync.ai"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {isMailConnected && (
                    <Button variant="outline" size="sm" onClick={testMail} disabled={isTestingMail} className="h-7 text-xs">
                      {isTestingMail ? <Loader2 className="mr-1.5 h-3 w-3 animate-spin" /> : null}
                      Test
                    </Button>
                  )}
                  <Button variant={isMailConnected ? "outline" : "default"} size="sm" onClick={toggleMail} className={`h-7 text-xs ${!isMailConnected && "bg-gradient-primary shadow-glow"}`}>
                    {isMailConnected ? "Disconnect" : "Connect"}
                  </Button>
                </div>
              </div>
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <Button
              variant="outline"
              onClick={() => {
                saveUserSettings(profile);
                toast.success("Integration details saved.");
              }}
              className="rounded-xl"
            >
              Save integration details
            </Button>
          </div>
        </Card>

        {/* Danger zone */}
        <Card className="rounded-2xl border-destructive/20 bg-destructive/5 p-6 shadow-soft lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-medium text-destructive">Danger zone</div>
              <div className="text-xs text-muted-foreground">Irreversible actions affecting the entire workspace.</div>
            </div>
            <div className="flex flex-col w-full sm:w-auto sm:flex-row gap-2 mt-4 sm:mt-0">
              <Button
                variant="outline"
                className="w-full sm:w-auto rounded-xl"
                onClick={handleClearQueue}
                disabled={isClearingQueue || isWiping}
              >
                {isClearingQueue ? <Loader2 className="mr-1.5 h-3 w-3 animate-spin" /> : null}
                Clear local queue
              </Button>
              <Button
                variant="destructive"
                className="w-full sm:w-auto rounded-xl"
                onClick={handleWipeAll}
                disabled={isWiping || isClearingQueue}
              >
                {isWiping ? <Loader2 className="mr-1.5 h-3 w-3 animate-spin" /> : <Trash2 className="mr-1.5 h-3 w-3" />}
                Delete all data
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </PageShell>
  );
}
