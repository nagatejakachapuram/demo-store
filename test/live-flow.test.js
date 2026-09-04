import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { once } from "node:events";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { after, test } from "node:test";

// End-to-end through the real dev server in LIVE mode (not simulated), against
// a stub standing in for the commerce API. Simulated mode short-circuits before
// the proxy forwards anything, so it cannot catch a request the proxy mangles
// on the way out — which is exactly the failure this covers.

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const SESSION = {
  id: "cs_d7517239d3e6359537c4029452cab381",
  clientToken: "b42df5e0229f82627e51272048592ee45e7f33973416a52fb38eadef32b68d86",
  paymentMethod: "usdc",
  paymentMode: "hosted_transfer",
  quantity: 1,
  status: "payment_pending",
};

/** Records every request the demo forwards, the way the commerce API would see it. */
async function startUpstream() {
  const seen = [];
  const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = Buffer.concat(chunks).toString("utf8");
    seen.push({ path: req.url, method: req.method, body });

    res.setHeader("content-type", "application/json; charset=utf-8");
    if (req.url === "/healthz") return res.end(JSON.stringify({ ok: true }));
    if (req.url === "/v1/checkout/sessions") return res.end(JSON.stringify(SESSION));
    res.end(JSON.stringify({ ok: true }));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return { seen, url: `http://localhost:${server.address().port}`, close: () => server.close() };
}

async function startDemo(backendURL, overrides = {}) {
  const port = 3400 + Math.floor(Math.random() * 200);
  const child = spawn(process.execPath, [resolve(root, "scripts/dev-server.mjs")], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(port),
      BIFY_DEMO_MOCK: "0",
      BIFY_BACKEND_URL: backendURL,
      BIFY_PARTNER_API_KEY: "test_partner_key",
      // Deliberately different accounts, so a mode that reaches for the wrong
      // one is visible rather than coincidentally correct.
      BIFY_DEMO_STRIPE_KEY: "pk_test_simulated_account",
      BIFY_PLATFORM_STRIPE_PUBLISHABLE_KEY: "pk_test_platform_account",
      BIFY_DEMO_STRIPE_SECRET_KEY: "",
      ...overrides,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  // Wait for the listening banner rather than a fixed sleep.
  for await (const chunk of child.stdout) {
    if (String(chunk).includes("http://localhost")) break;
  }
  return { url: `http://localhost:${port}`, close: () => child.kill("SIGKILL") };
}

const upstream = await startUpstream();
const demo = await startDemo(upstream.url);
after(() => { demo.close(); upstream.close(); });

test("the demo runs in live mode against the commerce API", async () => {
  const config = await (await fetch(`${demo.url}/api/demo-config`)).json();
  assert.equal(config.backend, "connected", "live mode must report a reachable backend");
  assert.equal(config.mock, false);
});

test("a checkout session is priced from the server catalogue, not the request", async () => {
  const response = await fetch(`${demo.url}/api/checkout-session`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    // A tampered client asking for a cheap session.
    body: JSON.stringify({ productId: "jinked-sticker-pack", quantity: 1, totalPriceUsdc: "1" }),
  });
  assert.equal(response.status, 200);

  const created = upstream.seen.find((entry) => entry.path === "/v1/checkout/sessions");
  assert.ok(created, "the session must be created through the commerce API");
  const sent = JSON.parse(created.body);
  assert.equal(sent.totalPriceUsdc, "1000000", "the price comes from the catalogue");
  assert.equal(sent.externalProductId, "jinked-sticker-pack");
});

// The defect this file exists for: the client token travels in the body of
// every public checkout call, and a proxy that re-encodes the body drops it.
// Upstream then reports "checkout session is invalid or expired", which reads
// like a stale session rather than a request that lost its credential.
test("the client token survives the proxy on every public checkout call", async () => {
  const calls = {
    details: { clientToken: SESSION.clientToken, customer: { name: "Ada Lovelace", email: "ada@example.test" } },
    authorize: { clientToken: SESSION.clientToken, payer: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" },
    "card/intent": { clientToken: SESSION.clientToken },
    "certificate/voucher": { clientToken: SESSION.clientToken },
    "certificate/email": { clientToken: SESSION.clientToken },
  };

  for (const [route, payload] of Object.entries(calls)) {
    const response = await fetch(`${demo.url}/api/bify-api/v1/public/checkout/sessions/${SESSION.id}/${route}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    assert.equal(response.status, 200, `${route} should reach upstream`);

    const forwarded = upstream.seen.at(-1);
    assert.equal(forwarded.path, `/v1/public/checkout/sessions/${SESSION.id}/${route}`);
    assert.deepEqual(JSON.parse(forwarded.body), payload, `${route} must arrive byte-identical`);
  }
});

// The deployment serves clean URLs. If the dev server does not, the storefront's
// own product links work in one environment and redirect (or 404) in the other.
test("the storefront's own links resolve without a redirect", async () => {
  const page = await fetch(`${demo.url}/product?id=jinked-sticker-pack`, { redirect: "manual" });
  assert.equal(page.status, 200, "/product must be served directly, not redirected");
  assert.match(page.headers.get("content-type") ?? "", /text\/html/);

  const shop = await (await fetch(`${demo.url}/shop.js`)).text();
  assert.ok(!shop.includes("/product.html?id="), "product cards must link to the clean URL");
  assert.ok(shop.includes("/product?id="));
});

// Live mode opens a destination charge: the PaymentIntent is minted on the BIFY
// platform account, so only that account's publishable key can confirm it. The
// simulated-mode key belongs to the demo's own account and would be rejected in
// the browser — after the charge had already been opened.
test("live mode hands the widget the platform's publishable key, not the demo's", async () => {
  const response = await fetch(`${demo.url}/api/checkout-session`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ productId: "jinked-sticker-pack", quantity: 1 }),
  });
  const session = await response.json();
  assert.equal(session.demoPublishableKey, "pk_test_platform_account");
  assert.notEqual(session.demoPublishableKey, "pk_test_simulated_account");

  const config = await (await fetch(`${demo.url}/api/demo-config`)).json();
  assert.equal(config.cardRail, true, "the card rail follows the platform key in live mode");
});

// A publishable and a secret key differ by one letter in an environment
// variable. Everything this endpoint returns is served to the browser, so the
// wrong one there is a live credential published to every visitor — with a page
// that still looks like it is working.
test("a secret key in a publishable slot is never served to the browser", async () => {
  const leaky = await startDemo(upstream.url, {
    BIFY_DEMO_STRIPE_KEY: "sk_test_51UC1rHPjjOkPlYDYsecret",
    BIFY_PLATFORM_STRIPE_PUBLISHABLE_KEY: "",
  });
  try {
    const session = await (await fetch(`${leaky.url}/api/checkout-session`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ productId: "jinked-sticker-pack", quantity: 1 }),
    })).json();
    assert.equal(session.demoPublishableKey, undefined, "a secret key must never reach the session payload");
    assert.ok(!JSON.stringify(session).includes("sk_test"), "no secret key anywhere in the response");

    const config = await (await fetch(`${leaky.url}/api/demo-config`)).json();
    assert.equal(config.cardRail, false, "the rail is disabled rather than the secret published");
  } finally {
    leaky.close();
  }
});

// The common testnet setup runs the demo on the platform's own Stripe account,
// where one key serves both modes. That deployment must keep working untouched.
test("live mode falls back to the single key when only one account is in play", async () => {
  const single = await startDemo(upstream.url, {
    BIFY_DEMO_STRIPE_KEY: "pk_test_one_account",
    BIFY_PLATFORM_STRIPE_PUBLISHABLE_KEY: "",
  });
  try {
    const config = await (await fetch(`${single.url}/api/demo-config`)).json();
    assert.equal(config.cardRail, true, "one configured key must still enable the card rail");

    const session = await (await fetch(`${single.url}/api/checkout-session`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ productId: "jinked-sticker-pack", quantity: 1 }),
    })).json();
    assert.equal(session.demoPublishableKey, "pk_test_one_account");
  } finally {
    single.close();
  }
});

test("a GET for a minted certificate is proxied without a body", async () => {
  const id = `0x${"a".repeat(64)}`;
  const response = await fetch(`${demo.url}/api/bify-api/v1/public/certificates/${id}`);
  assert.equal(response.status, 200);
  assert.equal(upstream.seen.at(-1).path, `/v1/public/certificates/${id}`);
  assert.equal(upstream.seen.at(-1).body, "");
});
