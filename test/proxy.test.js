import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { test } from "node:test";

import handler from "../api/bify-api.js";
import { jsonBody, rawBody } from "../demo-server/vercel.mjs";

// The public-checkout proxy is authenticated by the session's client token,
// which travels in the request body. Anything that reshapes that body on the
// way through is reported upstream as "checkout session is invalid or expired"
// — an error about the session, not about the request that lost the token — so
// these tests pin the body down byte for byte.

const DETAILS = "/api/bify-api/v1/public/checkout/sessions/cs_abc123/details";
const PAYLOAD = { clientToken: "b42df5e0229f8262", customer: { name: "Ada Lovelace", email: "ada@example.test" } };

/** Vercel hands `req.body` in whichever shape its parser settled on. */
function request({ url = DETAILS, method = "POST", body, query, stream } = {}) {
  const req = stream ? Readable.from([Buffer.from(stream)]) : {};
  req.method = method;
  req.url = url;
  req.headers = { host: "demo.example.test", "x-forwarded-proto": "https" };
  req.query = query ?? { path: url.replace("/api/bify-api/", "") };
  if (body !== undefined) req.body = body;
  return req;
}

function response() {
  const headers = new Map();
  return {
    statusCode: 0,
    body: "",
    setHeader(key, value) { headers.set(key.toLowerCase(), value); },
    getHeader(key) { return headers.get(key.toLowerCase()); },
    status(code) { this.statusCode = code; return this; },
    send(payload) { this.body = payload; return this; },
    json(payload) { this.body = JSON.stringify(payload); return this; },
  };
}

/** Captures what the proxy actually put on the wire. */
function captureUpstream(status = 200, payload = { ok: true }) {
  const seen = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    seen.push({ url: String(url), method: init?.method, body: init?.body });
    return new Response(JSON.stringify(payload), {
      status,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  };
  return { seen, restore: () => { globalThis.fetch = original; } };
}

// --- rawBody: every shape Vercel can produce ------------------------------

test("rawBody returns the exact payload whatever shape the runtime parsed it into", async () => {
  const text = JSON.stringify(PAYLOAD);
  const shapes = {
    "parsed object": PAYLOAD,
    "Buffer": Buffer.from(text),
    "Uint8Array": new TextEncoder().encode(text),
    "string": text,
  };

  for (const [label, body] of Object.entries(shapes)) {
    const got = await rawBody(request({ body }));
    assert.deepEqual(JSON.parse(got), PAYLOAD, `${label} must survive the proxy intact`);
  }
});

test("rawBody reads the stream when nothing was pre-parsed", async () => {
  const got = await rawBody(request({ stream: JSON.stringify(PAYLOAD) }));
  assert.deepEqual(JSON.parse(got), PAYLOAD);
});

test("rawBody reads no body for methods that carry none", async () => {
  assert.equal(await rawBody(request({ method: "GET" })), "");
  assert.equal(await rawBody(request({ method: "HEAD" })), "");
});

// A Buffer satisfies `typeof value === "object"`, so treating any object as
// parsed JSON re-serialises it to {"type":"Buffer","data":[…]} and forwards a
// request with none of its fields. This is the exact defect these tests exist
// for, so it is asserted directly rather than only through the handler.
test("a Buffer body is never mistaken for parsed JSON", async () => {
  const got = await jsonBody(request({ body: Buffer.from(JSON.stringify(PAYLOAD)) }));
  assert.equal(got.clientToken, PAYLOAD.clientToken);
  assert.ok(!("data" in got) && !("type" in got), "the Buffer envelope must not leak into the payload");
});

// --- the proxy handler ----------------------------------------------------

test("the client token reaches upstream for every body shape", async () => {
  const text = JSON.stringify(PAYLOAD);
  for (const body of [PAYLOAD, Buffer.from(text), new TextEncoder().encode(text), text]) {
    const upstream = captureUpstream();
    try {
      await handler(request({ body }), response());
      assert.equal(upstream.seen.length, 1);
      assert.deepEqual(JSON.parse(upstream.seen[0].body), PAYLOAD);
      assert.match(upstream.seen[0].url, /\/v1\/public\/checkout\/sessions\/cs_abc123\/details$/);
    } finally {
      upstream.restore();
    }
  }
});

test("the rewrite's path capture is forwarded whether it arrives joined or split", async () => {
  for (const path of ["v1/public/checkout/sessions/cs_abc123/details", ["v1", "public", "checkout", "sessions", "cs_abc123", "details"]]) {
    const upstream = captureUpstream();
    try {
      await handler(request({ body: PAYLOAD, query: { path } }), response());
      assert.match(upstream.seen[0].url, /\/v1\/public\/checkout\/sessions\/cs_abc123\/details$/);
    } finally {
      upstream.restore();
    }
  }
});

// Without the capture the old proxy forwarded "/", which upstream answers
// successfully — so the widget failed later with an unrelated message.
test("a request with no path capture falls back to the URL rather than proxying the API root", async () => {
  const upstream = captureUpstream();
  try {
    await handler(request({ body: PAYLOAD, query: {} }), response());
    assert.match(upstream.seen[0].url, /\/v1\/public\/checkout\/sessions\/cs_abc123\/details$/);
  } finally {
    upstream.restore();
  }
});

test("a request that names no route is refused instead of proxied", async () => {
  const upstream = captureUpstream();
  const res = response();
  try {
    await handler(request({ url: "/api/bify-api", query: {} }), res);
    assert.equal(upstream.seen.length, 0, "nothing should reach upstream");
    assert.equal(res.statusCode, 404);
  } finally {
    upstream.restore();
  }
});

test("query parameters survive but the rewrite's own capture does not", async () => {
  const upstream = captureUpstream();
  try {
    const url = `${DETAILS}?trace=1`;
    await handler(request({ url, body: PAYLOAD, query: { path: "v1/public/checkout/sessions/cs_abc123/details", trace: "1" } }), response());
    assert.match(upstream.seen[0].url, /\?trace=1$/);
    assert.ok(!upstream.seen[0].url.includes("path="), "the capture is routing metadata, not an upstream parameter");
  } finally {
    upstream.restore();
  }
});

test("an upstream rejection is relayed with its status and body", async () => {
  const upstream = captureUpstream(400, { ok: false, error: { code: "invalid_request", message: "checkout session is invalid or expired" } });
  const res = response();
  try {
    await handler(request({ body: PAYLOAD }), res);
    assert.equal(res.statusCode, 400);
    assert.match(res.body, /invalid or expired/);
  } finally {
    upstream.restore();
  }
});

test("a GET is proxied without a body", async () => {
  const upstream = captureUpstream();
  try {
    await handler(request({ method: "GET" }), response());
    assert.equal(upstream.seen[0].body, undefined);
  } finally {
    upstream.restore();
  }
});
