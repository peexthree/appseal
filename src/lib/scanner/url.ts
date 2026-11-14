export const DEMO_HOST = "http://127.0.0.1:3210";

/**
 * Normalize a user-supplied target: default scheme, demo:// pass-through.
 * Lives in its own module so lightweight routes (ticks) can import it without
 * pulling the whole scanner engine (chromium bundle) through the barrel.
 */
export function normalizeInputUrl(input: string): { url: string; isDemo: boolean } {
  const t = input.trim();
  if (/^demo:\/\//i.test(t) || /^@demo$/i.test(t)) {
    return { url: DEMO_HOST, isDemo: true };
  }
  let u = t;
  if (!/^https?:\/\//i.test(u)) u = "https://" + u;
  const parsed = new URL(u);
  return { url: parsed.toString(), isDemo: false };
}
