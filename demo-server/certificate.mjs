// Certificate of authenticity page, served by the demo at /certificate/{id}.
//
// In a real integration this page is served by BIFY (the certificate's
// verificationUrl points at api.bify.io). The demo renders its own copy so the
// design can be viewed without a Commerce deployment, and so the QR code
// resolves back to the demo itself.

import { formatUsdc } from "./catalog.mjs";
import { config } from "./config.mjs";

const ACCENT = "#2551b5";

const ICON = {
  shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6l-7-3Z"/></svg>',
  hash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18"/></svg>',
  lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="10" width="16" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>',
  star: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3 2.6 5.6L21 9.5l-4.5 4.3 1.1 6.2L12 17.3 6.4 20l1.1-6.2L3 9.5l6.4-.9z"/></svg>',
  alert: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/></svg>',
};

const LOGO_PATH =
  "M79.98 177.56C77.35 176.86 74.58 176.78 71.95 176.22C17.3 164.56-14.61 108.07 6.64 55.76C14.07 37.2 27.64 21.75 45.09 11.95C66.19-0.11 86.91-1.94 110.59 1.61C112.05 1.83 118.25 0.39 120.58 0.25C123.58 1.75 127.35 3.7 129.68 6.13C130.5 6.99 131.22 9.29 132.24 9.86C136.23 12.04 140.02 14.18 143.73 16.86C159.12 27.84 170.69 43.33 176.83 61.19C178.54 66.3 179.96 71.96 180.65 77.31C183.55 100.03 178.04 122.43 164.34 140.77C153.12 156.02 137.44 167.44 119.47 173.46C116.06 174.58 113.42 175.36 109.94 176.08C108.1 176.46 103.39 177.07 101.9 177.56H79.98Z";

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
}

const mark = (size) => `<svg viewBox="0 0 182 178" fill="${ACCENT}" width="${size}" height="${size}"><path d="${LOGO_PATH}"/></svg>`;

function corporateSeal() {
  const a = ACCENT;
  return `<svg viewBox="0 0 240 240" width="200" height="200" aria-hidden="true"><defs><radialGradient id="sealFill" cx="50%" cy="45%" r="60%"><stop offset="0%" stop-color="#fefefe"/><stop offset="70%" stop-color="#f6f0e2"/><stop offset="100%" stop-color="#e8dcc0"/></radialGradient><path id="seal-top" d="M 34 120 A 86 86 0 0 1 206 120"/><path id="seal-bottom" d="M 206 120 A 86 86 0 0 1 34 120"/></defs>
  <circle cx="120" cy="120" r="100" fill="url(#sealFill)" stroke="${a}" stroke-width="10"/><circle cx="120" cy="120" r="82" fill="none" stroke="${a}" stroke-width="2.4"/><circle cx="120" cy="120" r="58" fill="#fbf7ee" stroke="${a}" stroke-width="1.8"/>
  <text fill="${a}" font-size="7.4" font-weight="800" letter-spacing="2.1" opacity="0.94"><textPath href="#seal-top" startOffset="50%" text-anchor="middle">BIFY AUTHENTICITY OFFICE</textPath></text>
  <text fill="${a}" font-size="7.2" font-weight="800" letter-spacing="1.9" opacity="0.94"><textPath href="#seal-bottom" startOffset="50%" text-anchor="middle">OFFICIAL MERCHANDISE ISSUE</textPath></text>
  <circle cx="120" cy="56" r="3.4" fill="${a}" opacity="0.9"/><circle cx="120" cy="184" r="3.4" fill="${a}" opacity="0.9"/><circle cx="56" cy="120" r="3.4" fill="${a}" opacity="0.9"/><circle cx="184" cy="120" r="3.4" fill="${a}" opacity="0.9"/>
  <line x1="86" y1="120" x2="154" y2="120" stroke="${a}" stroke-width="0.9" opacity="0.26"/><line x1="120" y1="86" x2="120" y2="154" stroke="${a}" stroke-width="0.9" opacity="0.26"/>
  <text x="120" y="108" text-anchor="middle" fill="${a}" style="font-family:Georgia,serif;font-style:italic" font-size="28" font-weight="700" letter-spacing="-1.2" opacity="0.96">BIFY</text>
  <text x="120" y="136" text-anchor="middle" fill="${a}" font-size="8.4" font-weight="900" letter-spacing="3" opacity="0.92">OFFICIAL SEAL</text></svg>`;
}

/**
 * @param {string} rawId Certificate id from the URL.
 * @param {object} snapshot Purchase snapshot (from the backend, or decoded from a mock id).
 */
export function renderCertificatePage(rawId, snapshot = {}) {
  const id = /^0x[0-9a-fA-F]{0,64}$/.test(rawId) ? rawId : `0x${"0".repeat(64)}`;
  const shortId = id.length > 26 ? `${id.slice(0, 14)}…${id.slice(-8)}` : id;
  const hexBody = (id.replace(/^0x/, "") + "0".repeat(64)).slice(0, 64);
  const rot = (n) => (hexBody.slice(n) + hexBody).slice(0, 64);

  const productName = snapshot.productName || "BIFY merchandise";
  const quantity = snapshot.quantity || 1;
  const totalUsdc = formatUsdc(snapshot.totalPriceUsdc ?? "0");
  const unitUsdc = formatUsdc(snapshot.unitPriceUsdc ?? "0");
  const ownerAddr = snapshot.owner || "0x0e801d84fa97b50751dbf25036d067dcf18858bf";
  const networkLabel = snapshot.network === "base" ? "Base" : "Base Sepolia";
  const orderRef = snapshot.externalOrderId || `BIFY-${Date.now().toString().slice(-8)}`;
  const now = snapshot.mintedAt ? new Date(snapshot.mintedAt) : new Date();
  const dateLong = now.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const scanTime = now.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
  const wallet = `${ownerAddr.slice(0, 22)}​${ownerAddr.slice(22)}`;
  const holder = `${ownerAddr.slice(0, 6)}...${ownerAddr.slice(-4)}`;
  const serial = `BIFY-${hexBody.slice(0, 8).toUpperCase()}`;
  const metadataHash = snapshot.metadataHash || rot(0);
  const purchaseRef = snapshot.purchaseId || rot(8);
  const orderScopeRef = snapshot.orderScopeId || rot(16);
  const voucherSignature = snapshot.signature || "Available after signed claim";

  const detail = (k, v) => `<div class="drow"><p class="lbl">${escapeHtml(k)}</p><p class="val">${escapeHtml(v)}</p></div>`;
  const field = (k, v) => `<div class="fblock"><p class="lbl">${escapeHtml(k)}</p><p class="fval">${escapeHtml(v)}</p></div>`;
  const feature = (icon, t, c) => `<div class="feat"><div class="feat-h">${icon}<p>${escapeHtml(t)}</p></div><p class="feat-c">${escapeHtml(c)}</p></div>`;
  const sealMeta = (icon, k, v) => `<div class="smeta"><div class="smeta-h">${icon}<p>${escapeHtml(k)}</p></div><p class="smeta-v">${escapeHtml(v)}</p></div>`;
  const registry = (t, v, c) => `<div class="reg"><p class="lbl">${escapeHtml(t)}</p><p class="reg-v">${escapeHtml(v)}</p><p class="reg-c">${escapeHtml(c)}</p></div>`;

  const simulatedNotice = config.mockMode
    ? `<div class="notice"><div class="row"><span class="ic">${ICON.alert}</span><div><p class="t">Demonstration record</p><p class="c">This demo is running in simulated mode. No payment was taken, no certificate was minted, and no chain was contacted. The document below shows the certificate design only.</p></div></div></div>`
    : "";

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>BIFY Certificate of Authenticity</title>
<style>
*{box-sizing:border-box}
body{margin:0;min-height:100vh;padding:40px 16px;color:#2b2418;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:radial-gradient(circle at top,#f3f0e9 0%,#f7f3ea 25%,#ece6da 100%);-webkit-font-smoothing:antialiased}
.serif{font-family:Georgia,"Times New Roman",serif}
.doc{position:relative;max-width:1120px;margin:0 auto;border:1px solid #d9ccb1;border-radius:35px;background:linear-gradient(180deg,#fbf7ee,#f7f2e8);box-shadow:0 40px 100px -48px rgba(66,47,15,.35);overflow:hidden}
.doc::before{content:"";position:absolute;inset:16px;border:1px solid #dac9a5;border-radius:30px;pointer-events:none}
.doc::after{content:"";position:absolute;inset:32px;border:1px solid #e9deca;border-radius:26px;pointer-events:none}
.corner{position:absolute;width:48px;height:48px;border:1px solid rgba(217,200,164,.7);border-radius:50%}
.corner.tl{left:32px;top:32px}.corner.tr{right:32px;top:32px}.corner.bl{left:32px;bottom:32px}.corner.br{right:32px;bottom:32px}
.wm{position:absolute;inset:0;opacity:.05;pointer-events:none}.wm .a{position:absolute;left:40px;top:40px}.wm .b{position:absolute;right:40px;bottom:40px}
.top{position:relative;text-align:center;padding:52px 48px 40px}
.sealbox{display:inline-flex;align-items:center;gap:14px;padding:12px 18px;border:1px solid #d9caa8;border-radius:20px;background:#fff;box-shadow:0 14px 32px -24px rgba(60,98,194,.35)}
.sealbox .who{text-align:left}.sealbox .who small{display:block;font-size:10px;font-weight:700;letter-spacing:.32em;text-transform:uppercase;color:#826d43}.sealbox .who strong{display:block;margin-top:3px;font-size:13px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:#3a2f1d}
.eyebrow{margin-top:28px;font-size:11px;font-weight:700;letter-spacing:.38em;text-transform:uppercase;color:#87714a}
h1{margin:14px auto 0;max-width:760px;font-size:60px;font-weight:700;letter-spacing:-.04em;line-height:1.02;color:#211a10}
.lede{margin:18px auto 0;max-width:660px;font-size:15px;line-height:1.72;color:#5f5137}
.badges{margin-top:28px;display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:14px}
.verified{display:inline-flex;align-items:center;gap:8px;padding:8px 16px;border:1px solid #c9d8c9;border-radius:999px;background:#edf6eb;color:#215c31;font-size:14px;font-weight:600}
.verified::before{content:"✓";font-weight:800}
.idbox{padding:10px 18px;border:1px solid #ddcfb3;border-radius:18px;background:rgba(255,255,255,.7);text-align:left}
.idbox small{display:block;font-size:10px;font-weight:700;letter-spacing:.22em;text-transform:uppercase;color:#826d43}.idbox strong{display:block;margin-top:3px;font-size:14px;font-weight:700;color:#2f2618}
.certifies{margin:32px auto 0;max-width:840px;padding:28px;border:1px solid #deceb1;border-radius:29px;background:rgba(255,255,255,.42);box-shadow:0 18px 40px -30px rgba(66,47,15,.25)}
.certifies .th{font-size:11px;font-weight:700;letter-spacing:.32em;text-transform:uppercase;color:#866f45}
.certifies .holder{margin:16px 0 0;font-size:44px;font-weight:700;letter-spacing:-.04em;color:#211a10}
.certifies p{margin:16px auto 0;max-width:640px;font-size:15px;line-height:1.75;color:#5e5038}
.certifies b{color:#2f2618;font-weight:600}
.cols{position:relative;display:grid;grid-template-columns:1.25fr .75fr;gap:32px;padding:8px 48px 44px;border-top:1px solid #ece1cc}
.card{border:1px solid #deceb1;border-radius:29px;padding:24px;margin-bottom:20px}
.card:last-child{margin-bottom:0}
.card .k{font-size:11px;font-weight:700;letter-spacing:.24em;text-transform:uppercase;color:#856e45}
.item{background:rgba(255,255,255,.46)}
.item .head{display:flex;flex-wrap:wrap;align-items:flex-end;justify-content:space-between;gap:12px;margin-top:16px}
.item h2{margin:0;font-size:32px;font-weight:700;letter-spacing:-.04em;color:#231b11}
.item .sub{margin:8px 0 0;font-size:14px;color:#62533a}.item .sub b{color:#2f2618;font-weight:600}
.tier{padding:8px 16px;border-radius:999px;font-size:13px;font-weight:600;background:rgba(37,81,181,.08);color:${ACCENT}}
.dgrid{margin-top:16px;display:grid;grid-template-columns:1fr 1fr;gap:16px}
.drow{border:1px solid #e4d6bb;border-radius:21px;background:rgba(255,255,255,.5);padding:12px 16px}
.lbl{margin:0;font-size:11px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:#806d47}
.val{margin:8px 0 0;font-size:14px;font-weight:600;color:#2e2619;overflow-wrap:anywhere}
.stmt{background:linear-gradient(135deg,#f8f3e8 0%,#efe7d6 100%)}
.stmt p.body{margin:12px 0 0;font-size:14px;line-height:1.75;color:#5b4b32}
.feats{background:rgba(255,255,255,.58)}
.feat-grid{margin-top:16px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px}
.feat{border:1px solid #e4d6bb;border-radius:21px;background:#fffdfa;padding:16px}
.feat-h{display:flex;align-items:center;gap:8px;color:#74613f}.feat-h svg{width:16px;height:16px}.feat-h p{margin:0;font-size:12px;font-weight:700;letter-spacing:.16em;text-transform:uppercase}
.feat-c{margin:12px 0 0;font-size:13px;line-height:1.55;color:#65553a}
.ledger{background:#f7f1e6}
.fblock{margin-top:16px}
.fval{margin:8px 0 0;word-break:break-all;border:1px solid #e4d6bb;border-radius:16px;background:#fffdfa;padding:12px 16px;font-family:"SFMono-Regular",Consolas,monospace;font-size:13px;font-weight:600;color:#2e2619}
.seal-card{background:linear-gradient(180deg,#f7f0e2 0%,#efe4cc 100%)}
.seal-wrap{margin-top:16px;display:flex;justify-content:center}
.smeta{margin-top:12px;border:1px solid #e4d6bb;border-radius:20px;background:#fffdfa;padding:12px 16px}
.smeta-h{display:flex;align-items:center;gap:8px;color:#73613f}.smeta-h svg{width:16px;height:16px}.smeta-h p{margin:0;font-size:10px;font-weight:700;letter-spacing:.18em;text-transform:uppercase}
.smeta-v{margin:8px 0 0;font-size:14px;font-weight:600;color:#2f2618}
.scan{background:rgba(255,255,255,.58)}
.scan-inner{margin-top:16px;border:1px solid #e7d8bd;border-radius:24px;background:#f8f1e4;padding:16px}
.qr{margin:0 auto;max-width:220px;border:1px solid #dbc9a8;border-radius:19px;background:#fff;padding:12px;box-shadow:0 16px 36px -24px rgba(76,58,22,.28)}
.qr svg{display:block;width:100%;height:auto}
.scan p{margin:16px 0 0;text-align:center;font-size:12px;line-height:1.5;color:#65553a}
.authority{background:rgba(255,255,255,.62)}
.auth-inner{margin-top:16px;border:1px solid #e4d6bb;border-radius:22px;background:#fffdfa;padding:16px}
.auth-inner .name{margin:0;font-size:14px;font-weight:600;color:#2d2619}.auth-inner .role{margin:6px 0 0;font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:#7b6742}
.auth-sig{margin-top:16px;border-top:1px dashed #d8c7a6;padding-top:12px}.auth-sig .imprint{margin:0;font-style:italic;font-size:22px;font-weight:700;letter-spacing:-.03em;color:${ACCENT}}.auth-sig small{display:block;margin-top:6px;font-size:12px;color:#65563c}
.notice{border:1px solid #f0dfc3;border-radius:29px;background:linear-gradient(180deg,#fffdf7 0%,#fff8eb 100%);padding:20px;margin-bottom:20px}
.notice .row{display:flex;align-items:flex-start;gap:12px}
.notice .ic{display:grid;place-items:center;border-radius:50%;background:#fff2cf;color:#b98217;padding:8px}.notice .ic svg{width:16px;height:16px}
.notice .t{margin:0;font-size:11px;font-weight:700;letter-spacing:.22em;text-transform:uppercase;color:#ba8a2f}.notice .c{margin:8px 0 0;font-size:14px;line-height:1.55;color:#7f6124}
.reg{border:1px solid #e4d6bb;border-radius:23px;background:rgba(255,255,255,.55);padding:18px 20px;margin-bottom:16px}
.reg-v{margin:12px 0 0;font-size:24px;font-weight:700;letter-spacing:-.03em;color:#231b11}.reg-c{margin:12px 0 0;font-size:14px;line-height:1.5;color:#64553b}
.back{display:block;max-width:1120px;margin:0 auto 20px;font-size:14px;font-weight:600;color:#6b5a3c;text-decoration:none}
.back:hover{color:#2f2618}
h1.serif,.holder.serif,.item h2,.certifies .holder,.reg-v,.auth-sig .imprint{font-family:Georgia,"Times New Roman",serif}
@media (max-width:900px){.cols{grid-template-columns:1fr}h1{font-size:42px}.dgrid,.feat-grid{grid-template-columns:1fr}.top,.cols{padding-left:26px;padding-right:26px}}
</style></head>
<body>
<a class="back" href="/">← Back to the Jinked store</a>
<div class="doc">
  <span class="corner tl"></span><span class="corner tr"></span><span class="corner bl"></span><span class="corner br"></span>
  <div class="wm"><div class="a">${mark(240)}</div><div class="b">${mark(240)}</div></div>
  <div class="top">
    <div class="sealbox">${mark(38)}<span class="who"><small>BIFY merchandise authenticity office</small><strong>Issuer Authority</strong></span></div>
    <p class="eyebrow">Official issue record</p>
    <h1 class="serif">Certificate of Authenticity</h1>
    <p class="lede">This instrument certifies that the item referenced below was issued through the official BIFY merchandise program and is entered upon the BIFY authenticity ledger as a valid issue bearing the seal and digital signature of the issuer authority.</p>
    <div class="badges"><span class="verified">Digitally verified</span><span class="idbox"><small>Certificate ID</small><strong>${escapeHtml(shortId)}</strong></span></div>
    <div class="certifies">
      <p class="th">This certifies that</p>
      <p class="holder serif">${escapeHtml(holder)}</p>
      <p>is the recorded holder of an official BIFY issue corresponding to <b>${escapeHtml(productName)}</b>, purchased under order reference <b>${escapeHtml(orderRef)}</b> and entered into the authenticity register under certificate number <b>${escapeHtml(shortId)}</b>.</p>
    </div>
  </div>
  <div class="cols">
    <section>
      <div class="card item"><p class="k">Certified item</p><div class="head"><div><h2 class="serif">${escapeHtml(productName)}</h2><p class="sub">Issued by <b>Jinked · BIFY Studio</b></p></div><span class="tier">Standard QR authenticity</span></div>
        <div class="dgrid">
          ${detail("Buyer", holder)}${detail("Seller", "Jinked")}
          ${detail("Quantity", String(quantity))}${detail("Unit Price", unitUsdc)}
          ${detail("Total Paid", totalUsdc)}${detail("Purchase Date", dateLong)}
          ${detail("Payment Method", `USDC · ${networkLabel}`)}${detail("Wallet", wallet)}
          ${detail("Order Reference", orderRef)}${detail("Serial Number", serial)}
        </div>
      </div>
      <div class="card stmt"><p class="k">Issuer statement</p><p class="body">BIFY certifies that this merchandise record was created from an official completed purchase and digitally sealed by the BIFY merchandise authenticity office. Any mismatch in the seal or commitment values should be treated as a non-authentic record.</p></div>
      <div class="card feats"><p class="k">Certificate security features</p><div class="feat-grid">${feature(ICON.shield, "Issuer sealed", "Digitally sealed by the BIFY merchandise authenticity office.")}${feature(ICON.hash, "Traceable serial", "Each product is bound to a unique BIFY merchandise serial.")}${feature(ICON.lock, "Tamper signal", "Seal or commitment mismatch should invalidate this document.")}</div></div>
      <div class="card ledger"><p class="k">Ledger references</p>${field("Metadata Hash", metadataHash)}${field("Purchase ID", purchaseRef)}${field("Order Scope ID", orderScopeRef)}${field("Voucher Signature", voucherSignature)}</div>
    </section>
    <aside>
      ${simulatedNotice}
      <div class="card seal-card"><p class="k">Corporate seal</p><div class="seal-wrap">${corporateSeal()}</div>${sealMeta(ICON.shield, "Seal Status", "Valid digital seal")}${sealMeta(ICON.star, "Last Scan", scanTime)}</div>
      <div class="card scan"><p class="k">Scan to validate</p><div class="scan-inner"><div class="qr" data-cert-qr></div><p>Scan this code to open the live BIFY validation route for this certificate and confirm the current authenticity status.</p></div></div>
      <div class="card authority"><p class="k">Issuer authority</p><div class="auth-inner"><p class="name">BIFY Merchandise Authenticity Office</p><p class="role">Digitally issued and sealed</p><div class="auth-sig"><p class="imprint serif">BIFY Studio</p><small>Official issuer signature imprint</small></div></div></div>
      <div class="notice"><div class="row"><span class="ic">${ICON.alert}</span><div><p class="t">Inspection notice</p><p class="c">Trust this document only when the BIFY seal is valid, the certificate ID matches the issued record, and the scan route resolves to an active authenticity page.</p></div></div></div>
      ${registry("Recorded consideration", totalUsdc, "Entered as settled purchase consideration on the BIFY merchandise ledger.")}
      ${registry("Issue timestamp", dateLong, "Issued under the authority of the BIFY merchandise authenticity office.")}
    </aside>
  </div>
</div>
<script type="module" src="/certificate-qr.js"></script>
</body></html>`;
}
