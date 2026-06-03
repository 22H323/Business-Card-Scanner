import { Wifi, WifiOff, Search, Moon, Sun, UserCircle2, Settings, LogOut } from "lucide-react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Input } from "@/components/ui/input";
import { useEffect, useState } from "react";
import { getQueueItems } from "@/lib/indexeddb";
import { seedOfflineSampleContact } from "@/lib/contactApi";
import { useUserSettings } from "@/hooks/useUserSettings";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useNavigate } from "@tanstack/react-router";

export function TopBar() {
  const [isOnline, setIsOnline] = useState(typeof window !== "undefined" ? navigator.onLine : true);
  const [pendingCount, setPendingCount] = useState(0);
  const [dark, setDark] = useState(false);
  const [connectionMode, setConnectionMode] = useState<"online" | "offline">("online");
  const { fullName: profileName, initials: profileInitials } = useUserSettings();
  const navigate = useNavigate();
  const updatePendingCount = async () => {
    try {
      const items = await getQueueItems();
      const unsynced = items.filter(item => item.status !== "synced");
      setPendingCount(unsynced.length);
    } catch (e) {
      console.error("[TopBar] Failed to read queue count:", e);
    }
  };

  const ensureOfflineSample = async () => {
    const result = await seedOfflineSampleContact();
    if (result.seeded) {
      window.dispatchEvent(new CustomEvent("cs-contacts-updated"));
    }
  };

  useEffect(() => {
    if (typeof window === "undefined") return;

    updatePendingCount();
    const stored = localStorage.getItem("cs-dark") === "1";
    setDark(stored);
    document.documentElement.classList.toggle("dark", stored);
    const storedMode = localStorage.getItem("cs-connection-mode");
    if (storedMode === "offline" || storedMode === "online") {
      setConnectionMode(storedMode);
      if (storedMode === "offline") {
        void ensureOfflineSample();
      }
    }

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("cs-queue-updated", updatePendingCount);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("cs-queue-updated", updatePendingCount);
    };
  }, []);

  const toggleTheme = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("cs-dark", next ? "1" : "0");
  };

  const setMode = (mode: "online" | "offline") => {
    setConnectionMode(mode);
    localStorage.setItem("cs-connection-mode", mode);
    window.dispatchEvent(new CustomEvent("cs-connection-mode-changed", { detail: mode }));
    if (mode === "offline") {
      void ensureOfflineSample();
    }
  };

  const effectiveOnline = isOnline && connectionMode !== "offline";

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border/60 bg-background/70 px-3 backdrop-blur-xl sm:h-16 sm:gap-3 sm:px-4 md:px-6">
      <SidebarTrigger
        icon="menu"
        className="-ml-1 h-9 w-9 rounded-xl border border-border/60 bg-card/60 md:hidden"
        aria-label="Open menu"
        title="Open menu"
      />

      <div className="relative hidden w-full max-w-sm flex-1 md:block">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search contacts, companies, queue items…"
          className="h-9 w-full rounded-xl border-border/60 bg-muted/40 pl-9 text-sm shadow-none focus-visible:bg-card"
        />
      </div>

      <div className="ml-auto flex items-center gap-2">
        <Button
          variant="outline"
          size="icon"
          onClick={toggleTheme}
          className="h-9 w-9 rounded-xl border-border/60 bg-card/60"
          aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
          title={dark ? "Switch to light mode" : "Switch to dark mode"}
        >
          {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>

        {pendingCount > 0 && (
          <div className="flex items-center gap-1.5 rounded-full border border-warning/30 bg-warning/10 px-2 py-1 text-xs font-medium text-warning-foreground shadow-soft">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-pulse-dot rounded-full bg-warning/60" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-warning" />
            </span>
            <span className="hidden min-[380px]:inline">{pendingCount} unsynced</span>
            <span className="min-[380px]:hidden">{pendingCount}</span>
          </div>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={`flex h-9 w-9 items-center justify-center rounded-xl border sm:hidden ${
                effectiveOnline
                  ? "border-border/60 bg-card/60"
                  : "border-warning/30 bg-warning/10 text-warning-foreground"
              }`}
              aria-label={effectiveOnline ? "Online mode" : "Offline mode"}
            >
              {effectiveOnline ? (
                <Wifi className="h-4 w-4 text-success" />
              ) : (
                <WifiOff className="h-4 w-4 text-warning" />
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44 rounded-xl">
            <DropdownMenuLabel>Connection Mode</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setMode("online")} className={connectionMode === "online" ? "font-medium" : ""}>
              <Wifi className="mr-2 h-4 w-4" />
              Online
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setMode("offline")} className={connectionMode === "offline" ? "font-medium" : ""}>
              <WifiOff className="mr-2 h-4 w-4" />
              Offline
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={`hidden items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium shadow-soft sm:flex ${
                effectiveOnline
                  ? "border-border/60 bg-card/60"
                  : "border-warning/30 bg-warning/10 text-warning-foreground dark:border-warning/40 dark:bg-warning/20 dark:text-warning-foreground"
              }`}
            >
              {effectiveOnline ? <Wifi className="h-3.5 w-3.5 text-success" /> : <WifiOff className="h-3.5 w-3.5 text-warning" />}
              <span>{effectiveOnline ? "Online" : "Offline mode"}</span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44 rounded-xl">
            <DropdownMenuLabel>Connection Mode</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setMode("online")} className={connectionMode === "online" ? "font-medium" : ""}>
              <Wifi className="mr-2 h-4 w-4" />
              Online
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setMode("offline")} className={connectionMode === "offline" ? "font-medium" : ""}>
              <WifiOff className="mr-2 h-4 w-4" />
              Offline
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-primary text-sm font-semibold text-primary-foreground shadow-glow"
              title="Profile menu"
              aria-label="Open profile menu"
            >
              {profileInitials}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48 rounded-xl">
            <DropdownMenuLabel className="flex items-center gap-2">
              <UserCircle2 className="h-4 w-4" />
              {profileName}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => navigate({ to: "/settings" })}>
              <Settings className="mr-2 h-4 w-4" />
              Account Settings
            </DropdownMenuItem>
            <DropdownMenuItem>
              <LogOut className="mr-2 h-4 w-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

