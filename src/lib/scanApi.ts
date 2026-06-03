import { getScanApiBaseUrl } from "@/lib/backendTargets";
import { getConnectionMode } from "@/lib/connectionMode";
import type { ScanContact } from "@/lib/scanResult";

export type ScanApiResponse = {
  success: boolean;
  contact?: ScanContact & { confidence?: Record<string, number> };
  raw_text?: string;
  ocr_warning?: string;
  whatsapp_queued?: boolean;
  whatsapp_sent?: boolean;
  whatsapp_error?: string | null;
  whatsapp_to?: string | null;
  whatsapp_recipient_name?: string | null;
  whatsapp_message?: string | null;
  email_queued?: boolean;
  email_sent?: boolean;
  email_error?: string | null;
  email_to?: string | null;
  email_extracted?: string | null;
  email_subject?: string | null;
  error?: string;
};

export async function scanCardImage(file: File): Promise<ScanApiResponse> {
  const formData = new FormData();
  formData.append("card", file);
  formData.append("connection_mode", getConnectionMode());

  const response = await fetch(`${getScanApiBaseUrl()}/scan-card`, {
    method: "POST",
    body: formData,
  });

  const data = (await response.json()) as ScanApiResponse;
  if (!response.ok || !data.success) {
    throw new Error(data.error || `Scan failed (${response.status})`);
  }
  return data;
}
