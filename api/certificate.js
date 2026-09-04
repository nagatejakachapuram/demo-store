// GET /certificate/{id} — the certificate of authenticity page.
// Routed here by the rewrite in vercel.json.
import { certificatePage } from "../demo-server/handlers.mjs";
import { guard, requestOrigin, sendResult } from "../demo-server/vercel.mjs";

export default guard(async (req, res) => {
  if (req.method !== "GET") {
    res.setHeader("allow", "GET");
    res.status(405).json({ error: { message: "Method not allowed." } });
    return;
  }
  const raw = req.query?.id;
  const id = Array.isArray(raw) ? raw[0] : (raw ?? "");
  sendResult(res, await certificatePage({ id, origin: requestOrigin(req) }));
});
