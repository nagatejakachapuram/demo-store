// POST /api/checkout-session — mints a hosted USDC checkout session.
//
// This is the one route that holds the partner API key. It reads the price from
// the server-side catalogue, never from the request body.
import { createCheckoutSession } from "../demo-server/handlers.mjs";
import { guard, jsonBody, sendResult } from "../demo-server/vercel.mjs";

export default guard(async (req, res) => {
  if (req.method !== "POST") {
    res.setHeader("allow", "POST");
    res.status(405).json({ error: { message: "Method not allowed." } });
    return;
  }
  const body = await jsonBody(req);
  sendResult(res, await createCheckoutSession({ body, query: req.query ?? {} }));
});
