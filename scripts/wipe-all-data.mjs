/**
 * Wipes Firebase (+ storage images), Zoho CRM leads, and local PostgreSQL contacts.
 * Browser IndexedDB queue is only cleared from the app (Settings) or in the browser.
 *
 * Requires: Python API on :5000, optional local-db on :3001
 */
const API = process.env.VITE_API_URL || "http://127.0.0.1:5000";
const LOCAL_DB = process.env.VITE_LOCAL_DB_URL || "http://127.0.0.1:3001";
const includeZoho = process.env.SKIP_ZOHO !== "1";

async function main() {
  console.log("Wiping Firebase and related backend data...");
  const res = await fetch(`${API}/admin/wipe-all-data`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ confirm: true, include_zoho: includeZoho }),
    signal: AbortSignal.timeout(120_000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error("Backend wipe failed:", body.detail || res.statusText);
    process.exit(1);
  }
  console.log("Backend:", JSON.stringify(body, null, 2));
  const local = body.local_db;
  if (local?.error) {
    console.warn("Local DB:", local.error);
  } else if (local) {
    console.log(`Local PostgreSQL: deleted ${local.deleted ?? 0} contact(s).`);
  }

  console.log(
    "\nDone. Use Settings → Delete all data in the app to clear the browser queue/cache.",
  );
}

main();
