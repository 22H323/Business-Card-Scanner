import { canRunScanOcr } from "@/lib/backendTargets";
import { scanCardImage } from "@/lib/scanApi";
import { emptyScanContact, type ScanContact } from "@/lib/scanResult";
import { runBrowserOcr } from "@/lib/browserOcr";
import { storeScanSession } from "@/lib/scanSession";

export type ScanProgress = {
  progress: number;
  message: string;
};

export type ScanExtractionResult = {
  contact: ScanContact;
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

function isEmptyServerOcr(result: Awaited<ReturnType<typeof scanCardImage>>): boolean {
  const text = (result.raw_text || "").trim();
  const name = (result.contact?.name || result.contact?.fullName || "").trim();
  const warning = (result.ocr_warning || "").toLowerCase();
  if (!text) return true;
  if (warning.includes("tesseract") || warning.includes("no text")) return true;
  return name.length < 2;
}

async function runBrowserOcrFallback(
  file: File,
  onProgress?: (update: ScanProgress) => void,
): Promise<ScanExtractionResult> {
  onProgress?.({ progress: 55, message: "Running browser OCR…" });
  const fallback = await runBrowserOcr(file);
  onProgress?.({ progress: 100, message: "Extraction complete" });
  return {
    contact: fallback.contact,
    rawText: fallback.rawText,
    ocrWarning: fallback.ocrWarning,
  };
}

/** Run OCR on the image file as-is (no crop). Returns parsed contact + raw API payload. */
export async function extractContactFromImage(
  file: File,
  onProgress?: (update: ScanProgress) => void,
): Promise<ScanExtractionResult> {
  onProgress?.({ progress: 15, message: "Uploading image…" });

  try {
    onProgress?.({
      progress: 40,
      message:
        typeof navigator !== "undefined" && !navigator.onLine
          ? "Running local OCR (no internet needed)…"
          : "Running OCR on server…",
    });
    const result = await scanCardImage(file);

    if (isEmptyServerOcr(result)) {
      console.warn("Server OCR empty — trying browser OCR (Render may lack Tesseract).");
      try {
        return await runBrowserOcrFallback(file, onProgress);
      } catch (browserErr) {
        console.error("Browser OCR after empty server response failed:", browserErr);
      }
    }

    onProgress?.({ progress: 100, message: "Extraction complete" });

    if (result.contact) {
      return {
        contact: result.contact,
        rawText: result.raw_text,
        ocrWarning: result.ocr_warning,
        whatsappQueued: result.whatsapp_queued,
        whatsappError: result.whatsapp_error,
        whatsappTo: result.whatsapp_to,
        whatsappRecipientName: result.whatsapp_recipient_name,
        emailQueued: result.email_queued,
        emailError: result.email_error,
        emailTo: result.email_to,
        emailExtracted: result.email_extracted,
      };
    }
    return { contact: emptyScanContact(), ocrWarning: result.ocr_warning };
  } catch (err) {
    console.warn("Remote OCR failed, falling back to browser OCR:", err);

    try {
      onProgress?.({ progress: 50, message: "Running browser OCR fallback…" });
      const fallback = await runBrowserOcr(file);
      onProgress?.({ progress: 100, message: "Extraction complete" });
      return {
        contact: fallback.contact,
        rawText: fallback.rawText,
        ocrWarning: fallback.ocrWarning,
      };
    } catch (browserErr) {
      console.error("Browser OCR fallback failed:", browserErr);
      onProgress?.({ progress: 100, message: "Extraction failed — enter details manually" });
      const offlineHint =
        typeof navigator !== "undefined" && !navigator.onLine
          ? import.meta.env.DEV
            ? " Start the Python backend: npm run server (port 5000)"
            : " Start the Python backend: npm run backend"
          : "";
      return {
        contact: emptyScanContact(),
        ocrWarning: `OCR failed.${offlineHint}`,
      };
    }
  }
}

export async function scanFileAndStore(
  file: File,
  imageDataUrl: string,
  onProgress?: (update: ScanProgress) => void,
): Promise<ScanExtractionResult> {
  const result = await extractContactFromImage(file, onProgress);
  storeScanSession(result.contact, imageDataUrl, {
    rawText: result.rawText,
    ocrWarning: result.ocrWarning,
    whatsappQueued: result.whatsappQueued,
    whatsappError: result.whatsappError,
    whatsappTo: result.whatsappTo,
    whatsappRecipientName: result.whatsappRecipientName,
    emailQueued: result.emailQueued,
    emailError: result.emailError,
    emailTo: result.emailTo,
    emailExtracted: result.emailExtracted,
  });
  return result;
}
