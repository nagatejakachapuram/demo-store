// Locates the built @bify/commerce-widget package.
//
// The demo consumes the widget as a dependency, so its files are found through
// the package entry point rather than by walking the filesystem — the same path
// an integrator's bundler takes.
//
// import.meta.resolve is used rather than createRequire().resolve: the package
// declares only an "import" condition in its exports map, which the CommonJS
// resolver cannot see (ERR_PACKAGE_PATH_NOT_EXPORTED).

import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

export function widgetDistDir() {
  try {
    return dirname(fileURLToPath(import.meta.resolve("@bify/commerce-widget")));
  } catch (error) {
    throw new Error(
      "@bify/commerce-widget could not be resolved. Run `npm install` at the workspace root " +
        `(BIFY-SDK/) so the demo is linked to the widget package. Cause: ${error?.message ?? error}`,
    );
  }
}
