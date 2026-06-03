export type UserSettings = {
  fullName: string;
  email: string;
  role: string;
  timezone: string;
  whatsappPhone: string;
  integrationEmail: string;
  notificationsEnabled: boolean;
  emailNotificationsEnabled: boolean;
  whatsappNotificationsEnabled: boolean;
};

const STORAGE_KEY = "cs-user-settings";

export const DEFAULT_USER_SETTINGS: UserSettings = {
  fullName: "Alex Kim",
  email: "alex@cardsync.ai",
  role: "Workspace owner",
  timezone: "GMT-7 · Pacific",
  whatsappPhone: "+1 415 555 0142",
  integrationEmail: "hello@cardsync.ai",
  notificationsEnabled: true,
  emailNotificationsEnabled: true,
  whatsappNotificationsEnabled: true,
};

export function loadUserSettings(): UserSettings {
  if (typeof window === "undefined") {
    return { ...DEFAULT_USER_SETTINGS };
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_USER_SETTINGS };
    return { ...DEFAULT_USER_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_USER_SETTINGS };
  }
}

export function saveUserSettings(settings: Partial<UserSettings>): UserSettings {
  const next = { ...loadUserSettings(), ...settings };
  if (typeof window !== "undefined") {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent("cs-settings-updated", { detail: next }));
  }
  return next;
}

export function getUserInitials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("");
}

export function getUserFirstName(fullName: string): string {
  const first = fullName.trim().split(/\s+/).filter(Boolean)[0];
  return first || DEFAULT_USER_SETTINGS.fullName.split(/\s+/)[0] || "User";
}
