// Canonical demo catalogue.
//
// The partner (here: the "Jinked" demo store) owns product identity, price, and
// inventory — BIFY never sees a catalogue. Prices are authoritative on the
// server so a tampered browser cannot mint a cheap checkout session: every
// session is priced from this file, keyed by product id.
//
// Amounts are USDC base units (6 decimals): 68_000000 === 68.00 USDC.

/**
 * @typedef {object} DemoProduct
 * @property {string} id            Partner-side product id (externalProductId).
 * @property {string} name
 * @property {string} category      Partner taxonomy, echoed onto the purchase record.
 * @property {string} unitPriceUsdc Base units, as a decimal string.
 * @property {boolean} shippingRequired
 * @property {string} blurb         One line, shown on the shop grid.
 * @property {string} description   Product page copy.
 * @property {string[]} details     Spec bullets.
 * @property {string} image         Product photograph, served from demo/img/.
 * @property {string} [badge]
 * @property {number} maxQuantity
 */

/** @type {DemoProduct[]} */
export const CATALOG = [
  {
    id: "jinked-heavyweight-hoodie",
    name: "Heavyweight Hoodie",
    category: "apparel",
    unitPriceUsdc: "68000000",
    shippingRequired: true,
    blurb: "480gsm loopback cotton, boxy fit.",
    description:
      "A 480gsm loopback cotton hoodie cut boxy through the body with a double-layer hood and ribbed cuffs. Garment-dyed in small batches, so no two runs match exactly.",
    details: ["480gsm loopback cotton", "Boxy fit — size down for a regular fit", "Garment-dyed, small batch", "Ships worldwide"],
    badge: "Best seller",
    maxQuantity: 5,
  },
  {
    id: "jinked-boxy-tee",
    name: "Boxy Logo Tee",
    category: "apparel",
    unitPriceUsdc: "32000000",
    shippingRequired: true,
    blurb: "220gsm combed cotton, dropped shoulder.",
    description:
      "220gsm combed cotton with a dropped shoulder and a wide ribbed collar that holds its shape. Screen-printed chest mark, washed soft before it ships.",
    details: ["220gsm combed cotton", "Dropped shoulder, wide collar", "Screen-printed chest mark", "Pre-washed"],
    maxQuantity: 10,
  },
  {
    id: "jinked-longsleeve-tee",
    name: "Longsleeve Tee",
    category: "apparel",
    unitPriceUsdc: "42000000",
    shippingRequired: true,
    blurb: "Ribbed cuffs, sleeve-print edition.",
    description:
      "The boxy tee pattern extended to a full sleeve with ribbed cuffs and a wrapped sleeve print. Cut long enough to layer without riding up.",
    details: ["220gsm combed cotton", "Ribbed cuffs", "Wrapped sleeve print", "Layering length"],
    maxQuantity: 10,
  },
  {
    id: "jinked-coach-jacket",
    name: "Coach Jacket",
    category: "apparel",
    unitPriceUsdc: "95000000",
    shippingRequired: true,
    blurb: "Water-repellent shell, flannel lined.",
    description:
      "A water-repellent nylon shell over a brushed flannel lining, with snap closure and hand-warmer pockets. Embroidered back panel, one colourway per season.",
    details: ["Water-repellent nylon shell", "Brushed flannel lining", "Snap closure", "Embroidered back panel"],
    badge: "Seasonal",
    maxQuantity: 3,
  },
  {
    id: "jinked-fleece-sweatpants",
    name: "Fleece Sweatpants",
    category: "apparel",
    unitPriceUsdc: "62000000",
    shippingRequired: true,
    blurb: "Brushed-back fleece, tapered leg.",
    description:
      "Brushed-back fleece with a tapered leg, elastic waist, and a zip pocket that actually holds a phone. Cut to sit with the hoodie without bunching.",
    details: ["Brushed-back fleece", "Tapered leg, elastic waist", "Zip side pocket", "Matches the hoodie dye lot"],
    maxQuantity: 5,
  },
  {
    id: "jinked-corduroy-cap",
    name: "Corduroy Cap",
    category: "headwear",
    unitPriceUsdc: "38000000",
    shippingRequired: true,
    blurb: "6-panel wide-wale cord, brass clasp.",
    description:
      "A six-panel cap in wide-wale corduroy with a soft unstructured crown and a brass clasp strap. Breaks in fast and keeps its shape.",
    details: ["Wide-wale corduroy", "Six panel, unstructured crown", "Brass clasp strap", "One size, adjustable"],
    maxQuantity: 6,
  },
  {
    id: "jinked-ribbed-beanie",
    name: "Ribbed Beanie",
    category: "headwear",
    unitPriceUsdc: "28000000",
    shippingRequired: true,
    blurb: "Merino blend, woven label cuff.",
    description:
      "A merino-blend rib knit with a deep fold cuff and a woven label. Warm without the itch, and it does not stretch out after a season.",
    details: ["Merino blend rib knit", "Deep fold cuff", "Woven label", "One size"],
    maxQuantity: 6,
  },
  {
    id: "jinked-bucket-hat",
    name: "Bucket Hat",
    category: "headwear",
    unitPriceUsdc: "34000000",
    shippingRequired: true,
    blurb: "Reversible cotton twill.",
    description:
      "Reversible cotton twill — solid on one face, all-over print on the other. Stitched brim holds a shape rather than flopping flat.",
    details: ["Reversible cotton twill", "Stitched brim", "Two looks in one", "S/M and L/XL"],
    maxQuantity: 6,
  },
  {
    id: "jinked-canvas-tote",
    name: "Canvas Tote",
    category: "accessories",
    unitPriceUsdc: "24000000",
    shippingRequired: true,
    blurb: "16oz cotton canvas, boxed base.",
    description:
      "16oz cotton canvas with a boxed base so it stands up when loaded, reinforced handles, and an interior slip pocket. Deliberately unbranded except for a small hem mark.",
    details: ["16oz cotton canvas", "Boxed base", "Reinforced handles", "Interior slip pocket"],
    maxQuantity: 10,
  },
  {
    id: "jinked-enamel-pin-set",
    name: "Enamel Pin Set",
    category: "accessories",
    unitPriceUsdc: "14000000",
    shippingRequired: true,
    blurb: "Three hard-enamel pins, backing card.",
    description:
      "Three hard-enamel pins on a printed backing card, each with a rubber clutch and a polished nickel edge. Sold only as a set.",
    details: ["Three hard-enamel pins", "Polished nickel edge", "Rubber clutch backs", "Printed backing card"],
    maxQuantity: 12,
  },
  {
    id: "jinked-sticker-pack",
    name: "Sticker Pack",
    category: "accessories",
    // Priced at 1 USDC so a live Base Sepolia purchase costs a single faucet
    // unit. Every other item is priced realistically; this is the one a visitor
    // can afford to take end to end on testnet.
    unitPriceUsdc: "1000000",
    shippingRequired: true,
    blurb: "Eight die-cut vinyl stickers.",
    description:
      "Eight die-cut vinyl stickers with a matte laminate, rated for outdoor use. Survives a laptop lid and a dishwasher-adjacent water bottle.",
    details: ["Eight die-cut vinyl stickers", "Matte laminate", "Outdoor rated", "Assorted sizes"],
    maxQuantity: 20,
  },
  {
    id: "jinked-ceramic-mug",
    name: "Ceramic Mug",
    category: "drinkware",
    unitPriceUsdc: "22000000",
    shippingRequired: true,
    blurb: "12oz stoneware, reactive glaze.",
    description:
      "12oz stoneware with a reactive glaze, so the surface pools differently on every piece. Heavy base, wide handle, dishwasher safe.",
    details: ["12oz stoneware", "Reactive glaze — each piece varies", "Wide handle, heavy base", "Dishwasher safe"],
    maxQuantity: 8,
  },
  {
    id: "jinked-insulated-bottle",
    name: "Insulated Bottle",
    category: "drinkware",
    unitPriceUsdc: "36000000",
    shippingRequired: true,
    blurb: "18oz vacuum steel, powder coat.",
    description:
      "18oz double-wall vacuum steel with a powder-coated finish and a leakproof lid. Cold for a day, hot for half of one.",
    details: ["18oz double-wall vacuum steel", "Powder-coated finish", "Leakproof lid", "Fits a standard cup holder"],
    maxQuantity: 8,
  },
  {
    id: "jinked-riso-print",
    name: "Risograph Print",
    category: "print",
    unitPriceUsdc: "45000000",
    shippingRequired: true,
    blurb: "A3, two-colour, edition of 100.",
    description:
      "A3 two-colour risograph on 120gsm stock, hand-numbered in an edition of 100. Riso ink offsets slightly by design — every print sits a hair off register.",
    details: ["A3, 120gsm stock", "Two-colour risograph", "Hand-numbered, edition of 100", "Ships flat in a rigid mailer"],
    badge: "Limited",
    maxQuantity: 2,
  },
  {
    id: "jinked-founders-pass",
    name: "Founders Access Pass",
    category: "membership",
    unitPriceUsdc: "120000000",
    shippingRequired: false,
    blurb: "Digital pass — early drops, no shipping.",
    description:
      "A digital membership pass: early access to every drop, first refusal on limited runs, and entry to the members' archive. Nothing ships — the certificate is the pass.",
    details: ["Digital only — no shipping step", "Early access to drops", "First refusal on limited runs", "Members' archive access"],
    badge: "Digital",
    maxQuantity: 1,
  },
];

/** @type {Map<string, DemoProduct>} */
const BY_ID = new Map(CATALOG.map((product) => [product.id, product]));

/** Look up a product by its partner-side id. Returns undefined when unknown. */
export function findProduct(id) {
  return typeof id === "string" ? BY_ID.get(id) : undefined;
}

/** The catalogue index of a product, used by the mock certificate encoding. */
export function productIndex(id) {
  return CATALOG.findIndex((product) => product.id === id);
}

export function productAt(index) {
  return CATALOG[index];
}

/** Clamp a requested quantity to the product's per-order limit. */
export function clampQuantity(product, requested) {
  const max = product?.maxQuantity ?? 1;
  if (!Number.isSafeInteger(requested) || requested < 1) return 1;
  return Math.min(requested, max);
}

/** Total price in base units for a quantity, as a decimal string. */
export function totalPriceUsdc(product, quantity) {
  return (BigInt(product.unitPriceUsdc) * BigInt(quantity)).toString();
}

/** Render USDC base units as a human amount, e.g. "68 USDC" / "9.5 USDC". */
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

/**
 * The catalogue as the browser sees it (identical — there is nothing secret
 * here), with the derived fields the storefront needs. Photography is served
 * from the demo's own origin, one file per product id, so the page needs no
 * third-party image host and the CSP stays at `img-src 'self'`.
 */
export function publicCatalog() {
  return CATALOG.map((product) => ({
    ...product,
    image: `/img/${product.id}.jpg`,
    unitPriceLabel: formatUsdc(product.unitPriceUsdc),
  }));
}
