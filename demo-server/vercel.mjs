// Adapter between Vercel's Node request/response objects and the shared
// `{ status, headers, json | html | raw }` shape returned by demo-server/handlers.mjs.

import { originFromHeaders } from "./config.mjs";

export function requestOrigin(req) {
  return originFromHeaders(req.headers ?? {});
}

/**
 * Vercel usually parses a JSON body onto `req.body`, but not for every
 * content-type or runtime, so fall back to reading the stream.
 */
export async function jsonBody(req) {
  if (req.method === "GET" || req.method === "HEAD") return undefined;
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") {
    if (!req.body) return {};
    try {
      return JSON.parse(req.body);
    } catch {
      throw new SyntaxError("invalid json body");
    }
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 64 * 1024) throw new Error("request body is too large");
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString("utf8");
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
