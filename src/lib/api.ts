const configuredApiUrl = import.meta.env.VITE_API_URL?.trim();

function resolveDefaultApiUrl(): string {
  if (configuredApiUrl) {
    return configuredApiUrl;
  }
  // Production: API and static app share one host (npm run backend after build).
  if (!import.meta.env.DEV && typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }
  // Local dev default (port 5000 — see npm run server).
  if (import.meta.env.DEV) {
    return "http://127.0.0.1:5000";
  }
  return "";
}

if (!configuredApiUrl && import.meta.env.DEV) {
  console.warn("VITE_API_URL is not set. Local dev uses port 5000 (npm run server).");
}

/** In dev (browser), use same origin so Vite proxies to Python on :5000 (avoids CORS). */
export const API_BASE_URL =
  import.meta.env.DEV && typeof window !== "undefined"
    ? ""
    : resolveDefaultApiUrl();
