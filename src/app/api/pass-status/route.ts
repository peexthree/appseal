import { NextRequest } from "next/server";
import { getScan } from "@/lib/scanner/store";
import { hasPassAccess } from "@/lib/passes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Does the scanned host currently hold Launch Pass benefits (PDF + badge)?
 *  Only the scan initiator can ask: the report key must match, so outsiders
 *  cannot probe which domains paid. */
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id") ?? "";
  const key = req.nextUrl.searchParams.get("key") ?? "";
  const scan = await getScan(id);
  if (!scan || scan.status !== "done" || !scan.rkey || scan.rkey !== key) {
    return new Response("forbidden", { status: 403 });
  }
  return Response.json(
    { active: await hasPassAccess(scan.host) },
    { headers: { "cache-control": "no-store" } },
  );
}
