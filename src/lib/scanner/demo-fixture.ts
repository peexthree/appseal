/**
 * Demo target fixture: a deliberately vulnerable vibe-coded app served at
 * /api/demo-target (and locally by mini-services/demo-app).
 *
 * Fixture secrets are generated at startup from a fixed seed: never real,
 * stable across restarts, and not credential-shaped literals in the source.
 */

function fixtureToken(seed: number, n: number): string {
  let s = seed;
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < n; i++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    out += alphabet[s % alphabet.length];
  }
  return out;
}

const OPENAI_KEY_FIXTURE = `sk-proj-${fixtureToken(1, 48)}`;
const STRIPE_KEY_FIXTURE = `sk_live_${fixtureToken(2, 24)}`;
const DB_PASSWORD_FIXTURE = fixtureToken(3, 12);

export const DEMO_PAGE = `<!doctype html>
<html lang="en">
<head>
  <title>FreshBite — food delivery for night owls</title>
  <link rel="stylesheet" href="/api/demo-target/app.css">
  <script src="/api/demo-target/app.js"></script>
</head>
<body>
  <header>
    <h1>FreshBite</h1>
    <nav>
      <a href="/api/demo-target">Home</a>
      <a href="/api/demo-target/about">About</a>
      <a href="/api/demo-target/pricing">Pricing</a>
      <a href="/api/demo-target/admin">Admin</a>
    </nav>
  </header>
  <main>
    <h2>Coming soon</h2>
    <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit.</p>
    <p>Order total: <span>undefined</span> at <span>NaN</span> km/h delivery</p>
  </main>
  <footer>Made with Lovable. Demo app for AppSeal scanner testing.</footer>
  <script>
    // FIXME: remove before launch
    const OPENAI_API_KEY = "${OPENAI_KEY_FIXTURE}";
    const stripeKey = "${STRIPE_KEY_FIXTURE}";
    fetch("/api/demo-target/api/data").then(r => r.json()).then(d => console.log(d));
  </script>
</body>
</html>`;

export const DEMO_ABOUT = `<!doctype html>
<html lang="en"><head><title>About — FreshBite</title></head>
<body><h1>About FreshBite</h1>
<p>We deliver food at night. This page is intentionally alive so the link checker has something green.</p>
<p><a href="/api/demo-target">back home</a></p></body></html>`;

export const DEMO_ADMIN = `<!doctype html>
<html lang="en"><head><title>Admin panel — FreshBite</title></head>
<body><h1>Admin panel</h1>
<form><input type="password" placeholder="Password"><button>Sign in</button></form>
<p>No rate limit, no 2FA, no IP allowlist. Good luck.</p></body></html>`;

/**
 * CSR-shell page (v0.3 rendering test target): the server sends an empty root
 * div, a client script fills it - raw HTML is a shell, hydrated DOM has
 * placeholder copy and a rendered "undefined". Scan it as a direct URL
 * (https://.../api/demo-target/app), not via the demo:// shortcut.
 */
export const DEMO_CSR_PAGE = `<!doctype html>
<html lang="en">
<head>
  <title>FreshBite Dashboard</title>
</head>
<body>
  <div id="root"></div>
  <script>
    document.getElementById('root').innerHTML = [
      '<h1>FreshBite Dashboard</h1>',
      '<p>Lorem ipsum dolor sit amet, consectetur adipiscing elit.</p>',
      '<p>Total orders: <span>undefined</span> today</p>'
    ].join('');
  </script>
</body>
</html>`;

export const DEMO_ENV = `DATABASE_URL=postgres://admin:${DB_PASSWORD_FIXTURE}@db.internal:5432/freshbite
OPENAI_API_KEY=${OPENAI_KEY_FIXTURE}
STRIPE_SECRET=${STRIPE_KEY_FIXTURE}
`;

export const DEMO_APP_JS = `const config = { supabaseUrl: "https://abcdefghij.supabase.co", anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.demo.supabaseanonkeysignature" };
console.log("freshbite app v0.1");`;

export function demoFixtureResponse(urlPath: string): {
  status: number;
  contentType: string;
  body: string;
} | null {
  switch (urlPath) {
    case "/api/demo-target":
    case "/api/demo-target/":
      return { status: 200, contentType: "text/html; charset=utf-8", body: DEMO_PAGE };
    case "/api/demo-target/about":
      return { status: 200, contentType: "text/html; charset=utf-8", body: DEMO_ABOUT };
    case "/api/demo-target/app":
      return { status: 200, contentType: "text/html; charset=utf-8", body: DEMO_CSR_PAGE };
    case "/api/demo-target/admin":
    case "/api/demo-target/admin/":
      return { status: 200, contentType: "text/html; charset=utf-8", body: DEMO_ADMIN };
    case "/api/demo-target/.env":
    case "/api/demo-target/.env.local":
      return { status: 200, contentType: "text/plain", body: DEMO_ENV };
    case "/api/demo-target/.git/HEAD":
      return { status: 200, contentType: "text/plain", body: "ref: refs/heads/main\n" };
    case "/api/demo-target/app.js":
      return { status: 200, contentType: "application/javascript", body: DEMO_APP_JS };
    case "/api/demo-target/app.css":
      return { status: 200, contentType: "text/css", body: "body{font-family:sans-serif}" };
    case "/api/demo-target/api/data":
      return {
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ users: ["demo"], orders: [{ id: 1, total: 42 }] }),
      };
    case "/api/demo-target/api/debug":
      return {
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ debug: true, env: "production", db: "reachable", uptime: 4211 }),
      };
    case "/api/demo-target/backup.zip":
      return {
        status: 200,
        contentType: "application/zip",
        body: "PK\u0003\u0004freshbite-dump-" + "x".repeat(80),
      };
    default:
      return null; // 404, like the local fixture
  }
}
