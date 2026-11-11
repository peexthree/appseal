import { NextRequest } from "next/server";
import { getScan } from "@/lib/scanner/store";
import { GRADE_META } from "@/lib/scanner/grade";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Badge SVG: /api/badge?id=...&theme=dark|light */
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id") ?? "";
  const theme = req.nextUrl.searchParams.get("theme") === "light" ? "light" : "dark";
  const scan = await getScan(id);

  const grade = scan?.grade ?? "…";
  const score = scan ? String(scan.score) : "--";
  const color = scan ? GRADE_META[grade].color : "#6b7280";
  const host = scan ? (scan.host.length > 22 ? scan.host.slice(0, 20) + "…" : scan.host) : "appmot";

  const bgL = theme === "light" ? "#ffffff" : "#0b0d10";
  const fgL = theme === "light" ? "#111111" : "#f5f6f7";
  const mutL = theme === "light" ? "#6b7280" : "#9aa1ab";

  const labelW = 74;
  const scoreW = 58;
  const W = labelW + scoreW;
  const H = 40;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="AppMOT grade ${grade}">
  <rect rx="8" width="${W}" height="${H}" fill="${bgL}" stroke="#26292f"/>
  <text x="12" y="16" font-family="Verdana,Arial,sans-serif" font-size="9" fill="${mutL}" letter-spacing="1">APPMOT</text>
  <text x="12" y="31" font-family="Verdana,Arial,sans-serif" font-size="10.5" fill="${fgL}">${escapeXml(host)}</text>
  <rect x="${labelW}" y="4" width="${scoreW - 8}" height="${H - 8}" rx="5" fill="${color}"/>
  <text x="${labelW + (scoreW - 8) / 2}" y="25.5" text-anchor="middle" font-family="Verdana,Arial,sans-serif" font-size="13" font-weight="bold" fill="#ffffff">${grade} ${score}</text>
</svg>`;

  return new Response(svg, {
    headers: {
      "content-type": "image/svg+xml; charset=utf-8",
      "cache-control": "public, max-age=300",
    },
  });
}

function escapeXml(s: string): string {
  return s.replace(/[<>&'"]/g, (c) =>
    ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c] ?? c,
  );
}
