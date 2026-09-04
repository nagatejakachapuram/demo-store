// Adapter between Vercel's Node request/response objects and the shared
// `{ status, headers, json | html | raw }` shape returned by demo-server/handlers.mjs.

import { originFromHeaders } from "./config.mjs";

export function requestOrigin(req) {
  return originFromHeaders(req.headers ?? {});
}

const MAX_BODY_BYTES = 64 * 1024;

/**
 * The request payload as text, exactly as the client sent it.
 *
 * Vercel hands `req.body` in whichever shape its body parser settled on: a
 * parsed object for a plain function route, but raw bytes for a request that
 * arrived through a `vercel.json` rewrite. A Buffer satisfies
 * `typeof value === "object"`, so code that treats any object as parsed JSON
 * re-serialises the bytes into `{"type":"Buffer","data":[…]}` and forwards a
 * request whose fields have all silently disappeared. Every shape is handled
 * here, once, so no caller has to know which one it got.
 */
export async function rawBody(req) {
  if (req.method === "GET" || req.method === "HEAD") return "";
  const body = req.body;
  if (Buffer.isBuffer(body)) return body.toString("utf8");
  if (ArrayBuffer.isView(body)) return Buffer.from(body.buffer, body.byteOffset, body.byteLength).toString("utf8");
  if (typeof body === "string") return body;
  if (body && typeof body === "object") return JSON.stringify(body);

  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new Error("request body is too large");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

/** The payload parsed as JSON, for the routes that read fields out of it. */
export async function jsonBody(req) {
  if (req.method === "GET" || req.method === "HEAD") return undefined;
  const text = await rawBody(req);
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new SyntaxError("invalid json body");
  }
}

export function sendResult(res, result) {
  for (const [key, value] of Object.entries(result.headers ?? {})) res.setHeader(key, value);
  if (result.json !== undefined) {
    if (!res.getHeader("content-type")) res.setHeader("content-type", "application/json; charset=utf-8");
    res.status(result.status).send(JSON.stringify(result.json));
    return;
  }
  if (result.html !== undefined) {
    if (!res.getHeader("content-type")) res.setHeader("content-type", "text/html; charset=utf-8");
    res.status(result.status).send(result.html);
    return;
  }
  res.status(result.status).send(result.raw ?? "");
}

/** Wrap a handler so a thrown error becomes a JSON error rather than a 500 page. */
export function guard(fn) {
  return async (req, res) => {
    try {
      await fn(req, res);
    } catch (error) {
      const message = error instanceof SyntaxError ? "Request body is invalid." : "The demo server hit an error.";
      res.setHeader("cache-control", "no-store");
      res.status(error instanceof SyntaxError ? 400 : 500).json({ error: { message } });
    }
  };
}
