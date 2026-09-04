import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import { CONTENT_SECURITY_POLICY, config, originFromHeaders } from "../demo-server/config.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const vercel = JSON.parse(readFileSync(resolve(root, "vercel.json"), "utf8"));

function vercelHeader(name) {
  for (const rule of vercel.headers ?? []) {
    const found = (rule.headers ?? []).find((header) => header.key === name);
    if (found) return found.value;
  }
  return undefined;
}

// The dev server serves the policy from config.mjs and Vercel serves it from
// vercel.json. When they drift, `npm run dev` proves nothing about what the
// deployment will actually enforce, and a blocked Stripe frame shows up only
// after a deploy.
test("the deployed CSP matches the one the dev server serves", () => {
  assert.equal(vercelHeader("content-security-policy"), CONTENT_SECURITY_POLICY);
});

test("the CSP admits everything Stripe.js opens from this page", () => {
  const directive = (name) => CONTENT_SECURITY_POLICY.split("; ").find((part) => part.startsWith(`${name} `)) ?? "";
  assert.match(directive("script-src"), /https:\/\/js\.stripe\.com/);
  assert.match(directive("frame-src"), /https:\/\/js\.stripe\.com/);
  assert.match(directive("frame-src"), /https:\/\/hooks\.stripe\.com/);
  // Stripe.js runs in this document, so the fraud-signal frame it opens is
  // governed by this policy and not by Stripe's own.
  assert.match(directive("frame-src"), /https:\/\/m\.stripe\.network/);
  assert.match(directive("connect-src"), /https:\/\/api\.stripe\.com/);
  // The widget inlines its brand mark as a data: URL.
  assert.match(directive("img-src"), /data:/);
});

test("the CSP keeps the demo's own origin as the default", () => {
  assert.match(CONTENT_SECURITY_POLICY, /^default-src 'self'/);
  assert.match(CONTENT_SECURITY_POLICY, /object-src 'none'/);
  assert.match(CONTENT_SECURITY_POLICY, /frame-ancestors 'none'/);
});

// A payment call that dies at the proxy strands the buyer mid-purchase, so it
// must have room to finish inside Vercel's 10s function budget.
test("upstream budgets fit inside the platform's function timeout", () => {
  assert.ok(config.upstreamTimeoutMs < 10_000, "a proxied call must fail before the function is killed");
  assert.ok(config.healthTimeoutMs < config.upstreamTimeoutMs, "the status probe must not outlast a payment call");
});

test("certificate links resolve back to the deployment that served the page", () => {
  assert.equal(originFromHeaders({ host: "jinked.vercel.app", "x-forwarded-proto": "https" }), "https://jinked.vercel.app");
  // Vercel answers on several hostnames; the forwarded host wins.
  assert.equal(
    originFromHeaders({ host: "internal", "x-forwarded-host": "jinked.vercel.app", "x-forwarded-proto": "https" }),
    "https://jinked.vercel.app",
  );
  assert.equal(originFromHeaders({ host: "localhost:3200" }), "http://localhost:3200");
});

// vercel.json is the only thing routing the nested public API path and the
// certificate page to their functions; a typo here is a 404 in production.
test("the routes the demo depends on are declared", () => {
  const sources = (vercel.rewrites ?? []).map((rule) => rule.source);
  assert.ok(sources.includes("/api/bify-api/:path*"), "the public checkout proxy must be routed");
  assert.ok(sources.includes("/certificate/:id"), "the certificate page must be routed");
});
