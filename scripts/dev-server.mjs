// Local dev server for the Jinked demo store.
//
// This is a thin adapter: it serves the static demo + the built widget, and
// forwards the four API routes to the handlers in demo-server/, which the
// Vercel functions in api/ call with the same arguments. All demo behaviour
// lives in demo-server/ so local and deployed can never drift.
//
//   npm run dev                     # against a commerce backend on :8081
//   BIFY_DEMO_MOCK=1 npm run dev    # simulated, no backend and no chain

import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { config, CONTENT_SECURITY_POLICY, originFromHeaders } from "../demo-server/config.mjs";
import { certificatePage, createCheckoutSession, demoConfig, publicApi } from "../demo-server/handlers.mjs";
import { widgetDistDir } from "./widget-dist.mjs";

const demoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "demo");
const widgetRoot = widgetDistDir();
const port = Number.parseInt(process.env.PORT ?? "3000", 10);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

async function readBody(req, limit = 64 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new Error("request body is too large");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function readJsonBody(req) {
  if (req.method === "GET" || req.method === "HEAD") return undefined;
  const text = await readBody(req);
  if (!text) return {};
  return JSON.parse(text);
}

/** The proxy forwards bytes rather than re-encoded JSON — see publicApi(). */
async function readRawBody(req) {
  if (req.method === "GET" || req.method === "HEAD") return "";
  return readBody(req);
}

/** Write a `{status, headers, json|html|raw}` result from the shared handlers. */
function send(res, result) {
  const headers = { ...result.headers };
  let body;
  if (result.json !== undefined) {
    headers["content-type"] ??= "application/json; charset=utf-8";
    body = JSON.stringify(result.json);
  } else if (result.html !== undefined) {
    headers["content-type"] ??= "text/html; charset=utf-8";
    body = result.html;
  } else {
    body = result.raw ?? "";
  }
  res.writeHead(result.status, headers);
  res.end(body);
}

function safePath(root, relativePath) {
  const candidate = resolve(root, `.${relativePath}`);
  if (candidate !== root && !candidate.startsWith(`${root}${sep}`)) return undefined;
  return candidate;
}

const isFile = (path) => Boolean(path) && existsSync(path) && statSync(path).isFile();

/**
 * Resolve a request path to a file, extensionless names included.
 *
 * Vercel serves this demo with `cleanUrls`, so /product is the real address of
 * product.html and a link to the .html name is answered with a redirect. The
 * dev server matches that here, otherwise the two deployments disagree about
 * what the site's own links point at.
 */
function resolveStatic(root, relativePath) {
  const direct = safePath(root, relativePath);
  if (isFile(direct)) return direct;
  if (extname(relativePath)) return undefined;
  const asHtml = safePath(root, `${relativePath}.html`);
  return isFile(asHtml) ? asHtml : undefined;
}

function serveFile(res, root, relativePath, fallback = false) {
  const filePath = resolveStatic(root, relativePath);
  if (!filePath) {
    if (fallback) return serveFile(res, root, "/index.html");
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not found");
    return;
  }
  res.writeHead(200, {
    "content-type": MIME[extname(filePath)] ?? "application/octet-stream",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
    "content-security-policy": CONTENT_SECURITY_POLICY,
  });
  createReadStream(filePath).pipe(res);
}

async function handler(req, res) {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  const origin = originFromHeaders(req.headers, `http://localhost:${port}`);

  try {
    if (url.pathname === "/api/demo-config" && req.method === "GET") {
      return send(res, await demoConfig());
    }

    if (url.pathname === "/api/checkout-session" && req.method === "POST") {
      const body = await readJsonBody(req);
      const query = Object.fromEntries(url.searchParams);
      return send(res, await createCheckoutSession({ body, query }));
    }

    if (url.pathname.startsWith("/api/bify-api/")) {
      const body = await readRawBody(req);
      return send(
        res,
        await publicApi({
          path: url.pathname.slice("/api/bify-api".length),
          method: req.method ?? "GET",
          body,
          search: url.search,
          origin,
        }),
      );
    }

    if (url.pathname.startsWith("/certificate/") && req.method === "GET") {
      const id = decodeURIComponent(url.pathname.slice("/certificate/".length));
      return send(res, await certificatePage({ id, origin }));
    }
  } catch (error) {
    const message = error instanceof SyntaxError ? "Request body is invalid." : "The demo server hit an error.";
    return send(res, { status: 400, headers: { "cache-control": "no-store" }, json: { error: { message } } });
  }

  if (url.pathname.startsWith("/widget/")) {
    return serveFile(res, widgetRoot, url.pathname.slice("/widget".length));
  }

  return serveFile(res, demoRoot, url.pathname === "/" ? "/index.html" : url.pathname, true);
}

createServer(handler).listen(port, "127.0.0.1", () => {
  console.log(`Jinked demo store: http://localhost:${port}`);
  if (config.mockMode) {
    console.log("BIFY_DEMO_MOCK is ON — fabricated sessions; no backend and no chain are used.");
  } else {
    console.log(`Partner-owned checkout for ${config.partnerID} against ${config.backendURL}`);
  }
});
