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

/**
 * Accepts a Stripe key only if it is publishable.
 *
 * Every value this returns is served to the browser inside the checkout
 * session, so a secret key placed in a publishable slot is not a
 * misconfiguration that shows up as a broken card form — it is a live
 * credential handed to every visitor, and the page still looks fine. The two
 * key types differ by one letter in an environment variable, so the mistake is
 * easy to make and impossible to see once made.
 *
 * A rejected key disables the card rail rather than leaking: no card button is
 * strictly better than a published secret.
 */
function publishableKeyOnly(value, source) {
  const key = (value ?? "").trim();
  if (!key || key.startsWith("pk_")) return key;
  console.error(
    `${source} is not a publishable key (expected "pk_", got "${key.slice(0, 3)}…"). ` +
      "Ignoring it and disabling the card rail. If this was a secret key it has been exposed " +
      "to every browser that loaded the store — roll it in the Stripe dashboard now.",
  );
  return "";
}

export const config = {
  certificateVerificationBaseURL: (process.env.BIFY_CERTIFICATE_VERIFICATION_BASE_URL ?? "https://account.bify.io/verify").replace(/\/$/, ""),
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
   * Stripe PUBLISHABLE key (pk_...) for SIMULATED mode, where the demo server
   * mints the PaymentIntent itself. It must belong to the same Stripe account
   * as `demoStripeSecretKey` below. Publishable keys are public by design and
   * ship in client-side JS; a secret key (sk_...) must never be placed here.
   */
  demoStripeKey: publishableKeyOnly(process.env.BIFY_DEMO_STRIPE_KEY, "BIFY_DEMO_STRIPE_KEY"),

  /**
   * Stripe PUBLISHABLE key for LIVE mode — a different key, and usually a
   * different Stripe account.
   *
   * The commerce API opens a destination charge: the PaymentIntent is created
   * on the BIFY PLATFORM account, with `transfer_data[destination]` moving the
   * partner's share to their connected account and `application_fee_amount`
   * retaining the platform fee. A client secret from that intent can only be
   * confirmed with the PLATFORM account's publishable key.
   *
   * The commerce API never returns a publishable key, so the partner page has
   * to supply it. Passing a key from another account would hand Stripe.js a
   * client secret minted by an account it does not belong to, and the payment
   * would be rejected in the browser after the charge had already opened.
   *
   * Falls back to the simulated-mode key, which is correct whenever the demo
   * runs on the platform's own Stripe account — the usual case on testnet. Set
   * this explicitly once the two are different accounts.
   */
  platformStripeKey:
    publishableKeyOnly(process.env.BIFY_PLATFORM_STRIPE_PUBLISHABLE_KEY, "BIFY_PLATFORM_STRIPE_PUBLISHABLE_KEY") ||
    publishableKeyOnly(process.env.BIFY_DEMO_STRIPE_KEY, "BIFY_DEMO_STRIPE_KEY"),

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

  /**
   * Upstream request budget, under Vercel's 10s default function timeout.
   *
   * A checkout call is carrying a payment action, so it gets the larger share:
   * timing it out strands the buyer mid-purchase, and the commerce API's first
   * request after an idle period pays a cold start.
   */
  upstreamTimeoutMs: 8000,

  /**
   * The status probe blocks the storefront's first paint, so it fails fast. A
   * slow probe only mislabels the status pill; it must not hold up the page.
   */
  healthTimeoutMs: 3000,
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
  // data: carries the widget's inlined brand mark; q.stripe.com serves the
  // card-brand and wallet artwork inside the payment form.
  "img-src 'self' data: https://*.stripe.com",
  // Stripe.js runs in this document, so the frames and requests it opens are
  // governed by this policy rather than Stripe's own: m.stripe.network carries
  // the fraud signals, and r.stripe.com the error reporting. Omitting either
  // leaves the card form working but filling the console with violations.
  "connect-src 'self' https://api.stripe.com https://m.stripe.com https://r.stripe.com https://q.stripe.com",
  "frame-src https://js.stripe.com https://hooks.stripe.com https://m.stripe.network",
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
