// ALL /api/bify-api/* — same-origin passthrough to the public checkout API.
//
// vercel.json rewrites the nested public API path to this single function and
// carries the unmatched suffix in `req.query.path`. Keeping one concrete
// function endpoint avoids relying on framework-style `[...path]` routing in a
// framework-less Vercel project.
//
// These routes are authenticated by the session's client token, not by the
// partner key, so nothing secret passes through here. The proxy exists so the
// demo runs under a single origin and a single CSP.
import { publicApi } from "../demo-server/handlers.mjs";
import { guard, jsonBody, requestOrigin, sendResult } from "../demo-server/vercel.mjs";

export default guard(async (req, res) => {
  const segments = req.query?.path ?? [];
  const path = `/${(Array.isArray(segments) ? segments : [segments]).join("/")}`;

  // Forward the original upstream query string, minus the rewrite's path
  // capture. Vercel preserves incoming query parameters across rewrites.
  const url = new URL(req.url ?? "/", "http://localhost");
  url.searchParams.delete("path");
  const search = url.searchParams.toString();

  const body = await jsonBody(req);
  sendResult(
    res,
    await publicApi({
      path,
      method: req.method ?? "GET",
      body,
      search: search ? `?${search}` : "",
      origin: requestOrigin(req),
    }),
  );
});
