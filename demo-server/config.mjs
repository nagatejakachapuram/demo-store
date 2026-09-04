// Demo runtime configuration, read from the environment.
//
// This module is imported by BOTH the local dev server and the Vercel
// serverless functions, so the two deployments can never drift apart. On Vercel
// these come from the project's Environment Variables; locally they come from
// `local.env` (loaded by `npm run dev`).
//
// The partner API key is a SECRET. It is read here, on the server, and is never
// included in any response body. That is the whole reason this demo has a
// server side at all — a demo that put the key in the browser would be teaching
// integrators the wrong pattern.

const truthy = (value) => /^(1|true|yes|on)$/i.test((value ?? "").trim());

export const config = {
  /** Commerce API base. Defaults to the local backend for `npm run dev`. */
  backendURL: (process.env.BIFY_BACKEND_URL ?? "http://localhost:8081").replace(/\/$/, ""),
  partnerID: process.env.BIFY_PARTNER_ID ?? "partner_123",
  partnerAPIKey: process.env.BIFY_PARTNER_API_KEY ?? "dev_partner_key",

  /**
   * Visual-only mock mode. When on, the demo never contacts the commerce
   * backend or any chain: it serves a fabricated but fully-shaped session so
   * every widget screen renders. Kept available in production as a fallback so
   * a wedged testnet does not take the documentation link dark.
   */
  mockMode: truthy(process.env.BIFY_DEMO_MOCK),

  /**
   * Stripe PUBLISHABLE key (pk_...). Publishable keys are public by design and
   * ship in client-side JS. Setting this renders the card rail alongside USDC.
   * A secret key (sk_...) must never be placed here.
   */
  demoStripeKey: (process.env.BIFY_DEMO_STRIPE_KEY ?? "").trim(),

  /**
   * Stripe SECRET key (sk_test_...), server-side only.
   *
   * Simulated mode has no commerce backend, so the demo server mints the
   * PaymentIntent itself against Stripe's test API. A publishable key cannot do
   * this — Stripe requires a secret key for POST /v1/payment_intents — so
   * without this the card rail cannot produce a client secret and is hidden
   * rather than shown broken. Use a TEST key only; this demo takes no real
   * money. In live mode the commerce backend mints the intent and this is
   * ignored.
   */
  demoStripeSecretKey: (process.env.BIFY_DEMO_STRIPE_SECRET_KEY ?? "").trim(),

  /** How long mock mode waits before reporting a settled payment. */
  settleMs: Number.parseInt(process.env.BIFY_DEMO_SETTLE_MS ?? "2500", 10),

  network: "base-sepolia",
  chainId: 84532,

  /** Upstream request budget. Vercel's default function timeout is 10s. */
  upstreamTimeoutMs: 5000,
};

/**
 * Content-Security-Policy for every demo page.
 *
 * Kept in one place and mirrored verbatim in vercel.json, so a policy problem
 * shows up in `npm run dev` rather than only after a deploy. Stripe's origins
 * are allowed because the widget loads js.stripe.com when the card rail is
 * configured; drop them if you never enable it.
 */
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' https://js.stripe.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "connect-src 'self' https://api.stripe.com",
  "frame-src https://js.stripe.com https://hooks.stripe.com",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
].join("; ");

/**
 * Absolute origin of the running demo, used to build certificate verification
 * URLs that resolve back to this deployment. Derived per request because a
 * Vercel deployment answers on several hostnames (preview, alias, custom).
 */
export function originFromHeaders(headers, fallback = "http://localhost:3000") {
  const host = headers["x-forwarded-host"] ?? headers.host;
  if (!host) return fallback;
  const forwardedProto = headers["x-forwarded-proto"];
  const proto = forwardedProto
    ? String(forwardedProto).split(",")[0].trim()
    : /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(String(host))
      ? "http"
      : "https";
  return `${proto}://${host}`;
}
