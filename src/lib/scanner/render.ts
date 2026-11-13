/**
 * v0.3: JS-rendering for CSR apps (Lovable/Bolt previews render an empty root
 * div server-side). Only runs when the homepage is a client-render shell; any
 * failure falls back to the raw HTML so the scan never breaks because of it.
 *
 * Rendering happens in-process via playwright-core. On Vercel the browser is
 * @sparticuz/chromium (serverless build); on other platforms, e.g. local
 * Windows dev, it fails and we retry through the system Edge/Chrome channel
 * so benchmark runs still see hydrated SPA DOM, not empty CSR shells.
 */

const RENDER_TIMEOUT_MS = 20000;

export function shouldRender(csr: boolean, isDemo: boolean): boolean {
  if (!csr || isDemo) return false;
  return process.env.APPSEAL_RENDER !== "off";
}

interface Rendered {
  html: string;
  finalUrl: string;
}

/** Structural types over playwright-core so the import stays dynamic. */
interface RenderPage {
  goto(url: string, opts: { waitUntil: "load"; timeout: number }): Promise<unknown>;
  waitForTimeout(ms: number): Promise<void>;
  content(): Promise<string>;
  url(): string;
  close(): Promise<void>;
}
interface RenderBrowser {
  newPage(): Promise<RenderPage>;
  close(): Promise<void>;
}

/**
 * Launch headless chromium: serverless build first (Vercel), then the system
 * Edge/Chrome channel (local Windows dev). Null when nothing works.
 */
async function launchBrowser(): Promise<RenderBrowser | null> {
  const pw = await import("playwright-core");
  try {
    const { default: chromium } = await import("@sparticuz/chromium");
    const executablePath = await chromium.executablePath();
    if (executablePath) {
      return await pw.chromium.launch({
        executablePath,
        args: chromium.args,
        headless: true,
      });
    }
    console.warn("[appseal-render] sparticuz executablePath is empty");
  } catch (e) {
    console.warn(
      "[appseal-render] sparticuz unavailable:",
      e instanceof Error ? e.message : String(e),
    );
  }
  for (const channel of ["msedge", "chrome"] as const) {
    try {
      const browser = await pw.chromium.launch({ channel, headless: true });
      console.warn("[appseal-render] using system channel:", channel);
      return browser;
    } catch {
      /* next channel */
    }
  }
  return null;
}

/** Render a public URL in headless chromium; null on any failure. */
export async function renderPage(url: string): Promise<Rendered | null> {
  let browser: RenderBrowser | null = null;
  try {
    browser = await launchBrowser();
    if (!browser) {
      console.warn("[appseal-render] no browser available");
      return null;
    }
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "load", timeout: RENDER_TIMEOUT_MS });
    // give the SPA a moment to hydrate and fill the DOM
    await page.waitForTimeout(2500);
    const html = await page.content();
    console.warn("[appseal-render] ok, bytes:", html.length);
    return { html, finalUrl: page.url() };
  } catch (e) {
    console.warn("[appseal-render] failed:", e instanceof Error ? e.message : String(e));
    return null;
  } finally {
    await browser?.close().catch(() => {});
  }
}
