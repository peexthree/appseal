import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";
import { getScan } from "@/lib/scanner/store";
import { GRADE_META } from "@/lib/scanner/grade";
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

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id") ?? "";
  const scan = await getScan(id);

  const grade = scan?.grade ?? "A+";
  const score = scan ? scan.score : 100;
  const host = scan ? scan.host : "appseal.online";
  const meta = GRADE_META[grade as keyof typeof GRADE_META] ?? GRADE_META["A+"];

  // Read trophy image as base64
  let trophyBase64 = "";
  try {
    const root = path.resolve("public");
    const filePath = path.resolve(root, TROPHY_FILE[grade as keyof typeof TROPHY_FILE] ?? "E.png");
    if (!filePath.startsWith(root + path.sep)) throw new Error("path escapes public root");
    const buf = await fs.readFile(filePath);
    trophyBase64 = `data:image/png;base64,${buf.toString("base64")}`;
  } catch {
    // fallback
  }

  const fails = scan ? scan.results.filter((r) => r.status === "fail").length : 0;
  const warns = scan ? scan.results.filter((r) => r.status === "warn").length : 0;
  const passes = scan ? scan.results.filter((r) => r.status === "pass" || r.status === "info").length : 24;

  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          backgroundColor: "#090D16",
          padding: "48px 60px",
          fontFamily: "system-ui, -apple-system, sans-serif",
          color: "#F8FAFC",
          border: `3px solid ${meta.color}40`,
          position: "relative",
        }}
      >
        {/* Ambient background glow */}
        <div
          style={{
            position: "absolute",
            top: "-120px",
            left: "-120px",
            width: "500px",
            height: "500px",
            borderRadius: "500px",
            background: meta.color,
            opacity: 0.12,
            filter: "blur(120px)",
          }}
        />

        {/* Top Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            width: "100%",
            zIndex: 10,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div
              style={{
                width: "36px",
                height: "36px",
                borderRadius: "10px",
                background: "rgba(56, 189, 248, 0.15)",
                border: "1px solid rgba(56, 189, 248, 0.4)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#38BDF8",
                fontWeight: 900,
                fontSize: "18px",
              }}
            >
              🛡
            </div>
            <span
              style={{
                fontSize: "22px",
                fontWeight: 800,
                letterSpacing: "-0.5px",
                color: "#F8FAFC",
              }}
            >
              AppSeal<span style={{ color: "#38BDF8" }}>.online</span>
            </span>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "6px 16px",
              borderRadius: "20px",
              background: "rgba(255, 255, 255, 0.05)",
              border: "1px solid rgba(255, 255, 255, 0.1)",
              fontSize: "13px",
              fontWeight: 700,
              letterSpacing: "1px",
              textTransform: "uppercase",
              color: "#94A3B8",
            }}
          >
            ТЕХОСМОТР БЕЗОПАСНОСТИ • 24 ПРОВЕРКИ
          </div>
        </div>

        {/* Center Content: Trophy + Details */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "54px",
            margin: "auto 0",
            zIndex: 10,
          }}
        >
          {/* Trophy image */}
          <div
            style={{
              position: "relative",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "240px",
              height: "240px",
              flexShrink: 0,
            }}
          >
            {trophyBase64 ? (
              <img
                src={trophyBase64}
                alt="AppSeal Trophy"
                width="240"
                height="240"
                style={{
                  objectFit: "contain",
                }}
              />
            ) : (
              <div
                style={{
                  width: "180px",
                  height: "180px",
                  borderRadius: "24px",
                  background: meta.color,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "72px",
                  fontWeight: 900,
                  color: "#FFFFFF",
                }}
              >
                {grade}
              </div>
            )}
          </div>

          {/* Details */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "12px",
              flex: 1,
            }}
          >
            {/* Grade tag */}
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <span
                style={{
                  padding: "4px 14px",
                  borderRadius: "8px",
                  background: `${meta.color}25`,
                  border: `1.5px solid ${meta.color}60`,
                  color: meta.color,
                  fontSize: "15px",
                  fontWeight: 800,
                  textTransform: "uppercase",
                }}
              >
                Класс {grade} • {meta.label.ru}
              </span>
              <span
                style={{
                  fontSize: "18px",
                  fontWeight: 800,
                  color: meta.color,
                }}
              >
                {score}/100 баллов
              </span>
            </div>

            {/* Target host */}
            <div
              style={{
                fontSize: "44px",
                fontWeight: 900,
                color: "#FFFFFF",
                letterSpacing: "-1px",
                lineHeight: 1.1,
                wordBreak: "break-all",
              }}
            >
              {host}
            </div>

            {/* Checks counter */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "20px",
                marginTop: "8px",
                fontSize: "16px",
                color: "#94A3B8",
              }}
            >
              <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <span style={{ color: "#34D399" }}>✔</span> {passes} в норме
              </span>
              {warns > 0 && (
                <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <span style={{ color: "#FBBF24" }}>⚠</span> {warns} замечаний
                </span>
              )}
              {fails > 0 && (
                <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <span style={{ color: "#F87171" }}>✖</span> {fails} уязвимостей
                </span>
              )}
              {fails === 0 && warns === 0 && (
                <span style={{ display: "flex", alignItems: "center", gap: "6px", color: "#34D399" }}>
                  ★ 100% защита пройдена
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Footer info */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            paddingTop: "24px",
            borderTop: "1px solid rgba(255, 255, 255, 0.08)",
            fontSize: "14px",
            color: "#64748B",
            zIndex: 10,
          }}
        >
          <div>Независимый слой доверия для веб-приложений, собранных с ИИ</div>
          <div style={{ color: "#38BDF8", fontWeight: 600 }}>Проверить свой сайт → appseal.online</div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      // per-scan OG images are immutable; cache them at the edge so social
      // crawler fetches do not burn the Fast Origin Transfer quota
      headers: { "cache-control": "public, max-age=86400, s-maxage=86400" },
    },
  );
}
