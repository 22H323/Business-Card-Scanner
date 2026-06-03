import { useEffect, useState } from "react";
import {
  DEFAULT_USER_SETTINGS,
  getUserFirstName,
  getUserInitials,
  loadUserSettings,
  type UserSettings,
} from "@/lib/settingsStorage";

export function useUserSettings() {
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_USER_SETTINGS);

  useEffect(() => {
    setSettings(loadUserSettings());

    const handleUpdate = (event: Event) => {
      const detail = (event as CustomEvent<UserSettings>).detail;
      setSettings(detail ? { ...DEFAULT_USER_SETTINGS, ...detail } : loadUserSettings());
    };

    window.addEventListener("cs-settings-updated", handleUpdate as EventListener);
    return () => {
      window.removeEventListener("cs-settings-updated", handleUpdate as EventListener);
    };
  }, []);

  return {
    settings,
    fullName: settings.fullName,
    email: settings.email,
    role: settings.role,
    initials: getUserInitials(settings.fullName),
    firstName: getUserFirstName(settings.fullName),
  };
}
