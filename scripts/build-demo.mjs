// Assembles the static half of the demo into public/, which Vercel serves
// directly. The dynamic half lives in api/ and runs as serverless functions.
//
//   public/            <- demo/ (index.html, product.html, css, js, photography)
//   public/widget/     <- the built @bify/commerce-widget package
//
// The widget arrives as a dependency now, so its files are resolved through the
// package entry point rather than from a sibling build folder.

import { cp, mkdir, readdir, rm, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { widgetDistDir } from "./widget-dist.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const demo = resolve(root, "demo");
const out = resolve(root, "public");

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

let widgetDist;
try {
  widgetDist = widgetDistDir();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

if (!(await exists(widgetDist))) {
  console.error(`the widget package has no build output at ${widgetDist} — build @bify/commerce-widget first.`);
  process.exit(1);
}

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });

// Static storefront at the web root: /index.html, /product.html, /demo.css, ...
await cp(demo, out, { recursive: true });

// The widget is imported by the demo as /widget/index.js.
await cp(widgetDist, resolve(out, "widget"), { recursive: true });

const files = await readdir(out, { recursive: true });
console.log(`build-demo: ${files.length} files -> public/`);
