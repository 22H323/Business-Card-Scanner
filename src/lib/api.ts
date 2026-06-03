import { normalizeApiUrl, PRODUCTION_API_URL } from "@/lib/productionApi";

const configuredApiUrl = import.meta.env.VITE_API_URL
  ? normalizeApiUrl(import.meta.env.VITE_API_URL)
  : "";

function resolveDefaultApiUrl(): string {
  if (configuredApiUrl) {
    return configuredApiUrl;
  }
  if (!import.meta.env.DEV) {
    // Netlify / static host: API is on Render, not the page origin.
    if (typeof window !== "undefined") {
      const host = window.location.hostname;
      if (host.includes("onrender.com")) {
        return normalizeApiUrl(window.location.origin);
      }
    }
    return PRODUCTION_API_URL;
  }
  return "http://127.0.0.1:5000";
}

if (!configuredApiUrl && import.meta.env.DEV) {
  console.warn("VITE_API_URL is not set. Local dev uses port 5000 (npm run server).");
}

/** In dev (browser), use same origin so Vite proxies to Python on :5000 (avoids CORS). */
export const API_BASE_URL =
  import.meta.env.DEV && typeof window !== "undefined"
    ? ""
    : resolveDefaultApiUrl();
