// Product page: renders one catalogue item and hands checkout to the widget.
//
// The BIFY-specific part is startCheckout() at the bottom: mint a session on
// the partner server, mount the widget with it. The partner API key is never
// on this page — the session is created server-side and only `{id, clientToken}`
// and the public order snapshot reach the browser.
//
// The widget owns quantity and the pay action. The store does not render its
// own quantity stepper or its own buy button; duplicating either would mean two
// controls for one decision, and two sources of truth for the order total.

import { mountBifyCommerce } from "/widget/index.js";
import { escapeHtml, formatUsdc, loadConfig, makeDismissible, renderStatus, showFatal } from "/store.js";

const $ = (selector) => document.querySelector(selector);
const errorNode = $("[data-demo-error]");

const COLLECTION_LABEL = {
  apparel: "Apparel",
  headwear: "Headwear",
  accessories: "Accessories",
  drinkware: "Objects",
  print: "Prints",
  membership: "Membership",
};

function paintProduct(product) {
  document.title = `${product.name} — Jinked`;
  $("[data-visual]").innerHTML =
    `<img src="${escapeHtml(product.image)}" alt="${escapeHtml(product.name)}" fetchpriority="high" decoding="async" width="1100" height="1375">`;
  $("[data-eyebrow]").textContent = COLLECTION_LABEL[product.category] ?? product.category;
  $("[data-name]").textContent = product.name;
  $("[data-price]").textContent = formatUsdc(product.unitPriceUsdc);
  $("[data-description]").textContent = product.description;
  $("[data-spec]").innerHTML = product.details.map((line) => `<div>${escapeHtml(line)}</div>`).join("");
  $("[data-note]").textContent = product.shippingRequired
    ? "Ships worldwide. A certificate of authenticity is issued to your wallet after settlement."
    : "Digital — nothing ships. The certificate issued to your wallet is the pass.";
  $("[data-product]").hidden = false;
}

/**
 * A simulated EIP-1193 wallet, used ONLY in simulated mode so the router
 * payment flow (approve USDC → payHostedOrder → mint certificate) can be seen
 * end to end without a wallet extension. Never used against a live backend.
 */
function demoWalletProvider() {
  const account = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
  const randomHash = () =>
    "0x" + Array.from(crypto.getRandomValues(new Uint8Array(32))).map((b) => b.toString(16).padStart(2, "0")).join("");
  return {
    request: async ({ method, params }) => {
      if (method === "eth_requestAccounts" || method === "eth_accounts") return [account];
      if (method === "eth_chainId") return "0x14a34"; // 84532
      if (method === "wallet_switchEthereumChain" || method === "wallet_addEthereumChain") return null;
      if (method === "eth_sendTransaction") return randomHash();
      if (method === "eth_getTransactionReceipt") {
        return { transactionHash: params?.[0] ?? "0x" + "0".repeat(64), status: "0x1", blockNumber: "0x10" };
      }
      throw new Error(`unsupported wallet method: ${method}`);
    },
  };
}

// --- BIFY integration ------------------------------------------------------

async function startCheckout(product, config) {
  const response = await fetch("/api/checkout-session", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    credentials: "same-origin",
    cache: "no-store",
    body: JSON.stringify({
      productId: product.id,
      quantity: 1,
      externalOrderId: `jinked-${crypto.randomUUID()}`,
    }),
  });
  const session = await response.json().catch(() => ({}));
  if (!response.ok || !session.id || !session.clientToken) {
    throw new Error(session.error?.message ?? "Checkout is unavailable right now.");
  }

  mountBifyCommerce({
    element: $("#bify-checkout"),
    session,
    // Present only when the demo is configured with a Stripe publishable key.
    stripePublishableKey: session.demoPublishableKey,
    // Same-origin passthrough to the public checkout API, so the demo runs
    // under one origin and one CSP.
    publicApiBaseUrl: "/api/bify-api",
    // The widget re-quotes here when the buyer changes quantity. It posts only
    // `{externalOrderId, quantity}`, so the product travels in the query string.
    sessionRefreshEndpoint: `/api/checkout-session?productId=${encodeURIComponent(product.id)}`,
    // No displayTotal: the widget derives the amount from the session so it
    // stays correct when the buyer changes quantity.
    theme: "light",
    themeToggle: true,
    shippingRequired: session.shippingRequired ?? product.shippingRequired,
    provider: config.mock ? demoWalletProvider() : undefined,
    onState: (state, message) => {
      const failed = state === "error";
      errorNode.hidden = !failed;
      errorNode.textContent = failed ? message : "";
      if (failed) makeDismissible(errorNode, "Dismiss this error");
    },
  });
}

async function start() {
  try {
    const config = await loadConfig();
    renderStatus(config);

    const id = new URLSearchParams(location.search).get("id");
    const product = (config.catalog ?? []).find((item) => item.id === id);
    if (!product) {
      showFatal("That product is not in the catalogue. Head back to the shop.");
      return;
    }

    paintProduct(product);
    await startCheckout(product, config);
  } catch (error) {
    showFatal(error instanceof Error ? error.message : "The demo store could not load.");
  }
}

void start();
