import { API_BASE_URL } from "@/lib/api";
import { parseApiErrorDetail } from "@/lib/apiErrors";
import {
  getSyncContactToZohoUrl,
  getSyncPendingToZohoUrl,
} from "@/lib/backendTargets";
import type { LeadPayload } from "@/lib/cardImage";

export type ZohoSyncResult = {
  zohoLeadId?: string;
  alreadySynced?: boolean;
  success?: boolean;
};

function normalizeZohoSyncResult(data: Record<string, unknown>): ZohoSyncResult {
  return {
    success: data.success === true,
    zohoLeadId:
      (data.zohoLeadId as string | undefined) ||
      (data.zoho_lead_id as string | undefined),
    alreadySynced: Boolean(data.alreadySynced ?? data.already_synced),
  };
}

export async function seedOfflineSampleContact(): Promise<{
  seeded?: boolean;
  id?: string;
}> {
  try {
    const response = await fetch(`${API_BASE_URL}/contacts/seed-sample`, {
      method: "POST",
    });
    if (!response.ok) {
      return { seeded: false };
    }
    return response.json();
  } catch {
    return { seeded: false };
  }
}

export async function saveLeadToZoho(payload: LeadPayload): Promise<void> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/api/leads/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new Error(
      `Backend not reachable at ${API_BASE_URL}. Start: npm run server`,
    );
  }

  if (!response.ok) {
    const errBody = await response.json().catch(() => ({}));
    throw new Error(
      parseApiErrorDetail(errBody, "Failed to save lead to Zoho CRM."),
    );
  }
}

export async function syncPayloadToZoho(
  payload: LeadPayload & { zohoLeadId?: string | null },
  options?: {
    connectionMode?: "online" | "offline";
    skipWhatsApp?: boolean;
    skipEmail?: boolean;
  },
): Promise<ZohoSyncResult> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/api/leads/sync-from-local`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fullName: payload.fullName,
        firstName: payload.firstName,
        lastName: payload.lastName,
        company: payload.company,
        designation: payload.designation,
        phone: payload.phone,
        secondaryPhone: payload.secondaryPhone,
        email: payload.email,
        secondaryEmail: payload.secondaryEmail,
        website: payload.website,
        address: payload.address,
        zohoLeadId: payload.zohoLeadId,
        connectionMode: options?.connectionMode ?? "online",
        skipWhatsApp: Boolean(options?.skipWhatsApp),
        skipEmail: Boolean(options?.skipEmail),
      }),
    });
  } catch {
    throw new Error(
      `Backend not reachable. Run npm run dev:all (Python API on port 5000).`,
    );
  }

  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;

  if (!response.ok) {
    throw new Error(
      parseApiErrorDetail(data, "Failed to sync contact to Zoho CRM."),
    );
  }

  return normalizeZohoSyncResult(data);
}

export async function syncContactToZoho(
  contactId: string,
  options?: { skipWhatsApp?: boolean; skipEmail?: boolean },
): Promise<ZohoSyncResult> {
  let response: Response;
  try {
    response = await fetch(getSyncContactToZohoUrl(contactId), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        skipWhatsApp: Boolean(options?.skipWhatsApp),
        skipEmail: Boolean(options?.skipEmail),
      }),
    });
  } catch {
    throw new Error(
      `Backend not reachable. Run npm run dev:all (Python API on port 5000).`,
    );
  }

  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;

  if (!response.ok) {
    throw new Error(
      parseApiErrorDetail(data, "Failed to sync contact to Zoho CRM."),
    );
  }

  return normalizeZohoSyncResult(data);
}

export async function syncAllPendingContactsToZoho(): Promise<{
  synced: number;
  total: number;
}> {
  let response: Response;
  try {
    response = await fetch(getSyncPendingToZohoUrl(), {
      method: "POST",
    });
  } catch {
    throw new Error(
      `Backend not reachable. Run npm run dev:all (Python API on port 5000).`,
    );
  }

  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;

  if (!response.ok) {
    throw new Error(
      parseApiErrorDetail(data, "Failed to sync pending contacts to Zoho CRM."),
    );
  }

  return {
    synced: Number(data.synced ?? 0),
    total: Number(data.total ?? 0),
  };
}
