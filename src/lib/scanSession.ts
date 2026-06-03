import type { ScanContact } from "@/lib/scanResult";

const SCAN_RESULT_KEY = "latestScanResult";
const SCAN_IMAGE_KEY = "latestScanImage";
const SCAN_META_KEY = "latestScanMeta";

export type ScanSessionMeta = {
  rawText?: string;
  ocrWarning?: string;
  whatsappQueued?: boolean;
  whatsappError?: string | null;
  whatsappTo?: string | null;
  whatsappRecipientName?: string | null;
  emailQueued?: boolean;
  emailError?: string | null;
  emailTo?: string | null;
  emailExtracted?: string | null;
};

export function storeScanSession(
  contact: ScanContact,
  imageDataUrl?: string,
  meta?: ScanSessionMeta,
) {
  sessionStorage.setItem(SCAN_RESULT_KEY, JSON.stringify(contact));
  if (imageDataUrl) {
    sessionStorage.setItem(SCAN_IMAGE_KEY, imageDataUrl);
  }
  if (meta) {
    sessionStorage.setItem(SCAN_META_KEY, JSON.stringify(meta));
  }
  window.dispatchEvent(new CustomEvent("cs-scan-updated"));
}

export function loadScanSession(): {
  contact: ScanContact | null;
  imageDataUrl: string | null;
  meta: ScanSessionMeta | null;
} {
  const raw = sessionStorage.getItem(SCAN_RESULT_KEY);
  const imageDataUrl = sessionStorage.getItem(SCAN_IMAGE_KEY);
  const metaRaw = sessionStorage.getItem(SCAN_META_KEY);
  if (!raw) return { contact: null, imageDataUrl, meta: null };

  try {
    const meta = metaRaw ? (JSON.parse(metaRaw) as ScanSessionMeta) : null;
    return { contact: JSON.parse(raw) as ScanContact, imageDataUrl, meta };
  } catch {
    return { contact: null, imageDataUrl, meta: null };
  }
}

export function clearScanSession() {
  sessionStorage.removeItem(SCAN_RESULT_KEY);
  sessionStorage.removeItem(SCAN_IMAGE_KEY);
  sessionStorage.removeItem(SCAN_META_KEY);
  window.dispatchEvent(new CustomEvent("cs-scan-updated"));
}

export function isValidCardImage(file: File): boolean {
  const type = (file.type || "").toLowerCase();
  const validTypes = ["image/jpeg", "image/jpg", "image/png", "image/pjpeg", "image/x-png"];
  if (validTypes.includes(type)) return true;
  return /\.(jpe?g|png)$/i.test(file.name);
}

export async function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export async function dataUrlToFile(dataUrl: string, fileName = "scan.jpg"): Promise<File> {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  const type = blob.type || "image/jpeg";
  return new File([blob], fileName, { type });
}

export function isEmptyScanContact(contact: ScanContact | null): boolean {
  if (!contact) return true;
  return ![
    contact.fullName,
    contact.firstName,
    contact.lastName,
    contact.phone,
    contact.email,
    contact.company,
  ].some((v) => String(v || "").trim());
}
