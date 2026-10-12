import assert from "node:assert/strict";
import { test } from "node:test";
import { discoveryReferral } from "../demo-server/discovery.mjs";

test("normal referral landing is captured and survives checkout refresh without a manual token", () => {
 const code = "A".repeat(43), origin="https://shop.example", productId="hoodie";
 const first = discoveryReferral({referer:`${origin}/product.html?id=hoodie&bify_ref=${code}`,origin,productId});
 assert.equal(first.code,code);
 assert.match(first.cookie,/HttpOnly; SameSite=Lax; Secure$/);
 const cookie=first.cookie.split(";")[0];
 assert.equal(discoveryReferral({cookie,origin,productId}).code,code);
 assert.equal(discoveryReferral({cookie,origin,productId:"another"}).code,undefined);
 for(const referer of [`https://attacker.example/product.html?id=hoodie&bify_ref=${code}`,`${origin}/product.html?id=another&bify_ref=${code}`,`${origin}/product.html?id=hoodie&bify_ref=invalid`,`${origin}/product.html?id=hoodie&bify_ref=${code}&bify_ref=${code}`]) {
  assert.equal(discoveryReferral({referer,origin,productId}).code,undefined);
 }
 assert.equal(discoveryReferral({cookie:`${cookie}; ${cookie}`,origin,productId}).code,undefined);
});

test("published SDK compatibility preserves automatic referral without leaking it to other requests", async () => {
 const {discoveryCheckoutFetch}=await import("../demo-server/discovery.mjs");
 const sent=[];const fetcher=async(url,init)=>{sent.push({url,init});return {ok:true}};
 const backend="https://commerce.example",code="A".repeat(43),other="B".repeat(42)+"A";
 const request={method:"POST",headers:{authorization:"Bearer server-test"},body:JSON.stringify({totalPriceUsdc:"68000000"})};
 const first=discoveryCheckoutFetch(fetcher,backend,code),second=discoveryCheckoutFetch(fetcher,backend,other);
 await Promise.all([first(backend+"/v1/checkout/sessions",request),second(backend+"/v1/checkout/sessions",request)]);
 assert.equal(JSON.parse(sent[0].init.body).discoveryReferralCode,code);
 assert.equal(JSON.parse(sent[1].init.body).discoveryReferralCode,other);
 assert.equal(JSON.parse(sent[0].init.body).totalPriceUsdc,"68000000");
 assert.equal(sent[0].init.headers.authorization,request.headers.authorization);
 assert.equal(JSON.parse(request.body).discoveryReferralCode,undefined);
 await first("https://other.example/v1/checkout/sessions",request);
 await first(backend+"/v1/orders",request);
 assert.equal(sent[2].init,request);assert.equal(sent[3].init,request);
});
