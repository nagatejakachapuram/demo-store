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
import { guard, rawBody, requestOrigin, sendResult } from "../demo-server/vercel.mjs";

const MOUNT = "/api/bify-api";

/**
 * The upstream path this request is asking for.
 *
 * The rewrite normally supplies it in `req.query.path`, but the request URL
 * still carries it too. Reading the URL as a fallback keeps the proxy working
 * if the capture is ever absent, rather than quietly forwarding "/" — which
 * upstream answers with a health page, not an error, so the widget would fail
 * with an unrelated message.
 */
function upstreamPath(req, url) {
  const captured = req.query?.path;
  const segments = Array.isArray(captured) ? captured : captured ? [captured] : [];
  const joined = segments.join("/").replace(/^\/+/, "");
  if (joined) return `/${joined}`;
  const fromUrl = url.pathname.startsWith(`${MOUNT}/`) ? url.pathname.slice(MOUNT.length) : "";
  return fromUrl === "/" ? "" : fromUrl;
}

export default guard(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  const path = upstreamPath(req, url);
  if (!path) {
    res.setHeader("cache-control", "no-store");
    res.status(404).json({ error: { message: "Unknown checkout API route." } });
    return;
  }

  // Forward the original upstream query string, minus the rewrite's path
  // capture. Vercel preserves incoming query parameters across rewrites.
  url.searchParams.delete("path");
  const search = url.searchParams.toString();

  // Forwarded verbatim: this route relays the buyer's client token and customer
  // details upstream, so it never parses what it is carrying.
  sendResult(
    res,
    await publicApi({
      path,
      method: req.method ?? "GET",
      body: await rawBody(req),
      search: search ? `?${search}` : "",
      origin: requestOrigin(req),
    }),
  );
});
