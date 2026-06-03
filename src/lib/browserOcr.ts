import { createWorker } from "tesseract.js";
import type { ScanContact } from "./scanResult";
import { parseOcrText } from "./scanParser";

import workerPath from "tesseract.js/dist/worker.min.js?url";
import corePath from "tesseract.js-core/tesseract-core.wasm.js?url";

const LANGUAGE = "eng";
const LANG_PATH = "/tessdata";

async function createTesseractWorker() {
  const worker = createWorker({
    workerPath,
    corePath,
    langPath: LANG_PATH,
    gzip: false,
    logger: () => undefined,
  });

  await worker.load();
  await worker.loadLanguage(LANGUAGE);
  await worker.initialize(LANGUAGE);
  return worker;
}

export async function runBrowserOcr(file: File): Promise<{ contact: ScanContact; rawText: string; ocrWarning?: string }> {
  try {
    const worker = await createTesseractWorker();
    const { data } = await worker.recognize(file);
    await worker.terminate();

    const rawText = data.text?.trim() || "";
    if (!rawText) {
      return {
        contact: parseOcrText(rawText),
        rawText,
        ocrWarning: "Browser OCR ran, but could not extract any text.",
      };
    }

    return {
      contact: parseOcrText(rawText),
      rawText,
    };
  } catch (error) {
    console.warn("Browser OCR fallback failed:", error);
    return {
      contact: parseOcrText(""),
      rawText: "",
      ocrWarning: "Offline OCR fallback is unavailable. Enter details manually.",
    };
  }
}
