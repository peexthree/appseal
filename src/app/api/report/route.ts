import { NextRequest } from "next/server";
import { getScan } from "@/lib/scanner/store";
import { buildReportPdf } from "@/lib/scanner/report-pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id") ?? "";
  const scan = await getScan(id);
  if (!scan || scan.status !== "done") {
    return new Response("report not ready", { status: 404 });
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
      "content-disposition": `attachment; filename="appmot-report-${safeHost}-${scan.id}.pdf"`,
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
