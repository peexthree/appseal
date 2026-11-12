/**
 * v0.3: JS-rendering for CSR apps (Lovable/Bolt previews render an empty root
 * div server-side). Only runs when the homepage is a client-render shell; any
 * failure falls back to the raw HTML so the scan never breaks because of it.
 *
 * Rendering happens in-process via playwright-core + @sparticuz/chromium
 * (the serverless chromium build works on Vercel nodejs functions; on other
 * platforms, e.g. local Windows dev, it returns null and we keep the raw body).
 */

const RENDER_TIMEOUT_MS = 20000;

export function shouldRender(csr: boolean, isDemo: boolean): boolean {
  if (!csr || isDemo) return false;
  return process.env.APPMOT_RENDER !== "off";
}

interface Rendered {
  html: string;
  finalUrl: string;
}

/** Render a public URL in headless chromium; null on any failure. */
export async function renderPage(url: string): Promise<Rendered | null> {
  try {
    const [{ default: chromium }, pw] = await Promise.all([
      import("@sparticuz/chromium"),
      import("playwright-core"),
    ]);
    const executablePath = await chromium.executablePath();
    if (!executablePath) {
      console.warn("[appmot-render] executablePath is empty");
      return null;
    }
    const browser = await pw.chromium.launch({
      executablePath,
      args: chromium.args,
      headless: true,
    });
    try {
      const page = await browser.newPage();
      await page.goto(url, { waitUntil: "load", timeout: RENDER_TIMEOUT_MS });
      // give the SPA a moment to hydrate and fill the DOM
      await page.waitForTimeout(2500);
      const html = await page.content();
      console.warn("[appmot-render] ok, bytes:", html.length);
      return { html, finalUrl: page.url() };
    } finally {
      await browser.close().catch(() => {});
    }
  } catch (e) {
    console.warn("[appmot-render] failed:", e instanceof Error ? e.message : String(e));
    return null;
  }
}
