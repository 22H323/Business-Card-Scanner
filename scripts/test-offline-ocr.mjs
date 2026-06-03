/** Quick offline OCR smoke test in headless browser. */
import { chromium } from "playwright";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const baseUrl = process.env.E2E_BASE_URL || "http://127.0.0.1:4173";
const cardImage = join(root, "backend", "test-card.png");

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

page.on("console", (msg) => {
  if (msg.type() === "warning" || msg.type() === "error") {
    console.log(`[browser ${msg.type()}]`, msg.text());
  }
});
page.on("requestfailed", (req) => {
  console.log("[404/fail]", req.url(), req.failure()?.errorText);
});
page.on("response", (res) => {
  if (res.status() >= 400) console.log(`[${res.status()}]`, res.url());
});

await page.addInitScript(() => {
  localStorage.setItem("cs-connection-mode", "offline");
});

await page.goto(`${baseUrl}/scan`, { waitUntil: "domcontentloaded", timeout: 60_000 });
await page.locator('input[type="file"]').setInputFiles(cardImage);

await page.waitForURL(/\/review/, { timeout: 180_000 });

const body = await page.locator("body").innerText();
const hasManualOnlyError = body.includes("Offline OCR fallback is unavailable");
const hasNewError = body.includes("Offline scan failed");
const name =
  (await page.getByPlaceholder("Enter full name").inputValue().catch(() => "")) ||
  (await page.getByPlaceholder("First name").inputValue().catch(() => ""));

console.log("Review name:", name || "(empty)");
console.log("Old error shown:", hasManualOnlyError);
console.log("Has extracted text:", /john/i.test(name));

await browser.close();
const hasText = name.trim().length > 2;
process.exit(hasManualOnlyError || !hasText ? 1 : 0);
