export type ContactStatus = "synced" | "pending" | "failed";

export function resolveStoredContactStatus(
  contact: Record<string, unknown>,
): ContactStatus {
  const syncStatus = String(contact.syncStatus || "");
  if (syncStatus === "failed" || contact.status === "failed") return "failed";
  if (
    syncStatus === "synced_zoho" ||
    contact.zohoLeadId ||
    contact.zohoSynced ||
    contact.status === "synced"
  ) {
    return "synced";
  }
  return "pending";
}

export function resolveStoredContactLastSync(
  contact: Record<string, unknown>,
  status: ContactStatus,
): string {
  if (status === "synced") {
    return String(contact.lastSync || contact.synced_at || "Synced to Zoho");
  }
  if (status === "failed") {
    return String(contact.sync_error || contact.lastSync || "Sync failed");
  }
  if (contact.syncStatus === "local_only") {
    return "Local PostgreSQL · pending Zoho";
  }
  return "Pending Zoho sync";
}

/** @deprecated Use resolveStoredContactStatus */
export const resolveFirebaseContactStatus = resolveStoredContactStatus;

/** @deprecated Use resolveStoredContactLastSync */
export const resolveFirebaseLastSync = resolveStoredContactLastSync;
