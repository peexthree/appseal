/**
 * Pure cache-header contract for the /api/badge endpoint, split out of
 * route.ts so tests can assert it without pulling next/server into plain
 * node --test (same pattern as api/healthz/payload.ts).
 *
 * A badge is a hot embeddable asset: under viral traffic the endpoint must be
 * served from the CDN, not re-run the Redis pass gate on every view. 5 minutes
 * matches the existing badge lag (an embedded badge shows the live rank with
 * a small delay); stale-while-revalidate keeps serving the last badge while
 * the CDN refreshes in the background. Vary: Accept separates the SVG and
 * PNG variants.
 */
export const BADGE_CACHE_HEADERS = {
  "cache-control": "public, max-age=300, s-maxage=300, stale-while-revalidate=3600",
  "cdn-cache-control": "public, max-age=300",
  vary: "Accept",
} as const;
