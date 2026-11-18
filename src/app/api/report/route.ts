import { NextRequest } from "next/server";
import { getScan } from "@/lib/scanner/store";
import { buildReportPdf, validateBrandParams } from "@/lib/scanner/report-pdf";
import { assertPublicTarget } from "@/lib/scanner/guard";
import { hasPassAccess } from "@/lib/passes";
import { secretsMatch } from "@/lib/sec";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// white-label logo limits: 10s download budget, hard 300KB memory cap
const LOGO_TIMEOUT_MS = 10_000;
const LOGO_MAX_BYTES = 300 * 1024;
const LOGO_MAX_REDIRECTS = 3;

/** Download the brand logo into memory (no temp files ever): https-only,
 *  assertPublicTarget re-checked per redirect hop (same SSRF discipline as
 *  the scan route's safeFetch), content-type must be image/png|jpeg and the
 *  body capped at LOGO_MAX_BYTES. Any failure resolves to null - the PDF is
 *  simply built without the logo, never a 500. */
async function fetchBrandLogo(url: string): Promise<Uint8Array | null> {
  let current = url;
  try {
    for (let hop = 0; hop <= LOGO_MAX_REDIRECTS; hop++) {
      const u = new URL(current);
      if (u.protocol !== "https:") return null;
      // SSRF guard before every request (redirects included)
      await assertPublicTarget(u.hostname);
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), LOGO_TIMEOUT_MS);
      let res: Response;
      try {
        res = await fetch(current, { signal: ac.signal, cache: "no-store", redirect: "manual" });
      } finally {
        clearTimeout(timer);
      }
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get("location");
        if (!loc) return null;
        current = new URL(loc, u).toString();
        continue;
      }
      if (!res.ok) return null;
      const ct = (res.headers.get("content-type") ?? "").toLowerCase();
      if (!ct.startsWith("image/png") && !ct.startsWith("image/jpeg") && !ct.startsWith("image/jpg")) {
        return null;
      }
      const buf = await (await res.blob()).arrayBuffer();
      if (buf.byteLength === 0 || buf.byteLength > LOGO_MAX_BYTES) return null;
      return new Uint8Array(buf);
    }
    return null;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id") ?? "";
  const key = req.nextUrl.searchParams.get("key") ?? "";
  const scan = await getScan(id);
  if (!scan || scan.status !== "done") {
    return new Response("report not ready", { status: 404 });
  }
  // the PDF lists every finding: serve it only to the scan initiator
  // holding the report key (bare ids must stay on the public view)
  if (!scan.rkey || !secretsMatch(key, scan.rkey)) {
    return new Response("forbidden", { status: 403 });
  }
  // PDF is a Launch Pass benefit: the scanned host needs a live pass
  // (the UI mirrors this via /api/pass-status and shows the upsell)
  if (!(await hasPassAccess(scan.host))) {
    return Response.json(
      { error: "launch_pass_required", upsell: "launch-pass" },
      { status: 402 },
    );
  }
  // white-label branding is a Launch Pass extra - no separate gate, the pass
  // check above already unlocks it. Invalid params degrade to an unbranded
  // PDF; a failed logo download never breaks the report either.
  const brand = validateBrandParams(
    req.nextUrl.searchParams.get("logo"),
    req.nextUrl.searchParams.get("title"),
  );
  let brandLogo: Uint8Array | null = null;
  let brandTitle: string | null = null;
  if (brand.ok) {
    if (brand.logoUrl) {
      brandLogo = await fetchBrandLogo(brand.logoUrl);
    }
    if (brand.title) {
      brandTitle = brand.title;
    }
  }
  const bytes = await buildReportPdf(scan, brandLogo, brandTitle);
  const safeHost = scan.host.replace(/[^a-z0-9.-]/gi, "");
  const body = new Uint8Array(bytes);
  // Explicit Content-Length: proxies (preview gateways) mishandle chunked
  // downloads without a known size and interrupt the transfer.
  return new Response(body, {
    headers: {
      "content-type": "application/pdf",
      "content-length": String(body.byteLength),
      "content-disposition": `attachment; filename="appseal-report-${safeHost}-${scan.id}.pdf"`,
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
