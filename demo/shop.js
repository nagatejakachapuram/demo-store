// Shop grid: catalogue, collection filter, product links.
// Pure partner-side storefront code — no BIFY SDK involved until checkout.

import { escapeHtml, formatUsdc, loadConfig, renderStatus, showFatal } from "/store.js";

const grid = document.querySelector("[data-grid]");
const filterBar = document.querySelector("[data-filters]");
const countNode = document.querySelector("[data-count]");

const COLLECTION_LABEL = {
  all: "All",
  apparel: "Apparel",
  headwear: "Headwear",
  accessories: "Accessories",
  drinkware: "Objects",
  print: "Prints",
  membership: "Membership",
};

function card(product, eager) {
  const badge = product.badge ? `<span class="badge">${escapeHtml(product.badge)}</span>` : "";
  return `<a class="card" href="/product.html?id=${encodeURIComponent(product.id)}">
    <div class="card-art">
      <img src="${escapeHtml(product.image)}" alt="${escapeHtml(product.name)}"
           loading="${eager ? "eager" : "lazy"}" decoding="async" width="1100" height="1375">
      ${badge}
    </div>
    <div class="card-body">
      <h2 class="card-name">${escapeHtml(product.name)}</h2>
      <span class="card-price">${escapeHtml(formatUsdc(product.unitPriceUsdc))}</span>
      <p class="card-blurb">${escapeHtml(product.blurb)}</p>
    </div>
  </a>`;
}

function render(catalog, collection) {
  const shown = collection === "all" ? catalog : catalog.filter((product) => product.category === collection);
  grid.innerHTML = shown.length
    ? shown.map((product, i) => card(product, i < 4)).join("")
    : `<p class="empty">Nothing in this collection yet.</p>`;
  countNode.textContent = `${shown.length} ${shown.length === 1 ? "piece" : "pieces"}`;
}

function renderFilters(catalog, onSelect) {
  const collections = ["all", ...new Set(catalog.map((product) => product.category))];
  filterBar.innerHTML = collections
    .map(
      (key) =>
        `<button type="button" class="filter" data-collection="${escapeHtml(key)}" aria-pressed="${key === "all"}">${escapeHtml(
          COLLECTION_LABEL[key] ?? key,
        )}</button>`,
    )
    .join("");

  filterBar.addEventListener("click", (event) => {
    const button = event.target.closest("[data-collection]");
    if (!button) return;
    for (const node of filterBar.querySelectorAll("[data-collection]")) {
      node.setAttribute("aria-pressed", String(node === button));
    }
    onSelect(button.dataset.collection);
  });
}

async function start() {
  try {
    const config = await loadConfig();
    renderStatus(config);
    const catalog = config.catalog ?? [];
    renderFilters(catalog, (collection) => render(catalog, collection));
    render(catalog, "all");
  } catch (error) {
    grid.innerHTML = "";
    showFatal(error instanceof Error ? error.message : "The demo store could not load.");
  }
}

void start();
