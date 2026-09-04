// ALL /api/bify-api/* — same-origin passthrough to the public checkout API.
//
// These routes are authenticated by the session's client token, not by the
// partner key, so nothing secret passes through here. The proxy exists so the
// demo runs under a single origin and a single CSP.
import { publicApi } from "../../demo-server/handlers.mjs";
import { guard, jsonBody, requestOrigin, sendResult } from "../../demo-server/vercel.mjs";

export default guard(async (req, res) => {
  const segments = req.query?.path ?? [];
  const path = `/${(Array.isArray(segments) ? segments : [segments]).join("/")}`;

  // Forward the upstream query string, minus the catch-all's own `path` param.
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
