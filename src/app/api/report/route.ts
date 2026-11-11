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
  return new Response(Buffer.from(bytes), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="appmot-report-${safeHost}-${scan.id}.pdf"`,
      "cache-control": "no-store",
    },
  });
}
