/** Production Python API on Render (used when frontend is on Netlify or other hosts). */
export const PRODUCTION_API_URL = "https://business-card-scanner-1-t2ys.onrender.com";

export function normalizeApiUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}
