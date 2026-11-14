import { NextRequest } from "next/server";
import { getScan } from "@/lib/scanner/store";
import { GRADE_META } from "@/lib/scanner/grade";
import { hasPassAccess } from "@/lib/passes";
import { promises as fs } from "node:fs";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Whitelist of trophy images per grade. Kept in-file on purpose: the file
 *  path must never depend on any externally influenced value. */
const TROPHY_FILE = {
  "A+": "Aplus.png",
  A: "A.png",
  B: "B.png",
  C: "C.png",
  D: "D.png",
  E: "E.png",
} as const;

/** Honest placeholder shown when the scanned host has no live Launch Pass:
 *  the trust seal is a paid benefit, a lapsed pass must not keep displaying it. */
const GATE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="228" height="44" viewBox="0 0 228 44" role="img" aria-label="AppSeal badge: Launch Pass required"><rect width="228" height="44" rx="8" fill="#080B11"/><rect x="0.5" y="0.5" width="227" height="43" rx="7.5" fill="none" stroke="#1E293B"/><text x="14" y="19" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-size="11" font-weight="700" fill="#38BDF8">AppSeal</text><text x="14" y="34" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-size="10" fill="#7C8BA1">badge - Launch Pass required</text></svg>`;

/** Badge endpoint:
 *  - style=trophy | format=png -> 512x512 3D trophy PNG
 *  - default -> vector shield SVG with cyber-security theme
 */
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id") ?? "";
  const style = req.nextUrl.searchParams.get("style") ?? req.nextUrl.searchParams.get("format");
  const theme = req.nextUrl.searchParams.get("theme") === "light" ? "light" : "dark";
  const langParam = req.nextUrl.searchParams.get("lang");
  const scan = await getScan(id);

  // Launch Pass gate: without a live pass on the scanned host the badge
  // renders as the placeholder (no-store - a purchase changes the answer)
  if (scan && !(await hasPassAccess(scan.host))) {
    return new Response(GATE_SVG, {
      headers: {
        "content-type": "image/svg+xml; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  }

  const grade = scan?.grade ?? "E";
  const meta = GRADE_META[grade as keyof typeof GRADE_META] ?? GRADE_META["E"];

  // 3D Trophy mode: return the 512x512 transparent PNG image
  if (style === "trophy" || style === "png") {
    try {
      const root = path.resolve("public");
      const filePath = path.resolve(root, TROPHY_FILE[grade as keyof typeof TROPHY_FILE] ?? "E.png");
      if (!filePath.startsWith(root + path.sep)) {
        return new Response("Not found", { status: 404 });
      }
      const buffer = await fs.readFile(filePath);
      return new Response(buffer, {
        headers: {
          "content-type": "image/png",
          "cache-control": "public, max-age=300",
        },
      });
    } catch {
      // fallback to redirect if file read fails
      return Response.redirect(
        new URL(`/${TROPHY_FILE[grade as keyof typeof TROPHY_FILE] ?? "E.png"}`, req.url),
        307,
      );
    }
  }

  // Classic SVG badge mode with 6-tier palette
  const score = scan ? String(scan.score) : "--";
  const color = meta.color;
  const secondaryColor = meta.secondaryColor;
  const rawHost = scan ? scan.host : "appseal.online";
  const cleanHost = rawHost.replace(/^www\./i, "");
  const hostDisplay = cleanHost.length > 24 ? cleanHost.slice(0, 22) + "…" : cleanHost;

  const baseW = 228;
  const neededW = Math.round(44 + hostDisplay.length * 7.2 + 64);
  const W = Math.max(baseW, Math.min(276, neededW));
  const H = 44;

  const pillW = 54;
  const pillH = 32;
  const pillX = W - pillW - 6;
  const pillY = 6;
  const pillMidX = pillX + pillW / 2;

  const isRu = langParam === "ru" || (!langParam && scan?.lang === "ru");
  const subLabel = isRu ? "APPSEAL ПРОВЕРЕНО" : "APPSEAL VERIFIED";

  const fontSans = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
  const fontMono = "'JetBrains Mono', Menlo, Consolas, monospace";

  const bg = theme === "light" ? "#FFFFFF" : "#080B11";
  const fg = theme === "light" ? "#0F172A" : "#F8FAFC";
  const mut = theme === "light" ? "#64748B" : "#7C8BA1";
  const pillBg = theme === "light" ? "#F1F5F9" : "#101522";
  const borderStroke = theme === "light" ? color : "url(#borderGrad)";

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="AppSeal verified ${grade}">
  <defs>
    <linearGradient id="borderGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${color}" stop-opacity="0.8"/>
      <stop offset="40%" stop-color="${color}" stop-opacity="0.25"/>
      <stop offset="100%" stop-color="${secondaryColor}" stop-opacity="0.7"/>
    </linearGradient>
    <linearGradient id="shieldGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="${color}"/>
      <stop offset="100%" stop-color="${secondaryColor}"/>
    </linearGradient>
    <radialGradient id="glow" cx="21" cy="22" r="22" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="${color}" stop-opacity="0.25"/>
      <stop offset="100%" stop-color="#080B11" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <!-- Card background -->
  <rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="8" fill="${bg}" stroke="${borderStroke}" stroke-width="1"/>
  <!-- Ambient glow around shield -->
  <circle cx="21" cy="22" r="20" fill="url(#glow)"/>

  <!-- Shield Icon -->
  <g transform="translate(11, 10)">
    <path d="M11 2 L20 5.5 V12 C20 17.6 16.2 21.6 11 24 C5.8 21.6 2 17.6 2 12 V5.5 Z" fill="url(#shieldGrad)"/>
    <path d="M7.5 12.5 L10 15 L14.5 9.5" fill="none" stroke="#080B11" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
  </g>

  <!-- Text: Brand & Host -->
  <text x="40" y="16.5" font-family="${fontSans}" font-size="8" font-weight="700" fill="${mut}" letter-spacing="0.8">${subLabel}</text>
  <text x="40" y="31.5" font-family="${fontSans}" font-size="12" font-weight="700" fill="${fg}">${escapeXml(hostDisplay)}</text>

  <!-- Right: Grade Box -->
  <rect x="${pillX}" y="${pillY}" width="${pillW}" height="${pillH}" rx="6" fill="${pillBg}" stroke="${color}" stroke-width="0.8" stroke-opacity="0.5"/>
  <text x="${pillMidX}" y="20.5" text-anchor="middle" font-family="${fontSans}" font-size="${grade.length > 1 ? 13.5 : 15}" font-weight="900" fill="${color}">${grade}</text>
  <text x="${pillMidX}" y="31.5" text-anchor="middle" font-family="${fontMono}" font-size="8.5" font-weight="700" fill="#94A3B8">${score}/100</text>
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
