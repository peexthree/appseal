import { NextRequest } from "next/server";
import { getScan } from "@/lib/scanner/store";
import { GRADE_META } from "@/lib/scanner/grade";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

/** Badge SVG: /api/badge?id=...&theme=dark|light
 *  Cyber-security aesthetic: vector shield, mono grade block, date stamp,
 *  thin gradient border. */
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id") ?? "";
  const theme = req.nextUrl.searchParams.get("theme") === "light" ? "light" : "dark";
  const scan = await getScan(id);

  const grade = scan?.grade ?? "…";
  const score = scan ? String(scan.score) : "--";
  const color = scan ? GRADE_META[grade].color : "#6b7280";
  const host = scan ? (scan.host.length > 24 ? scan.host.slice(0, 22) + "…" : scan.host) : "appseal";
  const date = scan
    ? MONTHS[new Date(scan.startedAt).getUTCMonth()] + " " + new Date(scan.startedAt).getUTCFullYear()
    : "";

  const bgL = theme === "light" ? "#ffffff" : "#0b0d10";
  const fgL = theme === "light" ? "#111111" : "#f5f6f7";
  const mutL = theme === "light" ? "#6b7280" : "#9aa1ab";
  const panelL = theme === "light" ? "#f3f4f6" : "#12161c";

  const labelW = 118;
  const gradeW = 56;
  const W = labelW + gradeW;
  const H = 44;
  const mono = "JetBrains Mono,Menlo,Consolas,monospace";

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="AppSeal grade ${grade}">
  <defs>
    <linearGradient id="b" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${color}" stop-opacity="0.9"/>
      <stop offset="1" stop-color="${color}" stop-opacity="0.35"/>
    </linearGradient>
    <linearGradient id="s" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#34d399"/>
      <stop offset="1" stop-color="#059669"/>
    </linearGradient>
  </defs>
  <rect x="0.75" y="0.75" width="${W - 1.5}" height="${H - 1.5}" rx="9" fill="${bgL}" stroke="url(#b)" stroke-width="1.5"/>
  <g transform="translate(12,10)">
    <path d="M12 2 L21 5.5 V12 C21 17.6 17.2 21.6 12 24 C6.8 21.6 3 17.6 3 12 V5.5 Z" fill="url(#s)"/>
    <path d="M8.5 12.4 l2.4 2.4 4.6-4.8" fill="none" stroke="#0b0d10" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
  </g>
  <text x="44" y="16.5" font-family="${mono}" font-size="8.5" fill="${mutL}" letter-spacing="2.5">APPSEAL${date ? " · " + date : ""}</text>
  <text x="44" y="32" font-family="${mono}" font-size="11.5" font-weight="bold" fill="${fgL}">${escapeXml(host)}</text>
  <rect x="${labelW}" y="6" width="${gradeW - 6}" height="${H - 12}" rx="6" fill="${panelL}" stroke="${color}" stroke-opacity="0.55"/>
  <text x="${labelW + (gradeW - 6) / 2}" y="27.5" text-anchor="middle" font-family="${mono}" font-size="14" font-weight="bold" fill="${color}">${grade}</text>
  <text x="${labelW + (gradeW - 6) / 2}" y="${H - 9}" text-anchor="middle" font-family="${mono}" font-size="8.5" fill="${mutL}">${score}/100</text>
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
