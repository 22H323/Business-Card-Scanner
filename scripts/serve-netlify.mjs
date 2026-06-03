/**
 * Local preview matching Netlify production:
 * - Static assets from dist/client (preferStatic)
 * - SSR via .netlify/v1/functions/server.mjs (same handler Netlify deploys)
 *
 * Run after: npm run build
 */
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const clientRoot = join(root, "dist", "client");
const netlifyHandlerPath = join(root, ".netlify", "v1", "functions", "server.mjs");
const port = Number(process.env.PORT || 8888);
const host = process.env.HOST || "127.0.0.1";

if (!existsSync(netlifyHandlerPath)) {
  console.error("Missing .netlify/v1/functions/server.mjs — run: npm run build");
  process.exit(1);
}

const handlerModule = await import(pathToFileURL(netlifyHandlerPath).href);
const handler = handlerModule.default;
if (typeof handler !== "function") {
  console.error("Netlify server.mjs must export default fetch handler");
  process.exit(1);
}

function tryStaticFile(pathname) {
  const rel = pathname.replace(/^\//, "");
  const file = join(clientRoot, rel);
  if (!file.startsWith(clientRoot) || !existsSync(file) || !rel) {
    return null;
  }
  return readFileSync(file);
}

const httpServer = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || `${host}:${port}`}`);

    const staticBody = tryStaticFile(url.pathname);
    if (staticBody) {
      const ext = url.pathname.split(".").pop()?.toLowerCase();
      const types = {
        js: "application/javascript",
        css: "text/css",
        wasm: "application/wasm",
        json: "application/json",
        png: "image/png",
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        svg: "image/svg+xml",
        ico: "image/x-icon",
        webp: "image/webp",
      };
      res.writeHead(200, { "Content-Type": types[ext] || "application/octet-stream" });
      res.end(staticBody);
      return;
    }

    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (value === undefined) continue;
      headers.set(key, Array.isArray(value) ? value.join(", ") : value);
    }

    let body;
    if (req.method !== "GET" && req.method !== "HEAD") {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      body = Buffer.concat(chunks);
    }

    const request = new Request(url.toString(), { method: req.method, headers, body });
    const response = await handler(request);
    res.writeHead(response.status, Object.fromEntries(response.headers.entries()));
    if (req.method === "HEAD") {
      res.end();
      return;
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    res.end(buffer);
  } catch (error) {
    console.error(error);
    res.writeHead(500, { "Content-Type": "text/plain" });
    res.end("Server error — see terminal logs.");
  }
});

httpServer.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`Port ${port} is in use. Try: $env:PORT=8889; npm run serve:netlify`);
    process.exit(1);
  }
  throw err;
});

httpServer.listen(port, host, () => {
  console.log("Netlify-style local preview (dist/client + .netlify SSR function)");
  console.log(`  App:    http://${host}:${port}/`);
  console.log(`  Queue:  http://${host}:${port}/queue`);
  console.log(`  API:    uses VITE_API_URL from build (see netlify.toml / .env.production)`);
});
