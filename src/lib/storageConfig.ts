export type ContactStorageMode = "postgresql" | "firebase" | "indexeddb";

const VALID: ContactStorageMode[] = ["postgresql", "firebase", "indexeddb"];

/** Must match backend CONTACT_STORAGE. Default: postgresql */
export function getContactStorageMode(): ContactStorageMode {
  const raw = String(import.meta.env.VITE_CONTACT_STORAGE || "postgresql")
    .trim()
    .toLowerCase();
  if (VALID.includes(raw as ContactStorageMode)) {
    return raw as ContactStorageMode;
  }
  return "postgresql";
}

export function isIndexedDbStorage(): boolean {
  return getContactStorageMode() === "indexeddb";
}

export function isServerStorage(): boolean {
  return getContactStorageMode() !== "indexeddb";
}

export function storageLabel(mode = getContactStorageMode()): string {
  switch (mode) {
    case "indexeddb":
      return "IndexedDB";
    case "firebase":
      return "Firebase";
    default:
      return "PostgreSQL";
  }
}
