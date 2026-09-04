// Shared storefront helpers.
//
// The catalogue is fetched from the partner server rather than hardcoded here,
// because the server is the price authority: whatever the browser thinks a
// product costs, the checkout session is priced from the server-side catalogue.

/** @type {Promise<any> | undefined} */
let configPromise;

export function loadConfig() {
  configPromise ??= fetch("/api/demo-config", { headers: { accept: "application/json" }, cache: "no-store" }).then(
    async (response) => {
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error?.message ?? "The demo store is not ready.");
      return payload;
    },
  );
  return configPromise;
}

export function formatUsdc(base) {
  try {
    const amount = BigInt(base);
    const whole = amount / 1_000_000n;
    const fraction = (amount % 1_000_000n).toString().padStart(6, "0").replace(/0+$/, "");
    return `${whole}${fraction ? `.${fraction}` : ""} USDC`;
  } catch {
    return "— USDC";
  }
}

const STATUS_LABEL = {
  connected: "Base Sepolia · live",
  simulated: "Simulated · no chain",
  unavailable: "Backend unavailable",
};

/**
 * Give a notice a dismiss control.
 *
 * Built as a real <button> rather than a styled glyph so it is reachable by
 * keyboard and announced as a control; the × itself is aria-hidden because
 * "times" is not a useful thing for a screen reader to read out.
 */
export function makeDismissible(node, label = "Dismiss this message") {
  if (!node || node.querySelector("[data-dismiss]")) return;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "notice-dismiss";
  button.setAttribute("data-dismiss", "");
  button.setAttribute("aria-label", label);
  button.innerHTML = '<span aria-hidden="true">×</span>';
  button.addEventListener("click", () => {
    node.hidden = true;
  });
  node.appendChild(button);
}

/** Paint the header status pill and the simulated-mode banner. */
export function renderStatus(config) {
  const pill = document.querySelector("[data-status-pill]");
  if (pill) {
    pill.dataset.status = config.backend;
    pill.textContent = STATUS_LABEL[config.backend] ?? config.backend;
    pill.hidden = false;
  }

  const banner = document.querySelector("[data-sim-banner]");
  if (!banner) return;
  if (config.backend === "simulated") {
    banner.innerHTML =
      "<b>Simulated mode.</b> No payment is taken, no wallet is charged, and no chain is contacted — this run demonstrates the checkout screens only.";
    banner.hidden = false;
    makeDismissible(banner, "Dismiss the simulated mode notice");
  } else if (config.backend === "unavailable") {
    banner.innerHTML = `<b>Checkout is offline.</b> ${escapeHtml(config.error?.message ?? "The commerce backend could not be reached.")}`;
    banner.hidden = false;
    makeDismissible(banner, "Dismiss the offline notice");
  }
}

export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
}

export function showFatal(message) {
  const node = document.querySelector("[data-demo-error]");
  if (!node) return;
  node.hidden = false;
  // textContent wipes any previous dismiss button, so it is re-added after.
  node.textContent = message;
  makeDismissible(node, "Dismiss this error");
}
