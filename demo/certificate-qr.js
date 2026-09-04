// Draws the validation QR on the certificate page.
// A separate file rather than an inline script so the demo can run under a CSP
// with no 'unsafe-inline' in script-src.

// Vendored in this package rather than imported from the widget — see demo/qr.js.
import { qrToSVG } from "/qr.js";

const target = document.querySelector("[data-cert-qr]");
if (target) {
  try {
    target.innerHTML = qrToSVG(location.href, { quiet: 1 });
  } catch {
    target.remove();
  }
}
