import { API_BASE_URL } from "@/lib/api";
import { getConnectionMode, type ConnectionMode } from "@/lib/connectionMode";
import { PRODUCTION_API_URL } from "@/lib/productionApi";
import { storageLabel } from "@/lib/storageConfig";

export function getScanApiBaseUrl(): string {
  if (API_BASE_URL) {
    return API_BASE_URL;
  }
  return import.meta.env.DEV ? "http://127.0.0.1:5000" : PRODUCTION_API_URL;
}

/** True when OCR runs on this PC (works without internet). */
export function isLocalScanBackend(): boolean {
  try {
    const { hostname } = new URL(getScanApiBaseUrl());
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  } catch {
    return false;
  }
}

/**
 * OCR can run when online, offline with a local Python backend,
 * or via browser-side fallback if the local backend is unavailable.
 */
export function canRunScanOcr(): boolean {
  return typeof navigator === "undefined" || navigator.onLine || isLocalScanBackend();
}

export function getScanBackendLabel(): string {
  return `CardSync API — ${API_BASE_URL}`;
}

export function getLocalContactsUrl(): string {
  return `${API_BASE_URL}/contacts`;
}

export function getContactsListUrl(
  mode: ConnectionMode = getConnectionMode(),
): string {
  return mode === "offline" ? getLocalContactsUrl() : getZohoLeadsUrl();
}

export function getBackendLabel(
  mode: ConnectionMode = getConnectionMode(),
): string {
  return mode === "offline" ? storageLabel() : "Zoho CRM";
}

export function getZohoLeadsUrl(): string {
  return `${API_BASE_URL}/api/leads`;
}

export function getDeleteContactUrl(
  contactId: string,
  source: "localdb" | "zoho",
): string {
  return source === "localdb"
    ? `${API_BASE_URL}/contacts/${contactId}`
    : `${API_BASE_URL}/api/leads/${contactId}`;
}

export function getSyncContactToZohoUrl(contactId: string): string {
  return `${API_BASE_URL}/contacts/${contactId}/sync-to-zoho`;
}

export function getSyncPendingToZohoUrl(): string {
  return `${API_BASE_URL}/contacts/sync-pending-to-zoho`;
}
