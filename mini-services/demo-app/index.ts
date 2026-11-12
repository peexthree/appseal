/**
 * AppMOT demo target: a deliberately vulnerable vibe-coded app.
 * Shows every check category firing in one scan.
 * Port 3210, started in background by scripts/start-demo-app.sh
 */
import http from "node:http";

const PAGE = `<!doctype html>
<html lang="en">
<head>
  <title>FreshBite — food delivery for night owls</title>
  <link rel="stylesheet" href="/app.css">
  <script src="/app.js"></script>
</head>
<body>
  <header>
    <h1>FreshBite</h1>
    <nav>
      <a href="/">Home</a>
      <a href="/about">About</a>
      <a href="/pricing">Pricing</a>
      <a href="/admin">Admin</a>
    </nav>
  </header>
  <main>
    <h2>Coming soon</h2>
    <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit.</p>
    <p>Order total: <span>undefined</span> at <span>NaN</span> km/h delivery</p>
  </main>
  <footer>Made with Lovable. Demo app for AppMOT scanner testing.</footer>
  <script>
    // FIXME: remove before launch
    const OPENAI_API_KEY = "sk-proj-4f9Xa2KpQ7LmNeRtYuIoPqW3eR8tYuIoPqW3eR8t";
    const stripeKey = "sk_live_51H8xQm2eZvKYlo2C1234567890";
    fetch("/api/data").then(r => r.json()).then(d => console.log(d));
  </script>
</body>
</html>`;

const ABOUT = `<!doctype html>
<html lang="en"><head><title>About — FreshBite</title></head>
<body><h1>About FreshBite</h1>
<p>We deliver food at night. This page is intentionally alive so the link checker has something green.</p>
<p><a href="/">back home</a></p></body></html>`;

const ADMIN = `<!doctype html>
<html lang="en"><head><title>Admin panel — FreshBite</title></head>
<body><h1>Admin panel</h1>
<form><input type="password" placeholder="Password"><button>Sign in</button></form>
<p>No rate limit, no 2FA, no IP allowlist. Good luck.</p></body></html>`;

const ENV = `DATABASE_URL=postgres://admin:SuperSecret99@db.internal:5432/freshbite
OPENAI_API_KEY=sk-proj-4f9Xa2KpQ7LmNeRtYuIoPqW3eR8tYuIoPqW3eR8t
STRIPE_SECRET=sk_live_51H8xQm2eZvKYlo2C1234567890
`;

const APP_JS = `const config = { supabaseUrl: "https://abcdefghij.supabase.co", anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.demo.supabaseanonkeysignature" };
console.log("freshbite app v0.1");`;

const server = http.createServer((req, res) => {
  const url = (req.url ?? "/").split("?")[0];

  res.setHeader("Set-Cookie", "session=abc123; Path=/");
  res.setHeader("Access-Control-Allow-Origin", "*");

  if (url === "/") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(PAGE);
    return;
  }
  if (url === "/about") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(ABOUT);
    return;
  }
  if (url === "/admin" || url === "/admin/") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(ADMIN);
    return;
  }
  if (url === "/.env" || url === "/.env.local") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end(ENV);
    return;
  }
  if (url === "/.git/HEAD") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("ref: refs/heads/main\n");
    return;
  }
  if (url === "/app.js") {
    res.writeHead(200, { "Content-Type": "application/javascript" });
    res.end(APP_JS);
    return;
  }
  if (url === "/app.css") {
    res.writeHead(200, { "Content-Type": "text/css" });
    res.end("body{font-family:sans-serif}");
    return;
  }
  if (url === "/api/data") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ users: ["demo"], orders: [{ id: 1, total: 42 }] }));
    return;
  }
  if (url === "/api/debug") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ debug: true, env: "production", db: "reachable", uptime: 4211 }));
    return;
  }
  if (url === "/backup.zip") {
    res.writeHead(200, { "Content-Type": "application/zip" });
    res.end(Buffer.from("PK\u0003\u0004freshbite-dump-" + "x".repeat(80)));
    return;
  }
  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("404 not found");
});

server.listen(3210, "127.0.0.1", () => {
  console.log("AppMOT demo vulnerable app listening on http://127.0.0.1:3210");
});
