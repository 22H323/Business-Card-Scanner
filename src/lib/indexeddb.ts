import { openDB, IDBPDatabase } from "idb";

export interface QueueItem {
  id: string;
  contact_data: any;
  status: "pending" | "retrying" | "synced" | "failed";
  retry_count: number;
  created_at: string;
  last_attempt: string;
  error_message?: string;
  /** Base64 data URL of the business card image for local DB sync */
  image_base64?: string;
}

const DB_NAME = "cardsync-db";
const STORE_NAME = "sync_queue";
const CONTACTS_CACHE_STORE = "contacts_cache";
const DB_VERSION = 3;

function dispatchQueueUpdate() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("cs-queue-updated"));
  }
}

export async function initDB(): Promise<IDBPDatabase> {
  console.log(`[IndexedDB] Initializing database: ${DB_NAME}, version: ${DB_VERSION}`);
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion, newVersion) {
      console.log(`[IndexedDB] Upgrading database ${DB_NAME} from version ${oldVersion} to ${newVersion}`);
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        console.log(`[IndexedDB] Creating object store: ${STORE_NAME}`);
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(CONTACTS_CACHE_STORE)) {
        console.log(`[IndexedDB] Creating object store: ${CONTACTS_CACHE_STORE}`);
        db.createObjectStore(CONTACTS_CACHE_STORE, { keyPath: "id" });
      }
    },
  });
}

export async function addToQueue(item: QueueItem): Promise<void> {
  console.log("ADDING TO QUEUE", item);
  try {
    const db = await initDB();
    await db.put(STORE_NAME, item);
    console.log("SUCCESSFULLY ADDED", item.id);
    dispatchQueueUpdate();
  } catch (err) {
    console.error("INDEXEDDB ERROR", err);
    throw err;
  }
}

export async function getQueueItems(): Promise<QueueItem[]> {
  console.log("[IndexedDB] Fetching queue items");
  try {
    const db = await initDB();
    const items = await db.getAll(STORE_NAME);
    console.log(`[IndexedDB] Fetched ${items.length} item(s)`);
    return items;
  } catch (err) {
    console.error("[IndexedDB] Error fetching queue items:", err);
    throw err;
  }
}

export async function updateQueueItem(item: QueueItem): Promise<void> {
  console.log("[IndexedDB] Updating queue item:", item.id, item.status);
  try {
    const db = await initDB();
    await db.put(STORE_NAME, item);
    console.log("[IndexedDB] Updated item successfully:", item.id);
    dispatchQueueUpdate();
  } catch (err) {
    console.error("[IndexedDB] Error updating queue item:", err);
    throw err;
  }
}

export async function removeQueueItem(id: string): Promise<void> {
  console.log("[IndexedDB] Removing queue item:", id);
  try {
    const db = await initDB();
    await db.delete(STORE_NAME, id);
    console.log("[IndexedDB] Removed item successfully:", id);
    dispatchQueueUpdate();
  } catch (err) {
    console.error("[IndexedDB] Error removing queue item:", err);
    throw err;
  }
}

export async function cacheContacts(contacts: any[]): Promise<void> {
  console.log("[IndexedDB] Caching", contacts.length, "contacts");
  try {
    const db = await initDB();
    const tx = db.transaction(CONTACTS_CACHE_STORE, "readwrite");
    const store = tx.objectStore(CONTACTS_CACHE_STORE);
    await store.clear();
    for (const contact of contacts) {
      await store.put(contact);
    }
    await tx.done;
    console.log("[IndexedDB] Contacts cached successfully");
  } catch (err) {
    console.error("[IndexedDB] Error caching contacts:", err);
  }
}

export async function getCachedContacts(): Promise<any[]> {
  console.log("[IndexedDB] Fetching cached contacts");
  try {
    const db = await initDB();
    const contacts = await db.getAll(CONTACTS_CACHE_STORE);
    console.log(`[IndexedDB] Fetched ${contacts.length} cached contact(s)`);
    return contacts;
  } catch (err) {
    console.error("[IndexedDB] Error fetching cached contacts:", err);
    return [];
  }
}

export async function clearSyncQueue(): Promise<void> {
  const db = await initDB();
  await db.clear(STORE_NAME);
  dispatchQueueUpdate();
}

export async function clearContactsCache(): Promise<void> {
  const db = await initDB();
  await db.clear(CONTACTS_CACHE_STORE);
}

export async function clearAllBrowserData(): Promise<void> {
  await clearSyncQueue();
  await clearContactsCache();
}

export async function removeCachedContact(id: string): Promise<void> {
  try {
    const db = await initDB();
    await db.delete(CONTACTS_CACHE_STORE, id);
    console.log("[IndexedDB] Removed cached contact:", id);
    window.dispatchEvent(new CustomEvent("cs-contacts-updated"));
  } catch (err) {
    console.error("[IndexedDB] Error removing cached contact:", err);
  }
}

function contactRecordFromPayload(
  payload: Record<string, unknown>,
  existingId?: string,
  cardImageBase64?: string,
): Record<string, unknown> {
  const id = existingId || crypto.randomUUID();
  const now = new Date().toISOString();
  const fullName = String(payload.fullName || payload.name || "").trim();
  const syncStatus = String(payload.syncStatus || "local_only");
  const zohoLeadId = payload.zohoLeadId as string | null | undefined;
  const status =
    syncStatus === "synced_zoho" || zohoLeadId ? "synced" : syncStatus === "failed" ? "failed" : "pending";

  return {
    id,
    name: fullName,
    fullName,
    firstName: String(payload.firstName || ""),
    lastName: String(payload.lastName || ""),
    designation: String(payload.designation || payload.title || ""),
    company: String(payload.company || ""),
    phone: String(payload.phone || ""),
    secondaryPhone: String(payload.secondaryPhone || ""),
    email: String(payload.email || ""),
    secondaryEmail: String(payload.secondaryEmail || ""),
    website: String(payload.website || ""),
    secondaryWebsite: String(payload.secondaryWebsite || ""),
    address: String(payload.address || ""),
    secondaryAddress: String(payload.secondaryAddress || ""),
    socialLinks: String(payload.socialLinks || ""),
    gstNumber: String(payload.gstNumber || ""),
    notes: String(payload.notes || ""),
    cardImageBase64: cardImageBase64 ?? payload.cardImageBase64,
    syncStatus,
    zohoLeadId: zohoLeadId ?? null,
    source: "indexeddb",
    status,
    created_at: String(payload.created_at || now),
    lastSync:
      status === "synced"
        ? "Synced to Zoho"
        : "IndexedDB · pending Zoho",
    channels: {
      whatsapp: Boolean(payload.phone),
      email: Boolean(payload.email),
    },
  };
}

/** Primary contact storage when CONTACT_STORAGE=indexeddb */
export async function saveStoredContact(
  payload: Record<string, unknown>,
  cardImageBase64?: string,
): Promise<{ id: string }> {
  const record = contactRecordFromPayload(payload, undefined, cardImageBase64);
  const db = await initDB();
  await db.put(CONTACTS_CACHE_STORE, record);
  window.dispatchEvent(new CustomEvent("cs-contacts-updated"));
  return { id: String(record.id) };
}

export async function updateStoredContact(
  contactId: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const db = await initDB();
  const existing = (await db.get(CONTACTS_CACHE_STORE, contactId)) as Record<string, unknown> | undefined;
  const record = contactRecordFromPayload(
    { ...(existing || {}), ...payload },
    contactId,
    payload.cardImageBase64 as string | undefined,
  );
  if (existing?.created_at) {
    record.created_at = existing.created_at;
  }
  await db.put(CONTACTS_CACHE_STORE, record);
  window.dispatchEvent(new CustomEvent("cs-contacts-updated"));
}

export async function listStoredContacts(): Promise<Record<string, unknown>[]> {
  const contacts = await getCachedContacts();
  return contacts.sort((a, b) =>
    String(b.created_at || "").localeCompare(String(a.created_at || "")),
  );
}

export async function getStoredContactById(contactId: string): Promise<Record<string, unknown> | null> {
  const db = await initDB();
  const contact = await db.get(CONTACTS_CACHE_STORE, contactId);
  return contact ?? null;
}

export async function deleteStoredContact(contactId: string): Promise<void> {
  await removeCachedContact(contactId);
}

export async function patchStoredContactSyncStatus(
  contactId: string,
  syncStatus: string,
  zohoLeadId?: string,
): Promise<void> {
  const existing = await getStoredContactById(contactId);
  if (!existing) {
    throw new Error("Contact not found");
  }
  await updateStoredContact(contactId, {
    ...existing,
    syncStatus,
    zohoLeadId: zohoLeadId ?? existing.zohoLeadId,
  });
}

