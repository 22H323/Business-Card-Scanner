const configuredApiUrl = import.meta.env.VITE_API_URL;

if (!configuredApiUrl) {
  console.warn("VITE_API_URL is not set. Falling back to http://localhost:5000");
}

const defaultApiUrl = configuredApiUrl || "http://127.0.0.1:5000";

/** In dev (browser), use same origin so Vite proxies to Python (avoids CORS). */
export const API_BASE_URL =
  import.meta.env.DEV && typeof window !== "undefined"
    ? ""
    : defaultApiUrl;
