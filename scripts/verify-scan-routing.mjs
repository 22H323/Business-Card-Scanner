/**
 * Quick check: built scanPipeline routes offline vs online correctly.
 * Run after: npm run build
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const assetsDir = join(root, "dist", "client", "assets");
const files = readdirSync(assetsDir).filter((f) => f.startsWith("scanPipeline-") && f.endsWith(".js"));
if (!files.length) {
  console.error("FAIL: no dist/client/assets/scanPipeline-*.js — run npm run build");
  process.exit(1);
}

const bundle = readFileSync(join(assetsDir, files[0]), "utf8");
const checks = [
  ["Offline: browser Tesseract message", "Running browser Tesseract (offline)"],
  ["Online: server OCR message", "Running server OCR"],
  ["Online: scanCardImage API", "scan-card"],
  ["Server OCR fallback when empty", "Server OCR empty"],
];

let failed = 0;
for (const [label, needle] of checks) {
  const ok = bundle.includes(needle);
  console.log(`${ok ? "OK" : "FAIL"}  ${label}`);
  if (!ok) failed += 1;
}

const tessPath = join(root, "public", "tessdata", "eng.traineddata");
try {
  const size = readFileSync(tessPath).length;
  console.log(`OK  Browser tessdata (${(size / 1e6).toFixed(1)} MB)`);
} catch {
  console.log("FAIL  public/tessdata/eng.traineddata missing");
  failed += 1;
}

process.exit(failed ? 1 : 0);
