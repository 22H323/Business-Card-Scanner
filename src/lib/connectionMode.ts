export type ConnectionMode = "online" | "offline";

export function getConnectionMode(): ConnectionMode {
  if (typeof window === "undefined") return "online";
  const stored = localStorage.getItem("cs-connection-mode");
  return stored === "offline" ? "offline" : "online";
}

export function isOfflineMode(): boolean {
  return getConnectionMode() === "offline";
}
