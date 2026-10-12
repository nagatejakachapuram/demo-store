import { createHash } from "node:crypto";

const valid = (value) => typeof value === "string" && /^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/.test(value);

// Older published SDKs project checkout fields before sending them. Preserve
// the automatic metadata at that one request boundary without sharing mutable
// referral state between customers or changing SDK price/auth validation.
export function discoveryCheckoutFetch(fetcher, backendURL, code) {
  const endpoint = backendURL.replace(/\/$/, "") + "/v1/checkout/sessions";
  return (url, init) => {
    if (valid(code) && String(url) === endpoint && init?.method === "POST" && typeof init.body === "string") {
      const body = JSON.parse(init.body);
      return fetcher(url, { ...init, body: JSON.stringify({ ...body, discoveryReferralCode: code }) });
    }
    return fetcher(url, init);
  };
}

// A normal referral landing is captured automatically on the first same-origin
// checkout request. The HttpOnly cookie preserves it across quantity changes,
// retries and return visits, and is scoped to this product rather than the cart.
export function discoveryReferral({ referer, cookie = "", origin, productId }) {
  const name = `bify_ref_${createHash("sha256").update(productId).digest("hex").slice(0,24)}`;
  let code;
  try {
    const landing = new URL(referer);
    if (landing.origin === new URL(origin).origin && landing.pathname === "/product.html" && landing.searchParams.get("id") === productId && landing.searchParams.getAll("bify_ref").length === 1) {
      const candidate = landing.searchParams.get("bify_ref");
      if (valid(candidate)) code = candidate;
    }
  } catch { /* Missing referrer never prevents checkout. */ }
  const captured = Boolean(code);
  if (!code) {
    const values = cookie.split(";").map(v => v.trim()).filter(v => v.startsWith(name+"="));
    if (values.length === 1 && valid(values[0].slice(name.length+1))) code = values[0].slice(name.length+1);
  }
  return { code, cookie: captured ? `${name}=${code}; Path=/api/checkout-session; Max-Age=2592000; HttpOnly; SameSite=Lax${origin?.startsWith("https://") ? "; Secure" : ""}` : undefined };
}
