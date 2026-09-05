// Visual-only mock mode (BIFY_DEMO_MOCK=1).
//
// Serves a fabricated but fully-shaped hosted-transfer session so every widget
// screen renders without a commerce backend or a chain. Nothing here touches
// money, a wallet, or a ledger.
//
// DESIGN NOTE — why everything is derived, not stored: on Vercel each request
// may hit a different serverless instance, so a Map written during session
// creation is not guaranteed to exist when the widget polls for status. Every
// value a later request needs is therefore *encoded in the session id* or
// *derived deterministically from it*, so any instance can reconstruct the
// whole session from the id alone. The single exception is the settlement
// clock (see settlementClock below), which is advisory and has a hard ceiling.

import { createHash, randomBytes } from "node:crypto";
import { CATALOG, clampQuantity, findProduct, productAt, productIndex, totalPriceUsdc } from "./catalog.mjs";
import { config } from "./config.mjs";

// Deterministic, format-valid placeholder addresses. Purely so the widget's
// address/hash validators pass — no chain is contacted in mock mode.
const MOCK_USDC = "0x5fbdb2315678afecb367f032d93f642f64180aa3";
const MOCK_MERCHANT_ID = `0x${"1a".repeat(32)}`;
const MOCK_BUYER = "0x70997970c51812dc3a010c7d01b50e0d17dc79c8";
const MOCK_CHECKOUT = "0x9d4454b023096f34b160d6b654540c56a1f81688";
const MOCK_ROUTER = "0x8464135c8f25da09e49bc8782676a84730c318bc";
const MOCK_PAYMENT_ADDRESS = "0x0e801d84fa97b50751dbf25036d067dcf18858bf";
const MOCK_CONTROLLER = "0x36c02da8a0983159322a80ffe9f24b1acff8b570";

const SESSION_PREFIX = "cs_demo_";
// First byte of a mock certificate id, so the certificate page can tell a
// fabricated id from a real on-chain one without asking the backend.
const CERT_MAGIC = "bf";

const b64url = {
  encode: (value) => Buffer.from(value, "utf8").toString("base64url"),
  decode: (value) => Buffer.from(value, "base64url").toString("utf8"),
};

/** Deterministic 32-byte hex derived from a session id and a label. */
function derive(seed, label) {
  return createHash("sha256").update(`${seed}::${label}`).digest("hex");
}

/** Deterministic 65-byte signature-shaped hex (r || s || v). */
function deriveSignature(seed) {
  return `0x${(derive(seed, "sig:r") + derive(seed, "sig:s") + derive(seed, "sig:v")).slice(0, 130)}`;
}

/** The card rail is only offered when this server can actually mint an intent. */
export function cardRailReady() {
  return config.demoStripeKey !== "" && config.demoStripeSecretKey !== "";
}

/**
 * Mints a REAL Stripe test-mode PaymentIntent so the widget renders the real
 * Stripe Payment Element — actual card inputs, actual validation, actual iframe.
 *
 * In live mode the commerce backend does this. Simulated mode has no backend, so
 * the demo server calls Stripe directly; it is the only way to obtain a client
 * secret, which Stripe.js requires before Elements will mount.
 *
 * USDC base units are 6dp and Stripe charges in cents (2dp), so the amount is
 * divided by 10_000: 32_000000 base units → 3200 cents → $32.00.
 */
async function createStripeIntent(order, sessionId) {
  const cents = BigInt(totalPriceUsdc(order.product, order.quantity)) / 10_000n;
  const body = new URLSearchParams({
    amount: cents.toString(),
    currency: "usd",
    "automatic_payment_methods[enabled]": "true",
    description: `${order.product.name} × ${order.quantity} (BIFY demo)`,
    "metadata[demo]": "jinked",
    "metadata[externalOrderId]": order.externalOrderId,
  });
  const response = await fetch("https://api.stripe.com/v1/payment_intents", {
    method: "POST",
    headers: {
      authorization: `Bearer ${config.demoStripeSecretKey}`,
      "content-type": "application/x-www-form-urlencoded",
      // Same order re-quoted must not open a second charge.
      "idempotency-key": `demo-intent-${sessionId}`,
    },
    body,
    signal: AbortSignal.timeout(config.upstreamTimeoutMs),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || typeof payload.client_secret !== "string") {
    // Surface Stripe's own message — usually a bad or live-mode key.
    throw new Error(payload?.error?.message ?? "Stripe declined to create the payment intent.");
  }
  return { paymentIntentId: payload.id, clientSecret: payload.client_secret };
}

// ---------------------------------------------------------------------------
// Session id encoding
// ---------------------------------------------------------------------------

/**
 * Encode the whole order into the session id so any serverless instance can
 * rebuild the session. The widget only requires a non-empty string id, so this
 * is safe; a real Commerce session id is an opaque server-side handle.
 */
export function encodeSessionId({ productId, quantity, externalOrderId, createdMs }) {
  const payload = JSON.stringify([productIndex(productId), quantity, externalOrderId, createdMs]);
  return `${SESSION_PREFIX}${b64url.encode(payload)}`;
}

/** Inverse of encodeSessionId. Returns undefined for anything unrecognised. */
export function decodeSessionId(sessionId) {
  if (typeof sessionId !== "string" || !sessionId.startsWith(SESSION_PREFIX)) return undefined;
  try {
    const [index, quantity, externalOrderId, createdMs] = JSON.parse(b64url.decode(sessionId.slice(SESSION_PREFIX.length)));
    const product = productAt(index);
    if (!product || !Number.isSafeInteger(quantity) || quantity < 1) return undefined;
    if (typeof externalOrderId !== "string" || !Number.isSafeInteger(createdMs)) return undefined;
    return { product, quantity, externalOrderId, createdMs };
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Certificate id encoding
// ---------------------------------------------------------------------------

/**
 * Mock certificate ids are real bytes32 values (the widget hash-validates them)
 * that also carry enough to re-render the certificate page statelessly:
 *
 *   byte 0      magic (0xbf)
 *   byte 1      catalogue index
 *   bytes 2-3   quantity (uint16, big endian)
 *   bytes 4-9   creation time (uint48 ms)
 *   bytes 10-31 derived hash (22 bytes)
 */
export function encodeCertificateId({ product, quantity, createdMs, seed }) {
  const index = productIndex(product.id).toString(16).padStart(2, "0");
  const qty = Math.min(quantity, 0xffff).toString(16).padStart(4, "0");
  const time = createdMs.toString(16).padStart(12, "0").slice(-12);
  return `0x${CERT_MAGIC}${index}${qty}${time}${derive(seed, "certificate").slice(0, 44)}`;
}

/** Decode a mock certificate id. Returns undefined for real (on-chain) ids. */
export function decodeCertificateId(certificateId) {
  if (typeof certificateId !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(certificateId)) return undefined;
  const body = certificateId.slice(2).toLowerCase();
  if (!body.startsWith(CERT_MAGIC)) return undefined;
  const product = productAt(Number.parseInt(body.slice(2, 4), 16));
  if (!product) return undefined;
  const quantity = Number.parseInt(body.slice(4, 8), 16) || 1;
  const createdMs = Number.parseInt(body.slice(8, 20), 16);
  return { product, quantity, createdMs: Number.isFinite(createdMs) ? createdMs : Date.now() };
}

// ---------------------------------------------------------------------------
// Settlement clock
// ---------------------------------------------------------------------------

// Advisory only. Records when a session was first polled so "payment pending"
// is visible for a beat before the mock watcher reports settlement. A warm
// serverless instance keeps this across the poll loop; a cold one restarts the
// timer, which the hard ceiling below bounds so a demo can never stall.
const firstPollAt = new Map();
const CEILING_MULTIPLIER = 5;

function hasSettled(sessionId, createdMs) {
  const now = Date.now();
  if (now - createdMs > config.settleMs * CEILING_MULTIPLIER) return true;
  const seen = firstPollAt.get(sessionId);
  if (seen === undefined) {
    firstPollAt.set(sessionId, now);
    if (firstPollAt.size > 500) firstPollAt.delete(firstPollAt.keys().next().value);
    return false;
  }
  return now - seen > config.settleMs;
}

// ---------------------------------------------------------------------------
// Session construction
// ---------------------------------------------------------------------------

export function buildSession({ product, quantity, externalOrderId, createdMs }, sessionId, status = "payment_pending", extra = {}) {
  // The card rail needs BOTH keys: the publishable key for Stripe.js in the
  // browser, and the secret key so this server can mint the PaymentIntent that
  // Elements requires. With only one of them the rail could render but never
  // take a payment, so it is not offered at all.
  const paymentMethods = cardRailReady() ? ["usdc", "card"] : ["usdc"];
  return {
    id: sessionId,
    clientToken: derive(sessionId, "client-token"),
    orderScopeId: `0x${derive(sessionId, "scope")}`,
    externalProductId: product.id,
    productName: product.name,
    productCategory: product.category,
    shippingRequired: product.shippingRequired,
    externalOrderId,
    quantity,
    paymentMethod: "usdc",
    paymentMethods,
    merchantId: MOCK_MERCHANT_ID,
    buyer: MOCK_BUYER,
    paymentMode: "hosted_transfer",
    network: config.network,
    chainId: config.chainId,
    status,
    purchaseId: `0x${derive(sessionId, "purchase")}`,
    createdAt: new Date(createdMs).toISOString(),
    expiresAt: new Date(createdMs + 30 * 60 * 1000).toISOString(),
    payment: {
      tokenSymbol: "USDC",
      tokenAddress: MOCK_USDC,
      checkoutAddress: MOCK_CHECKOUT,
      routerAddress: MOCK_ROUTER,
      totalPrice: totalPriceUsdc(product, quantity),
      unitPrice: product.unitPriceUsdc,
      paymentReferenceHash: `0x${derive(sessionId, "payref")}`,
    },
    certificate: { enabled: true },
    ...extra,
  };
}

/** Create a mock session for a validated product + quantity. */
export function createSession({ product, quantity, externalOrderId }) {
  const createdMs = Date.now();
  const order = { product, quantity: clampQuantity(product, quantity), externalOrderId, createdMs };
  const sessionId = encodeSessionId({ productId: product.id, quantity: order.quantity, externalOrderId, createdMs });
  return buildSession(order, sessionId);
}

function certificateFor(order, sessionId, origin) {
  const id = encodeCertificateId({ product: order.product, quantity: order.quantity, createdMs: order.createdMs, seed: sessionId });
  return {
    id,
    tokenURI: `${origin}/certificate/${id}`,
    metadataHash: `0x${derive(sessionId, "metadata")}`,
    purchaseId: `0x${derive(sessionId, "purchase")}`,
    orderScopeId: `0x${derive(sessionId, "scope")}`,
    signature: deriveSignature(sessionId),
    controller: MOCK_CONTROLLER,
    expiresAt: Math.floor(Date.now() / 1000) + 3600,
  };
}

// ---------------------------------------------------------------------------
// Public checkout API surface (mock)
// ---------------------------------------------------------------------------

/**
 * Answers the `/v1/public/...` routes the widget calls, statelessly.
 * `path` is the API path with no `/api/bify-api` prefix.
 */
export async function publicApi({ path, body = {}, origin }) {
  const certMatch = /\/certificates\/([^/]+)$/.exec(path);
  if (certMatch) {
    const id = decodeURIComponent(certMatch[1]);
    const decoded = decodeCertificateId(id) ?? { product: CATALOG[0], quantity: 1, createdMs: Date.now() };
    return {
      status: 200,
      json: {
        id,
        status: "issued",
        verificationUrl: `${origin}/certificate/${id}`,
        productName: decoded.product.name,
        productCategory: decoded.product.category,
        quantity: decoded.quantity,
        unitPriceUsdc: decoded.product.unitPriceUsdc,
        totalPriceUsdc: totalPriceUsdc(decoded.product, decoded.quantity),
        network: config.network,
      },
    };
  }

  const sessionMatch = /\/checkout\/sessions\/([^/]+)(?:\/(.+))?$/.exec(path);
  if (!sessionMatch) return { status: 200, json: { ok: true } };

  const sessionId = decodeURIComponent(sessionMatch[1]);
  const step = sessionMatch[2];
  const order = decodeSessionId(sessionId);
  if (!order) return { status: 404, json: { error: { message: "This checkout session is unknown." } } };

  if (step === "details") return { status: 200, json: { data: { status: "ok" } } };
  // 200 stands in for a chain that has already reached the required
  // confirmations. The real backend answers 202 while this same transaction
  // hash is still reaching finality.
  if (step === "certificate/confirm") return { status: 200, json: { ok: true } };

  if (step === "card/intent") {
    if (!cardRailReady()) {
      return { status: 503, json: { error: { message: "Card payments are not configured for this demo." } } };
    }
    try {
      return { status: 200, json: await createStripeIntent(order, sessionId) };
    } catch (error) {
      return { status: 502, json: { error: { message: String(error?.message ?? "Stripe is unavailable.") } } };
    }
  }

  if (step === "authorize") {
    // Router model: a payment authorization bound to the connected wallet.
    const payer = typeof body.payer === "string" ? body.payer : MOCK_PAYMENT_ADDRESS;
    const session = buildSession(order, sessionId);
    return {
      status: 200,
      json: {
        purchaseId: session.purchaseId,
        orderScopeId: session.orderScopeId,
        // The widget hash-validates merchantId off THIS response (not the
        // session) before building the payment authorization — see
        // src/widget.ts assertHash(auth.merchantId). Omitting it stalls
        // checkout at "Merchant ID is invalid."
        merchantId: session.merchantId,
        payer,
        buyer: payer,
        quantity: order.quantity,
        totalPaid: session.payment.totalPrice,
        paymentToken: MOCK_USDC,
        paymentReferenceHash: session.payment.paymentReferenceHash,
        paymentTransactionHash: `0x${derive(sessionId, "paytx")}`,
        expiresAt: Math.floor(Date.parse(session.expiresAt) / 1000),
        signature: deriveSignature(sessionId),
        router: MOCK_ROUTER,
        checkout: MOCK_CHECKOUT,
      },
    };
  }

  if (step === "certificate/voucher") {
    const cert = certificateFor(order, sessionId, origin);
    return {
      status: 200,
      json: {
        certificateId: cert.id,
        purchaseId: cert.purchaseId,
        orderScopeId: cert.orderScopeId,
        buyer: MOCK_PAYMENT_ADDRESS,
        tokenURI: cert.tokenURI,
        metadataHash: cert.metadataHash,
        expiresAt: cert.expiresAt,
        signature: cert.signature,
        controller: cert.controller,
      },
    };
  }

  if (step === undefined) {
    // Status poll — simulate the chain watcher.
    if (!hasSettled(sessionId, order.createdMs)) {
      return { status: 200, json: buildSession(order, sessionId, "payment_pending") };
    }
    const cert = certificateFor(order, sessionId, origin);
    return {
      status: 200,
      json: buildSession(order, sessionId, "settled", {
        certificateId: cert.id,
        transactionHash: `0x${derive(sessionId, "settletx")}`,
      }),
    };
  }

  return { status: 200, json: { ok: true } };
}

export const MOCK_ADDRESSES = { MOCK_PAYMENT_ADDRESS, MOCK_BUYER };
export { randomBytes };
