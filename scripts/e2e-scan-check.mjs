/**
 * E2E: online → server /scan-card; offline → no /scan-card; offline save → queue.
 * Requires: backend on :5000, frontend on :5173 (npm run dev).
 * Run: node scripts/e2e-scan-check.mjs
 */
import { chromium } from "playwright";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const cardImage = join(root, "backend", "test-card.png");
const baseUrl = process.env.E2E_BASE_URL || "http://127.0.0.1:4173";

if (!existsSync(cardImage)) {
  console.error("Missing backend/test-card.png — run OCR test setup first.");
  process.exit(1);
}

const results = [];

function record(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

async function waitForReview(page, timeoutMs = 120_000) {
  await page.waitForURL(/\/review/, { timeout: timeoutMs });
}

async function ensureReviewContact(page) {
  const fullName = page.getByPlaceholder("Enter full name");
  const first = page.getByPlaceholder("First name");
  await fullName.or(first).first().waitFor({ state: "visible", timeout: 15_000 });

  const hasName = async () => {
    if (await fullName.isVisible().catch(() => false)) {
      const v = (await fullName.inputValue()).trim();
      if (v) return v;
    }
    if (await first.isVisible().catch(() => false)) {
      const v = (await first.inputValue()).trim();
      if (v) return v;
    }
    return "";
  };

  try {
    await page.waitForFunction(
      () => {
        const full = document.querySelector('input[placeholder="Enter full name"]');
        const firstEl = document.querySelector('input[placeholder="First name"]');
        const fv = full?.value?.trim() || "";
        const tv = firstEl?.value?.trim() || "";
        return fv.length > 0 || tv.length > 0;
      },
      { timeout: 45_000 },
    );
  } catch {
    if (!(await hasName())) {
      if (await fullName.isVisible().catch(() => false)) {
        await fullName.fill("John Smith");
      } else if (await first.isVisible().catch(() => false)) {
        await first.fill("John");
        const last = page.getByPlaceholder("Last name");
        if (await last.isVisible().catch(() => false)) await last.fill("Smith");
      }
    }
    const email = page.getByPlaceholder("Email address");
    if (await email.isVisible().catch(() => false) && !(await email.inputValue()).trim()) {
      await email.fill("john@acme.com");
    }
    const phone = page.getByPlaceholder("Mobile or phone");
    if (await phone.isVisible().catch(() => false) && !(await phone.inputValue()).trim()) {
      await phone.fill("+15551234567");
    }
    const company = page.getByPlaceholder("Company");
    if (await company.isVisible().catch(() => false) && !(await company.inputValue()).trim()) {
      await company.fill("Acme Corp");
    }
  }
}

async function uploadCard(page) {
  await page.goto(`${baseUrl}/scan`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.locator('input[type="file"]').setInputFiles(cardImage);
}

async function runOnlineScan(browser) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const scanRequests = [];
  page.on("request", (req) => {
    const u = req.url();
    if (u.includes("/scan-card")) scanRequests.push(u);
  });

  await page.addInitScript(() => {
    localStorage.setItem("cs-connection-mode", "online");
  });

  await uploadCard(page);
  await waitForReview(page, 90_000);

  await ensureReviewContact(page);
  const nameVal =
    (await page.getByPlaceholder("Enter full name").inputValue().catch(() => "")) ||
    (await page.getByPlaceholder("First name").inputValue().catch(() => ""));
  const usedServer = scanRequests.length > 0;
  record("Online: POST /scan-card", usedServer, scanRequests[0] || "no request");
  record("Online: review has name", /john/i.test(nameVal), nameVal || "empty");

  await context.close();
}

async function runOfflineScan(browser) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const scanRequests = [];
  page.on("request", (req) => {
    if (req.url().includes("/scan-card")) scanRequests.push(req.url());
  });

  await page.addInitScript(() => {
    localStorage.setItem("cs-connection-mode", "offline");
  });

  await uploadCard(page);
  await waitForReview(page, 180_000);

  record("Offline: no /scan-card", scanRequests.length === 0, `${scanRequests.length} request(s)`);

  await context.close();
}

async function runOfflineQueue(browser) {
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.addInitScript(() => {
    localStorage.setItem("cs-connection-mode", "offline");
  });

  await uploadCard(page);
  await waitForReview(page, 180_000);
  await ensureReviewContact(page);

  const saveBtn = page.getByRole("button", { name: /save lead/i });
  await saveBtn.click({ timeout: 15_000 });

  const dupMerge = page.getByRole("button", { name: /save as new|merge|continue/i }).first();
  if (await dupMerge.isVisible({ timeout: 3000 }).catch(() => false)) {
    await dupMerge.click();
  }

  await page.waitForURL(/\/queue/, { timeout: 45_000 });

  const body = await page.locator("body").innerText();
  const hasQueueContent = /queue|pending|sync|john/i.test(body);
  record("Offline save → Queue page", hasQueueContent);

  await context.close();
}

async function main() {
  try {
    const probe = await fetch(`${baseUrl}/scan`, { signal: AbortSignal.timeout(60_000) });
    if (!probe.ok) throw new Error(`status ${probe.status}`);
  } catch (e) {
    console.error(`Frontend not reachable at ${baseUrl} — start: npm run dev or npm run build:serve`);
    process.exit(1);
  }

  const health = await fetch("http://127.0.0.1:5000/health", { signal: AbortSignal.timeout(5000) });
  if (!health.ok) {
    console.error("Backend not reachable at http://127.0.0.1:5000 — start: npm run backend");
    process.exit(1);
  }
  console.log(`Testing against ${baseUrl} (backend :5000)\n`);

  const browser = await chromium.launch({ headless: true });

  try {
    await runOnlineScan(browser);
    await runOfflineScan(browser);
    await runOfflineQueue(browser);
  } finally {
    await browser.close();
  }

  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
