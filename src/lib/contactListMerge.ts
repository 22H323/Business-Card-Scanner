/** Dedupe browser-stored contacts against Zoho leads for the Contacts page. */

export type ZohoLeadLookup = {
  leadIds: Set<string>;
  contactKeys: Set<string>;
};

export function contactMatchKey(email?: string, phone?: string): string {
  const normalizedEmail = String(email || "")
    .trim()
    .toLowerCase();
  if (normalizedEmail) {
    return `e:${normalizedEmail}`;
  }
  const digits = String(phone || "").replace(/\D/g, "");
  if (digits.length >= 7) {
    return `p:${digits}`;
  }
  return "";
}

export function buildZohoLeadLookup(leads: Array<{ id?: string; email?: string; phone?: string }>): ZohoLeadLookup {
  const leadIds = new Set<string>();
  const contactKeys = new Set<string>();
  for (const lead of leads) {
    const id = String(lead.id || "").trim();
    if (id) {
      leadIds.add(id);
    }
    const key = contactMatchKey(lead.email, lead.phone);
    if (key) {
      contactKeys.add(key);
    }
  }
  return { leadIds, contactKeys };
}

export function isDuplicateOfZohoLead(
  contact: { zohoLeadId?: string | null; email?: string; phone?: string; syncStatus?: string; status?: string },
  lookup: ZohoLeadLookup,
  options?: { hideSyncedWhenOnline?: boolean },
): boolean {
  const zohoId = String(contact.zohoLeadId || "").trim();
  if (zohoId && lookup.leadIds.has(zohoId)) {
    return true;
  }

  const key = contactMatchKey(contact.email, contact.phone);
  if (key && lookup.contactKeys.has(key)) {
    return true;
  }

  if (options?.hideSyncedWhenOnline) {
    if (contact.syncStatus === "synced_zoho" || contact.status === "synced") {
      return true;
    }
  }

  return false;
}
