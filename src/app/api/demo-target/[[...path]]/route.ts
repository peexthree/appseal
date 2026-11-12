import { NextRequest, NextResponse } from "next/server";
import { demoFixtureResponse } from "@/lib/scanner/demo-fixture";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Public demo target served by AppSeal itself: a deliberately vulnerable
 * vibe-coded app used by the "scan the demo app" button in production.
 * Local dev keeps the identical standalone fixture on 127.0.0.1:3210.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ path?: string[] }> },
) {
  const { path } = await params;
  const suffix = path && path.length ? "/" + path.join("/") : "";
  const hit = demoFixtureResponse("/api/demo-target" + suffix);
  if (!hit) {
    return new NextResponse("404 not found", { status: 404 });
  }
  // same leaky defaults as the local fixture
  const res = new NextResponse(hit.body, {
    status: hit.status,
    headers: {
      "content-type": hit.contentType,
      "set-cookie": "session=abc123; Path=/",
      "access-control-allow-origin": "*",
    },
  });
  return res;
}
