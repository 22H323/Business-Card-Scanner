import { API_BASE_URL } from "@/lib/api";
import { clearAllBrowserData, clearSyncQueue } from "@/lib/indexeddb";

export type WipeResult = {
  zoho?: unknown;
  localDb?: { deleted?: number; error?: string };
  browser?: { cleared: true };
};

export async function wipeAllAppData(options?: {
  includeZoho?: boolean;
}): Promise<WipeResult> {
  const includeZoho = options?.includeZoho !== false;
  const result: WipeResult = {};

  const backendRes = await fetch(`${API_BASE_URL}/admin/wipe-all-data`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ confirm: true, include_zoho: includeZoho }),
  });
  if (!backendRes.ok) {
    let detail = `Wipe failed (${backendRes.status})`;
    try {
      const err = await backendRes.json();
      if (typeof err.detail === "string") detail = err.detail;
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }
  const backendJson = await backendRes.json();
  result.zoho = backendJson.zoho;
  result.localDb = backendJson.local_db;

  await clearAllBrowserData();
  result.browser = { cleared: true };

  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("cs-contacts-updated"));
    window.dispatchEvent(new CustomEvent("cs-queue-updated"));
  }

  return result;
}

export async function clearLocalQueueOnly(): Promise<void> {
  await clearSyncQueue();
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("cs-queue-updated"));
  }
}
