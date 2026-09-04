// GET /api/demo-config — catalogue + settlement status for the storefront.
import { demoConfig } from "../demo-server/handlers.mjs";
import { guard, sendResult } from "../demo-server/vercel.mjs";

export default guard(async (req, res) => {
  if (req.method !== "GET") {
    res.setHeader("allow", "GET");
    res.status(405).json({ error: { message: "Method not allowed." } });
    return;
  }
  sendResult(res, await demoConfig());
});
