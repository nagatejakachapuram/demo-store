# Jinked — the BIFY demo store

A working storefront built on the BIFY SDKs: 15 products, USDC checkout on Base,
and a certificate of authenticity minted to the buyer's wallet. It is the
reference integration the documentation links to.

```
demo/          storefront (static): pages, styles, product photography
demo-server/   shared server logic — the ONLY place demo behaviour lives
scripts/       dev-server.mjs (local adapter), build-demo.mjs (static assembly)
api/           Vercel serverless functions (adapters over demo-server/)
```

`scripts/dev-server.mjs` and `api/*.js` are thin adapters over the same
`demo-server/handlers.mjs`, so local and deployed cannot drift apart.

## Why this is a separate package

It consumes the SDKs exactly as an integrator does — `@bify/sdk` on the server,
`@bify/commerce-widget` in the browser, both as ordinary dependencies. Nothing
here is published.

Keeping it out of the widget package matters for two reasons. The published
package stays free of a Vercel config, serverless functions and ~3 MB of
photography that no integrator wants. And the demo can only reach the widget
through its public entry point, so anything the package fails to export breaks
the demo build — the same failure an integrator would hit, caught here instead
of after publishing.

## What this demonstrates

The store owns its catalogue, prices, and product pages. BIFY receives an order
snapshot and handles checkout, settlement, and certificate issuance.

Two details worth copying:

- **The partner API key stays server-side.** `POST /api/checkout-session` is the
  only route that holds it. The browser sends a product id and a quantity; the
  price is read from `demo-server/catalog.mjs`, never from the request body, so
  a tampered client cannot mint a cheap session. This is why the demo has a
  server at all — not because the data is real.
- **The widget owns checkout.** The product page renders no buy button and no
  quantity stepper of its own; both belong to the widget. Duplicating either
  gives the buyer two controls for one decision and two sources of truth for the
  order total.

## Run it locally

Install once from the workspace root (`BIFY-SDK/`), which links the two SDK
packages and builds the widget:

```bash
npm install
```

Then, from this directory — against a commerce backend on `:8081`:

```bash
npm run dev
```

Simulated — no backend, no chain, every screen still renders:

```bash
npm run dev:mock
```

Simulated mode fabricates a fully-shaped session. Nothing is charged and no
chain is contacted; the banner and the status pill say so on every page.

## Deploy to Vercel

The demo depends on the two sibling workspace packages, so the build needs the
whole `BIFY-SDK/` folder, not just this one.

1. **Root Directory**: `BIFY-SDK/Bify-Demo-Store`
2. Enable **Include files outside the root directory in the Build Step**
   (Vercel detects the workspace root at `BIFY-SDK/package.json`).
3. Build command and output directory come from `vercel.json`
   (`npm run build` → `public/`).

The widget must be built before this package is assembled. `@bify/commerce-widget`
carries a `prepare` script, so `npm install` compiles it automatically — including
on Vercel.

### Environment variables

| Variable | Required | Notes |
| --- | --- | --- |
| `BIFY_BACKEND_URL` | yes | e.g. `https://api.bify.io`. Must be HTTPS (or `http://localhost:PORT`). |
| `BIFY_PARTNER_API_KEY` | yes | **Secret.** Never returned to the browser. |
| `BIFY_PARTNER_ID` | no | Display only. |
| `BIFY_DEMO_MOCK` | no | `1` forces simulated mode. Keep it available so a wedged testnet does not take the docs link dark. |
| `BIFY_DEMO_STRIPE_KEY` | no | Stripe **publishable** key (`pk_...`), used by Stripe.js in the browser. A secret key here would be served to the browser — never set one. |
| `BIFY_DEMO_STRIPE_SECRET_KEY` | no | Stripe **secret** test key (`sk_test_...`), server-side only. Needed for the card rail in simulated mode — see below. |
| `BIFY_DEMO_SETTLE_MS` | no | Simulated settlement delay, default `2500`. |

### The card rail

The widget renders Stripe's real Payment Element, which will not mount without a
PaymentIntent **client secret**. A publishable key cannot mint one — Stripe
requires a secret key for `POST /v1/payment_intents` — so the two modes differ:

- **Live mode**: the commerce backend mints the intent (`BIFY_STRIPE_SECRET_KEY`
  on the backend). The demo only needs `BIFY_DEMO_STRIPE_KEY`.
- **Simulated mode**: there is no backend, so the demo server mints a real
  **test-mode** intent itself against `api.stripe.com`. That needs
  `BIFY_DEMO_STRIPE_SECRET_KEY`.

With both keys set the buyer sees the genuine Stripe card form and can pay with
Stripe's test card `4242 4242 4242 4242` (any future expiry, any CVC). With
either key missing the rail is **hidden**, not shown broken — a card option that
cannot take a payment is worse than no card option.

Amounts are converted from USDC base units (6dp) to Stripe cents (2dp) by
dividing by 10,000: `32_000000` → `3200` → $32.00.

Use a **test** key only. This demo settles no real money on either rail.

### Routes

| Route | Handler | Holds the API key? |
| --- | --- | --- |
| `GET /api/demo-config` | catalogue + settlement status | no |
| `POST /api/checkout-session` | mints a checkout session via `@bify/sdk` | **yes** |
| `ALL /api/bify-api/*` | passthrough to the public checkout API | no (client token) |
| `GET /certificate/{id}` | certificate of authenticity page | no |

## Serverless constraints worth knowing

Vercel functions are stateless, so nothing in the demo relies on server memory
between requests:

- **Session ids carry the order.** In simulated mode the id encodes the
  catalogue index, quantity, order reference, and creation time, so any instance
  can rebuild the session from the id alone.
- **Certificate ids carry the purchase.** A simulated certificate id is a real
  `bytes32` whose leading bytes encode product, quantity, and timestamp — which
  is why `/certificate/{id}` renders the correct purchase on a cold instance.
- The one exception is the simulated settlement clock, which is advisory and
  bounded by a hard ceiling so a cold start can never stall checkout.

In live mode both come from the commerce backend and none of this applies.

## Content Security Policy

Defined once in `demo-server/config.mjs` and mirrored in `vercel.json`, so a
policy problem shows up in `npm run dev` rather than after a deploy. Product
photography is self-hosted, so `img-src` stays at `'self'`. `js.stripe.com` and
`api.stripe.com` are allowed because the widget loads Stripe when the card rail
is configured — drop them if you never enable it.

## Changing the catalogue

`demo-server/catalog.mjs` is the single source of truth. Add an entry and drop a
matching `demo/img/<product-id>.jpg` (4:5, ~1100×1375); the image path is
derived from the product id. See `demo/img/CREDITS.md` for the current
photography and its licence.
