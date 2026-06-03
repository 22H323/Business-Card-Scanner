/** Turn FastAPI / Zoho error JSON into a single user-visible string. */
export function parseApiErrorDetail(body: unknown, fallback: string): string {
  if (!body || typeof body !== "object") {
    return fallback;
  }

  const detail = (body as { detail?: unknown }).detail;

  if (typeof detail === "string" && detail.trim()) {
    return detail;
  }

  if (Array.isArray(detail)) {
    const parts = detail
      .map((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object" && "msg" in item) {
          return String((item as { msg?: string }).msg);
        }
        return "";
      })
      .filter(Boolean);
    if (parts.length) return parts.join("; ");
  }

  const error = (body as { error?: unknown }).error;
  if (typeof error === "string" && error.trim()) {
    return error;
  }

  return fallback;
}
