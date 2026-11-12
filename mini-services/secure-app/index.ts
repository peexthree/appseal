/**
 * AppMOT secure demo target: the "remediated twin" of the vulnerable demo app.
 * Same fictional product (FreshBite night food delivery), same routes —
 * but configured the way a production app should be:
 *   - HTTPS with a valid certificate chain (+ HSTS)
 *   - full set of security headers (CSP, nosniff, frame-ancestors, referrer)
 *   - no CORS wildcards, cookies with HttpOnly/Secure/SameSite
 *   - admin area behind HTTP auth (401), debug endpoint gated, no .env/.git/backup exposure
 *   - real content, meta tags, all internal links alive
 * Expected AppMOT grade: A (100/100).
 * Port 3211, started in background by scripts/start-secure-app.sh
 */
import https from "node:https";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const KEY = readFileSync(join(HERE, "certs", "server.key"));
const CERT = readFileSync(join(HERE, "certs", "server.crt"));

const SECURITY_HEADERS: Record<string, string> = {
  "content-security-policy":
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  "strict-transport-security": "max-age=31536000; includeSubDomains",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "referrer-policy": "strict-origin-when-cross-origin",
};

function page(body: string, title: string, description: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <meta name="description" content="${description}">
  <link rel="stylesheet" href="/app.css">
</head>
<body>
${body}
<script src="/app.js"></script>
</body>
</html>`;
}

const NAV = `
  <header>
    <h1>FreshBite</h1>
    <nav>
      <a href="/">Home</a>
      <a href="/about">About</a>
      <a href="/pricing">Pricing</a>
      <a href="/docs">Docs</a>
      <a href="/login">Sign in</a>
    </nav>
  </header>`;

const HOME = page(
  `${NAV}
  <main>
    <h2>Night food delivery, done properly</h2>
    <p>FreshBite delivers hot meals across the city from 21:00 to 06:00. Kitchens stay open, riders stay warm, orders arrive in 30 minutes on average.</p>
    <p>Tonight's menu loads straight from our kitchen API:</p>
    <ul id="menu"><li>Loading tonight's dishes…</li></ul>
    <p>Payments are processed on the server side. We never handle card data in the browser.</p>
  </main>
  <footer>FreshBite hardened build. Demo target for the AppMOT scanner (expected grade A).</footer>`,
  "FreshBite — night food delivery, cooked and shipped with care",
  "Hot food delivered across the city in 30 minutes, all night long. Kitchens open 21:00–06:00.",
);

const ABOUT = page(
  `${NAV}
  <main>
    <h2>About FreshBite</h2>
    <p>We started FreshBite for the people who work when the city sleeps: nurses, dispatchers, students, and everyone whose dinner happens at 2 a.m.</p>
    <p>This build is the remediated twin of our demo app: same product, same routes, but configured the way production apps should be.</p>
    <p><a href="/">Back to home</a></p>
  </main>
  <footer>FreshBite hardened build.</footer>`,
  "About — FreshBite",
  "The story of FreshBite and how this hardened build differs from the demo one.",
);

const PRICING = page(
  `${NAV}
  <main>
    <h2>Pricing</h2>
    <ul>
      <li>Free delivery within 3 km on orders above $25</li>
      <li>$2.49 flat delivery fee otherwise</li>
      <li>Night owls club: $9/month, free delivery all week</li>
    </ul>
    <p><a href="/">Back to home</a></p>
  </main>
  <footer>FreshBite hardened build.</footer>`,
  "Pricing — FreshBite",
  "Delivery fees, night owls club and everything the kitchen charges.",
);

const DOCS = page(
  `${NAV}
  <main>
    <h2>Docs</h2>
    <p>Public API for partners: GET /api/data returns tonight's menu. Everything else requires authentication.</p>
    <p>Partner onboarding happens over email; we never ship credentials in client code.</p>
    <p><a href="/">Back to home</a></p>
  </main>
  <footer>FreshBite hardened build.</footer>`,
  "Docs — FreshBite",
  "Public menu API and partner documentation for the FreshBite platform.",
);

const LOGIN = page(
  `${NAV}
  <main>
    <h2>Sign in</h2>
    <form method="post" action="/login">
      <label>Email <input type="email" name="email" autocomplete="username"></label>
      <label>Password <input type="password" name="password" autocomplete="current-password"></label>
      <button type="submit">Sign in</button>
    </form>
    <p>Sessions are HttpOnly cookies. The admin area lives behind separate infrastructure and HTTP auth.</p>
  </main>
  <footer>FreshBite hardened build.</footer>`,
  "Sign in — FreshBite",
  "Sign in to your FreshBite account.",
);

const APP_JS = `// FreshBite storefront bundle (production build, no inline secrets)
var cfg = { apiUrl: "/api/data", currency: "USD", version: "1.2.0" };
function renderMenu(data) {
  var list = document.getElementById("menu");
  if (!list) return;
  list.innerHTML = "";
  data.items.forEach(function (m) {
    var li = document.createElement("li");
    li.textContent = m.name + " — " + m.price + " " + cfg.currency;
    list.appendChild(li);
  });
}
document.addEventListener("DOMContentLoaded", function () {
  fetch(cfg.apiUrl)
    .then(function (r) { return r.json(); })
    .then(renderMenu)
    .catch(function () {
      var list = document.getElementById("menu");
      if (list) list.innerHTML = "<li>Kitchens are warming up — check back in a minute.</li>";
    });
});`;

const APP_CSS = `body{font-family:system-ui,sans-serif;max-width:720px;margin:0 auto;padding:16px;color:#1f2937}
header{display:flex;justify-content:space-between;align-items:baseline;border-bottom:1px solid #e5e7eb}
nav a{margin-left:12px}
footer{margin-top:32px;color:#6b7280;font-size:14px}`;

const server = https.createServer(
  { key: KEY, cert: CERT },
  (req, res) => {
    const url = (req.url ?? "/").split("?")[0];

    // security headers on every response; session cookie on the homepage
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, v);
    if (url === "/") {
      res.setHeader(
        "set-cookie",
        "session=7f3ac91de24b55e0; Path=/; HttpOnly; Secure; SameSite=Strict",
      );
    }

    if (url === "/") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(HOME);
      return;
    }
    if (url === "/about" || url === "/pricing" || url === "/docs" || url === "/login") {
      const map: Record<string, string> = {
        "/about": ABOUT,
        "/pricing": PRICING,
        "/docs": DOCS,
        "/login": LOGIN,
      };
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(map[url]);
      return;
    }
    if (url === "/app.js") {
      res.writeHead(200, { "content-type": "application/javascript; charset=utf-8" });
      res.end(APP_JS);
      return;
    }
    if (url === "/app.css") {
      res.writeHead(200, { "content-type": "text/css; charset=utf-8" });
      res.end(APP_CSS);
      return;
    }
    // public menu data — safe to expose, read-only, no personal info
    if (url === "/api/data") {
      res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      res.end(
        JSON.stringify({
          items: [
            { name: "Midnight ramen", price: 14.5 },
            { name: "Sunrise pancakes", price: 9.0 },
            { name: "Night shift burger", price: 11.25 },
          ],
          updated: new Date().toISOString(),
        }),
      );
      return;
    }
    // admin area: HTTP basic auth in front of a separate service
    if (url === "/admin" || url === "/admin/" || url === "/dashboard") {
      res.setHeader("www-authenticate", 'Basic realm="FreshBite admin", charset="UTF-8"');
      res.writeHead(401, { "content-type": "text/plain; charset=utf-8" });
      res.end("401 admin area requires authentication");
      return;
    }
    // diagnostics exist but are gated; they answer 401 without a session
    if (url === "/api/debug") {
      res.writeHead(401, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ error: "authentication required" }));
      return;
    }
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("404 not found");
  },
);

server.listen(3211, "127.0.0.1", () => {
  console.log("AppMOT secure demo app listening on https://127.0.0.1:3211");
});
