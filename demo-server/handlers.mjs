// Core demo handlers, shared verbatim by the local dev server and the Vercel
// serverless functions.
//
// Each handler is a pure-ish async function that takes a plain request
// description and returns `{ status, json | html | raw, headers? }`. The two
// adapters (scripts/dev-server.mjs and api/*.js) only translate between their
// runtime's request/response objects and this shape, so the two deployments
// cannot drift apart.
//
// This is the MERCHANT side of the integration. It exists because the partner
// API key must never reach the browser — not because the demo has real data.

import { randomUUID } from "node:crypto";
import { BifyClient } from "@bify/sdk";
import { clampQuantity, findProduct, formatUsdc, publicCatalog, totalPriceUsdc } from "./catalog.mjs";
import { config, CONTENT_SECURITY_POLICY } from "./config.mjs";
import { renderCertificatePage } from "./certificate.mjs";
import * as mock from "./mock.mjs";

/** Lazily constructed so mock mode never requires a partner key to be present. */
let client;
function bify() {
  if (!client) {
    client = new BifyClient({
      apiKey: config.partnerAPIKey,
      baseUrl: config.backendURL,
      network: config.network,
      timeoutMs: config.upstreamTimeoutMs,
    });
  }
  return client;
}

const noStore = {
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
};

const fail = (status, message) => ({ status, headers: noStore, json: { error: { message } } });

// ---------------------------------------------------------------------------
// GET /api/demo-config
// ---------------------------------------------------------------------------

/**
 * Everything the storefront needs to render: the catalogue, the settlement
 * status, and (when configured) the Stripe publishable key for the card rail.
 * The partner API key is never included.
 */
export async function demoConfig() {
  let backend = "connected";
  let error;

  if (config.mockMode) {
    backend = "simulated";
  } else {
    try {
      const response = await fetch(`${config.backendURL}/healthz`, {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(config.upstreamTimeoutMs),
      });
      if (!response.ok) {
        backend = "unavailable";
        error = { message: "The commerce backend is not ready." };
      }
    } catch {
      backend = "unavailable";
      error = { message: "The commerce backend could not be reached." };
    }
  }

  return {
    status: 200,
    headers: noStore,
    json: {
      storeName: "Jinked",
      catalog: publicCatalog(),
      // Truthful status: simulated mode never contacts the backend or a chain
      // and must not be presented as a live settlement environment.
      backend,
      mock: config.mockMode,
      network: config.network,
      chainId: config.chainId,
      partnerId: config.partnerID,
      // In simulated mode this server mints the intent, so it needs both keys.
      // In live mode the commerce backend mints it and decides the rails; the
      // page only needs the publishable key to render Stripe.js.
      cardRail: config.mockMode ? mock.cardRailReady() : config.demoStripeKey !== "",
      error,
    },
  };
}

// ---------------------------------------------------------------------------
// POST /api/checkout-session
// ---------------------------------------------------------------------------

/**
 * Creates a hosted USDC checkout session for one catalogue product.
 *
 * The browser sends only a product id and a quantity. Price, category, and
 * shipping requirement are read from the server-side catalogue, so a tampered
 * client cannot mint a cheap session — this is the pattern a real partner
 * should copy.
 *
 * The product may arrive in the body (storefront "Buy" click) or in the query
 * string (the widget's own re-quote when the buyer changes quantity, which
 * posts `{externalOrderId, quantity}` only — hence the demo page points its
 * `sessionRefreshEndpoint` at `/api/checkout-session?productId=...`).
 */
export async function createCheckoutSession({ body, query = {} }) {
  if (body !== undefined && (typeof body !== "object" || body === null || Array.isArray(body))) {
    return fail(400, "Checkout request is invalid.");
  }
  const input = body ?? {};

  const product = findProduct(input.productId ?? query.productId);
  if (!product) return fail(404, "That product is not in the catalogue.");

  const quantity = clampQuantity(product, Number(input.quantity ?? 1));
  const externalOrderId =
    typeof input.externalOrderId === "string" && /^[A-Za-z0-9:_-]{1,120}$/.test(input.externalOrderId.trim())
      ? input.externalOrderId.trim()
      : `jinked-${randomUUID()}`;

  if (config.mockMode) {
    const session = mock.createSession({ product, quantity, externalOrderId });
    return { status: 200, headers: noStore, json: withDemoKey(session) };
  }

  try {
    // The server SDK is the trusted integration surface. It validates the order
    // snapshot, attaches the idempotency key, and signs the request with the
    // partner credential — none of which can happen in the browser.
    const session = await bify().checkout.createOrderSession({
      externalProductId: product.id,
      productName: product.name,
      productCategory: product.category,
      unitPriceUsdc: product.unitPriceUsdc,
      totalPriceUsdc: totalPriceUsdc(product, quantity),
      quantity,
      externalOrderId,
      shippingRequired: product.shippingRequired,
      idempotencyKey: `checkout:${externalOrderId}`,
      certificate: { enabled: true },
    });
    return { status: 200, headers: noStore, json: withDemoKey(session) };
  } catch (error) {
    // BifyApiError carries a safe, already-sanitised message.
    const message = typeof error?.message === "string" && error.message.length <= 240
      ? error.message
      : "The checkout session could not be created.";
    return fail(502, message);
  }
}

/**
 * Dev-only passthrough so the demo page can hand the widget a Stripe
 * publishable key. A real partner configures this on its own page; it is never
 * part of the Commerce API response.
 */
function withDemoKey(session) {
  return config.demoStripeKey ? { ...session, demoPublishableKey: config.demoStripeKey } : session;
}

// ---------------------------------------------------------------------------
// ALL /api/bify-api/*  →  the public (unauthenticated) checkout API
// ---------------------------------------------------------------------------

/**
 * Same-origin passthrough for the public routes the widget calls with the
 * client token. These carry no partner credential; the proxy exists so the
 * demo runs under one origin and one CSP.
 *
 * @param {{path: string, method: string, body?: unknown, search?: string, origin: string}} input
 */
export async function publicApi({ path, method, body, search = "", origin }) {
  if (config.mockMode) {
    const result = await mock.publicApi({ path, body: body ?? {}, origin });
    return { ...result, headers: noStore };
  }

  try {
    const response = await fetch(`${config.backendURL}${path}${search}`, {
      method,
      headers: { accept: "application/json", "content-type": "application/json" },
      body: method === "GET" || method === "HEAD" ? undefined : JSON.stringify(body ?? {}),
      signal: AbortSignal.timeout(config.upstreamTimeoutMs),
    });
    const text = await response.text();
    const contentType = response.headers.get("content-type") ?? "application/json; charset=utf-8";
    if (!contentType.includes("application/json")) {
      return { status: response.status, headers: { ...noStore, "content-type": contentType }, raw: text };
    }
    let payload;
    try {
      payload = JSON.parse(text);
    } catch {
      return { status: response.status, headers: { ...noStore, "content-type": contentType }, raw: text };
    }
    return { status: response.status, headers: noStore, json: rewriteCertificateLinks(payload, origin) };
  } catch {
    return fail(502, "The demo checkout backend is unavailable.");
  }
}

/**
 * Point certificate verification at the demo's own certificate route, so the
 * QR code and the "open certificate" link resolve inside the demo rather than
 * at a Commerce host the reader may not be able to reach.
 */
function rewriteCertificateLinks(value, origin) {
  if (!value || typeof value !== "object") return value;
  const cert = typeof value.id === "string" && typeof value.verificationUrl === "string" ? value : value.certificate;
  if (cert && typeof cert === "object" && typeof cert.id === "string") {
    cert.verificationUrl = `${origin}/certificate/${cert.id}`;
  }
  return value;
}

// ---------------------------------------------------------------------------
// GET /certificate/{id}
// ---------------------------------------------------------------------------

export async function certificatePage({ id, origin }) {
  const snapshot = config.mockMode ? mockSnapshot(id) : await liveSnapshot(id);
  return {
    status: 200,
    headers: {
      ...noStore,
      "content-type": "text/html; charset=utf-8",
      "content-security-policy": CONTENT_SECURITY_POLICY,
    },
    html: renderCertificatePage(id, { ...snapshot, origin }),
  };
}

/** Mock certificate ids carry their own purchase snapshot — see mock.mjs. */
function mockSnapshot(id) {
  const decoded = mock.decodeCertificateId(id);
  if (!decoded) return {};
  return {
    productName: decoded.product.name,
    productCategory: decoded.product.category,
    quantity: decoded.quantity,
    unitPriceUsdc: decoded.product.unitPriceUsdc,
    totalPriceUsdc: totalPriceUsdc(decoded.product, decoded.quantity),
    owner: mock.MOCK_ADDRESSES.MOCK_PAYMENT_ADDRESS,
    network: config.network,
    mintedAt: new Date(decoded.createdMs).toISOString(),
  };
}

async function liveSnapshot(id) {
  if (!/^0x[0-9a-fA-F]{64}$/.test(id)) return {};
  try {
    const response = await fetch(`${config.backendURL}/v1/public/certificates/${encodeURIComponent(id)}`, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(config.upstreamTimeoutMs),
    });
    if (!response.ok) return {};
    const cert = await response.json();
    return {
      productName: cert.productName,
      productCategory: cert.productCategory,
      quantity: cert.quantity,
      unitPriceUsdc: cert.unitPriceUsdc,
      totalPriceUsdc: cert.totalPriceUsdc,
      owner: cert.owner,
      externalOrderId: cert.externalOrderId,
      network: cert.network,
      mintedAt: cert.mintedAt ?? cert.createdAt,
      purchaseId: cert.purchaseId,
      orderScopeId: cert.orderScopeId,
      signature: cert.signature,
      metadataHash: cert.metadataHash ?? cert.voucher?.metadataHash,
    };
  } catch {
    // Unknown certificate, or the backend is unreachable: render the
    // deterministic fallback rather than an error page.
    return {};
  }
}

export { formatUsdc };
