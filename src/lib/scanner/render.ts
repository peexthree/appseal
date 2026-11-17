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

/* Global render semaphore: each playwright browser costs ~150-300 MB RSS, so
 * more than two concurrent renders can OOM a small serverless container or a
 * thin VPS. A simple promise queue caps in-flight renderPage() calls; callers
 * beyond the cap wait, and waiting longer than RENDER_QUEUE_WAIT_MS aborts
 * with an error (renderPage turns it into null - the scan falls back to raw
 * HTML, same as any other render failure). */
const MAX_CONCURRENT_RENDERS = 2;
const RENDER_QUEUE_WAIT_MS = 30_000;

interface RenderQueueWaiter {
  settled: boolean;
  timer: ReturnType<typeof setTimeout> | null;
  resolve: () => void;
  reject: (e: Error) => void;
}

const renderQueue: RenderQueueWaiter[] = [];
let activeRenders = 0;

function releaseRenderSlot(): void {
  activeRenders = Math.max(0, activeRenders - 1);
  while (renderQueue.length > 0) {
    const w = renderQueue.shift() as RenderQueueWaiter;
    if (w.settled) continue; // timed out while queued - already rejected
    w.settled = true;
    if (w.timer) clearTimeout(w.timer);
    activeRenders += 1; // hand the slot over without dropping the count
    w.resolve();
    return;
  }
}

function acquireRenderSlot(): Promise<void> {
  if (activeRenders < MAX_CONCURRENT_RENDERS) {
    activeRenders += 1;
    return Promise.resolve();
  }
  return new Promise<void>((resolve, reject) => {
    const w: RenderQueueWaiter = {
      settled: false,
      timer: null,
      resolve,
      reject,
    };
    w.timer = setTimeout(() => {
      if (w.settled) return;
      w.settled = true;
      const i = renderQueue.indexOf(w);
      if (i >= 0) renderQueue.splice(i, 1);
      reject(
        new Error(
          `render queue timeout: waited ${RENDER_QUEUE_WAIT_MS}ms for a free slot (max ${MAX_CONCURRENT_RENDERS} concurrent renders)`,
        ),
      );
    }, RENDER_QUEUE_WAIT_MS);
    renderQueue.push(w);
  });
}

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
  try {
    await acquireRenderSlot();
  } catch (e) {
    console.warn("[appseal-render] queue:", e instanceof Error ? e.message : String(e));
    return null;
  }
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
    releaseRenderSlot();
    await browser?.close().catch(() => {});
  }
}
