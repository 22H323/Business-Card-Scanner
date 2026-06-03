import type { LeadPayload } from "@/lib/cardImage";
import { API_BASE_URL } from "@/lib/api";
import {
  getContactStorageMode,
  isIndexedDbStorage,
  isServerStorage,
  storageLabel,
  type ContactStorageMode,
} from "@/lib/storageConfig";
import {
  addToQueue,
  deleteStoredContact,
  getStoredContactById,
  listStoredContacts,
  patchStoredContactSyncStatus,
  saveStoredContact,
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
export async function checkStorageHealth(): Promise<boolean> {
  if (isIndexedDbStorage()) {
    return true;
  }
  return checkLocalDbHealth();
}

export async function listContacts(): Promise<StoredContact[]> {
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

export async function saveContact(
  payload: LeadPayload,
  cardImageBase64?: string,
  options?: {
    connectionMode?: "online" | "offline";
    skipWhatsApp?: boolean;
    skipEmail?: boolean;
  },
): Promise<{ id: string; queued?: boolean; whatsappQueued?: boolean; emailQueued?: boolean }> {
  if (isIndexedDbStorage()) {
    const saved = await saveStoredContact(payload as Record<string, unknown>, cardImageBase64);
    return { id: saved.id };
  }

  const up = await checkStorageHealth();
  if (up) {
    return saveContactToLocalDb(payload, cardImageBase64, options);
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
    const result = await syncPayloadToZoho({
      ...payload,
      zohoLeadId: contact.zohoLeadId as string | null | undefined,
    });
    if (result.zohoLeadId) {
      await markContactSyncedZoho(contactId, result.zohoLeadId);
    }
    return result;
  }
  return syncLocalContactToZoho(contactId);
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

export function shouldUseOfflineQueue(): boolean {
  return isServerStorage();
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
