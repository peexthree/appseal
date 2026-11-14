import { NextRequest } from "next/server";
import { getScan } from "@/lib/scanner/store";
import { buildReportPdf } from "@/lib/scanner/report-pdf";
import { hasPassAccess } from "@/lib/passes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id") ?? "";
  const key = req.nextUrl.searchParams.get("key") ?? "";
  const scan = await getScan(id);
  if (!scan || scan.status !== "done") {
    return new Response("report not ready", { status: 404 });
  }
  // the PDF lists every finding: serve it only to the scan initiator
  // holding the report key (bare ids must stay on the public view)
  if (!scan.rkey || scan.rkey !== key) {
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
  const bytes = await buildReportPdf(scan);
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
