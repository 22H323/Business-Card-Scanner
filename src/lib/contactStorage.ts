import type { LeadPayload } from "@/lib/cardImage";
import { API_BASE_URL } from "@/lib/api";
import { isOfflineMode } from "@/lib/connectionMode";
import {
  getContactStorageMode,
  isIndexedDbStorage,
  isServerStorage,
  setResolvedStorageMode,
  storageLabel,
  type ContactStorageMode,
} from "@/lib/storageConfig";
import {
  addToQueue,
  deleteStoredContact,
  getQueueItems,
  getStoredContactById,
  listStoredContacts,
  patchStoredContactSyncStatus,
  removeQueueItem,
  saveStoredContact,
  updateQueueItem,
  updateStoredContact,
  type QueueItem,
} from "@/lib/indexeddb";
import {
  checkLocalDbHealth,
  deleteLocalContact,
  getLocalContactById,
  listLocalContacts,
  localContactToPayload,
  markLocalContactSyncedZoho,
  queueContactToPayload,
  saveContactToLocalDb,
  syncLocalContactToZoho,
  syncAllLocalPendingToZoho,
  syncQueueItemToLocalDb,
  updateContactInLocalDb,
  type LocalContact,
} from "@/lib/localContactApi";
import { syncPayloadToZoho } from "@/lib/contactApi";

export type StoredContact = LocalContact;

export {
  getContactStorageMode,
  isIndexedDbStorage,
  isServerStorage,
  storageLabel,
  type ContactStorageMode,
};

export { queueContactToPayload, localContactToPayload, syncQueueItemToLocalDb };

/** True when the configured storage backend is reachable. IndexedDB is always available in-browser. */
/** Load storage mode from Render so production matches CONTACT_STORAGE even if Vite env differs. */
export async function resolveStorageMode(): Promise<ContactStorageMode> {
  const viteMode = getContactStorageMode();
  if (viteMode === "indexeddb") {
    setResolvedStorageMode("indexeddb");
    return "indexeddb";
  }
  try {
    const cfg = await fetchStorageConfig();
    setResolvedStorageMode(cfg.storage);
    return cfg.storage;
  } catch {
    setResolvedStorageMode(viteMode);
    return viteMode;
  }
}

export async function checkStorageHealth(): Promise<boolean> {
  await resolveStorageMode();
  if (isIndexedDbStorage()) {
    return true;
  }
  return checkLocalDbHealth();
}

export async function listContacts(): Promise<StoredContact[]> {
  await resolveStorageMode();
  if (isIndexedDbStorage()) {
    return listStoredContacts() as Promise<StoredContact[]>;
  }
  const up = await checkStorageHealth();
  if (!up) {
    const { getCachedContacts } = await import("@/lib/indexeddb");
    return getCachedContacts() as Promise<StoredContact[]>;
  }
  return listLocalContacts();
}

export async function getContactById(contactId: string): Promise<StoredContact | null> {
  if (isIndexedDbStorage()) {
    const contact = await getStoredContactById(contactId);
    return contact as StoredContact | null;
  }
  try {
    return await getLocalContactById(contactId);
  } catch {
    return null;
  }
}

function isOfflineSave(options?: { connectionMode?: "online" | "offline" }): boolean {
  // No network → always queue for Zoho (even if top bar says Online).
  if (typeof navigator !== "undefined" && !navigator.onLine) return true;
  if (options?.connectionMode === "offline") return true;
  if (options?.connectionMode === "online") return false;
  return isOfflineMode();
}

/** Push one browser queue row to Zoho, then store locally as synced and remove from queue. */
export async function syncQueueItemToZoho(item: QueueItem): Promise<{ zohoLeadId?: string }> {
  if (!navigator.onLine) {
    throw new Error("No internet. Connect to sync to Zoho CRM.");
  }
  const payload = queueContactToPayload(item.contact_data);
  const result = await syncPayloadToZoho(payload, { connectionMode: "online" });
  const zohoLeadId = result.zohoLeadId;
  await saveStoredContact(
    {
      ...(item.contact_data as Record<string, unknown>),
      syncStatus: "synced_zoho",
      zohoLeadId: zohoLeadId ?? null,
    },
    item.image_base64,
  );
  await removeQueueItem(item.id);
  return { zohoLeadId };
}

export async function syncAllQueueItemsToZoho(): Promise<{ synced: number; total: number }> {
  const items = await getQueueItems();
  const pending = items.filter((i) => i.status === "pending" || i.status === "retrying");
  let synced = 0;
  for (const item of pending) {
    try {
      await updateQueueItem({
        ...item,
        status: "retrying",
        last_attempt: new Date().toISOString(),
      });
      await syncQueueItemToZoho(item);
      synced += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Zoho sync failed";
      const nextRetry = item.retry_count + 1;
      await updateQueueItem({
        ...item,
        status: nextRetry >= 5 ? "failed" : "pending",
        retry_count: nextRetry,
        last_attempt: new Date().toISOString(),
        error_message: message,
      });
    }
  }
  return { synced, total: pending.length };
}

export async function saveContact(
  payload: LeadPayload,
  cardImageBase64?: string,
  options?: {
    connectionMode?: "online" | "offline";
    skipWhatsApp?: boolean;
    skipEmail?: boolean;
  },
): Promise<{
  id: string;
  queued?: boolean;
  zohoLeadId?: string;
  zohoSynced?: boolean;
  alreadySynced?: boolean;
  zohoError?: string;
}> {
  await resolveStorageMode();
  // Offline mode (or no network): browser queue only — sync to Zoho when back online.
  if (isIndexedDbStorage() && isOfflineSave(options)) {
    const queueId = crypto.randomUUID();
    await addToQueue(
      buildQueueItemFromPayload(
        payload,
        cardImageBase64,
        "Saved offline — will sync to Zoho when online",
      ),
    );
    return { id: queueId, queued: true };
  }

  if (isIndexedDbStorage()) {
    const saved = await saveStoredContact(payload as Record<string, unknown>, cardImageBase64);
    return { id: saved.id };
  }

  const up = await checkStorageHealth();
  if (up) {
    const saved = await saveContactToLocalDb(payload, cardImageBase64, options);
    return {
      id: saved.id,
      zohoLeadId: saved.zohoLeadId,
      zohoSynced: saved.zohoSynced,
      alreadySynced: saved.alreadySynced,
      zohoError: saved.zohoError,
    };
  }

  const queueId = crypto.randomUUID();
  await addToQueue({
    id: queueId,
    contact_data: payload as Record<string, unknown>,
    image_base64: cardImageBase64,
    status: "pending",
    retry_count: 0,
    created_at: new Date().toISOString(),
    last_attempt: new Date().toISOString(),
    error_message: `${storageLabel()} unavailable — start npm run server`,
  });
  return { id: queueId, queued: true };
}

export async function updateContact(contactId: string, payload: LeadPayload): Promise<void> {
  if (isIndexedDbStorage()) {
    await updateStoredContact(contactId, payload as Record<string, unknown>);
    return;
  }
  await updateContactInLocalDb(contactId, payload);
}

export async function deleteContact(contactId: string, deleteZoho = false): Promise<void> {
  if (isIndexedDbStorage()) {
    await deleteStoredContact(contactId);
    return;
  }
  await deleteLocalContact(contactId, deleteZoho);
}

export async function markContactSyncedZoho(contactId: string, zohoLeadId: string): Promise<void> {
  if (isIndexedDbStorage()) {
    await patchStoredContactSyncStatus(contactId, "synced_zoho", zohoLeadId);
    return;
  }
  await markLocalContactSyncedZoho(contactId, zohoLeadId);
}

export async function syncContactToZohoStorage(
  contactId: string,
  options?: { skipWhatsApp?: boolean; skipEmail?: boolean },
): Promise<{ zohoLeadId?: string; alreadySynced?: boolean }> {
  if (isIndexedDbStorage()) {
    const contact = await getStoredContactById(contactId);
    if (!contact) {
      throw new Error("Contact not found in IndexedDB");
    }
    if (contact.zohoLeadId || contact.syncStatus === "synced_zoho") {
      return {
        zohoLeadId: String(contact.zohoLeadId || ""),
        alreadySynced: true,
      };
    }
    const payload = localContactToPayload(contact as StoredContact);
    const result = await syncPayloadToZoho(
      {
        ...payload,
        zohoLeadId: contact.zohoLeadId as string | null | undefined,
      },
      options,
    );
    if (result.zohoLeadId) {
      await markContactSyncedZoho(contactId, result.zohoLeadId);
    }
    return result;
  }
  return syncLocalContactToZoho(contactId, options);
}

export async function syncAllPendingToZohoStorage(): Promise<{ synced: number; total: number }> {
  if (isIndexedDbStorage()) {
    const contacts = await listStoredContacts();
    const pending = contacts.filter(
      (c) => c.syncStatus !== "synced_zoho" && !c.zohoLeadId,
    );
    let synced = 0;
    for (const contact of pending) {
      const id = String(contact.id || "");
      if (!id) continue;
      try {
        const result = await syncContactToZohoStorage(id);
        if (result.zohoLeadId || result.alreadySynced) {
          synced += 1;
        }
      } catch {
        // continue with remaining contacts
      }
    }
    return { synced, total: pending.length };
  }
  return syncAllLocalPendingToZoho();
}

export function isContactPendingZoho(contact: StoredContact): boolean {
  return contact.syncStatus !== "synced_zoho" && !contact.zohoLeadId;
}

export async function fetchStorageConfig(): Promise<{
  storage: ContactStorageMode;
  database: { ok?: boolean; storage?: string; error?: string };
}> {
  const res = await fetch(`${API_BASE_URL}/api/storage/config`, {
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) {
    throw new Error(`Storage config unavailable (${res.status})`);
  }
  return res.json();
}

/** Browser queue → PostgreSQL when using server DB. */
export function shouldUseOfflineQueue(): boolean {
  return isServerStorage();
}

/** Browser queue → Zoho when using IndexedDB storage. */
export function shouldUseIndexedDbQueueSync(): boolean {
  return isIndexedDbStorage();
}

export function buildQueueItemFromPayload(
  payload: LeadPayload,
  imageBase64?: string,
  errorMessage?: string,
): QueueItem {
  return {
    id: crypto.randomUUID(),
    contact_data: payload as Record<string, unknown>,
    image_base64: imageBase64,
    status: "pending",
    retry_count: 0,
    created_at: new Date().toISOString(),
    last_attempt: new Date().toISOString(),
    error_message: errorMessage,
  };
}
