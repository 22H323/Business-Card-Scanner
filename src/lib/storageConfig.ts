export type ContactStorageMode = "postgresql" | "firebase" | "indexeddb";

const VALID: ContactStorageMode[] = ["postgresql", "firebase", "indexeddb"];

/** Set after /api/storage/config (aligns Netlify build with Render CONTACT_STORAGE). */
let resolvedStorageMode: ContactStorageMode | null = null;

export function setResolvedStorageMode(mode: ContactStorageMode): void {
  if (VALID.includes(mode)) {
    resolvedStorageMode = mode;
  }
}

export function getResolvedStorageMode(): ContactStorageMode | null {
  return resolvedStorageMode;
}

/** Vite build-time default (may differ from Render until resolveStorageMode runs). */
export function getContactStorageMode(): ContactStorageMode {
  const raw = String(import.meta.env.VITE_CONTACT_STORAGE || "postgresql")
    .trim()
    .toLowerCase();
  if (VALID.includes(raw as ContactStorageMode)) {
    return raw as ContactStorageMode;
  }
  return "postgresql";
}

export function getEffectiveStorageMode(): ContactStorageMode {
  return resolvedStorageMode ?? getContactStorageMode();
}

export function isIndexedDbStorage(): boolean {
  return getEffectiveStorageMode() === "indexeddb";
}

export function isServerStorage(): boolean {
  return getEffectiveStorageMode() !== "indexeddb";
}

/** User-facing storage name (online Contacts uses clearer labels for browser storage). */
export function storageLabel(
  mode: ContactStorageMode = getEffectiveStorageMode(),
  options?: { online?: boolean },
): string {
  const online = options?.online ?? false;
  switch (mode) {
    case "indexeddb":
      return online ? "Local draft" : "IndexedDB";
    case "firebase":
      return "Firebase";
    default:
      return "PostgreSQL";
  }
}
