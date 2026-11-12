import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { ScanResult, CheckResult, Localized } from "./types";
import { GRADE_META, SEVERITY_META, STATUS_LABEL } from "./grade";

// DejaVu fonts ship with the repo under assets/fonts (statically scoped so
// Next.js traces only this folder); system paths are a dev fallback.
const FONT_NAMES = {
  reg: "DejaVuSans.ttf",
  bold: "DejaVuSans-Bold.ttf",
  mono: "DejaVuSansMono.ttf",
} as const;

const SYSTEM_FONT_FILES = {
  reg: ["/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "C:/Windows/Fonts/DejaVuSans.ttf"],
  bold: ["/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", "C:/Windows/Fonts/DejaVuSans-Bold.ttf"],
  mono: ["/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf", "C:/Windows/Fonts/DejaVuSansMono.ttf"],
} as const;

async function resolveFont(which: keyof typeof FONT_NAMES): Promise<string> {
  const bundled = path.join(process.cwd(), "assets", "fonts", FONT_NAMES[which]);
  try {
    await fs.access(bundled);
    return bundled;
  } catch {
    // dev fallback: probe literal system paths (same filenames)
    for (const candidate of SYSTEM_FONT_FILES[which]) {
      try {
        await fs.access(candidate);
        return candidate;
      } catch {
        // try next candidate
      }
    }
    throw new Error(`Font not found: ${FONT_NAMES[which]} (assets/fonts or system dirs)`);
  }
}

const A4: [number, number] = [595.28, 841.89];
const M = 52; // margin
const CW = A4[0] - M * 2; // content width

const C = {
  ink: rgb(0.09, 0.1, 0.12),
  mut: rgb(0.42, 0.44, 0.48),
  line: rgb(0.85, 0.86, 0.88),
  bgSoft: rgb(0.965, 0.97, 0.975),
  crit: rgb(0.94, 0.27, 0.27),
  high: rgb(0.98, 0.45, 0.09),
  med: rgb(0.96, 0.62, 0.04),
  low: rgb(0.55, 0.57, 0.6),
  ok: rgb(0.06, 0.72, 0.51),
};

function sevColor(s: string) {
  return s === "critical" ? C.crit : s === "high" ? C.high : s === "medium" ? C.med : C.low;
}

/** hex string → pdf-lib rgb */
function hex2rgb(h: string) {
  const m = h.replace("#", "");
  return rgb(
    parseInt(m.slice(0, 2), 16) / 255,
    parseInt(m.slice(2, 4), 16) / 255,
    parseInt(m.slice(4, 6), 16) / 255,
  );
}

function t(l: Localized, lang: "ru" | "en"): string {
  return l[lang] ?? l.ru;
}

function wrap(text: string, font: PDFFont, size: number, maxW: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const test = cur ? cur + " " + w : w;
    if (font.widthOfTextAtSize(test, size) <= maxW) cur = test;
    else {
      if (cur) lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

interface Cursor {
  y: number;
  page: PDFPage;
}

function newPage(pdf: PDFDocument, fonts: { reg: PDFFont; bold: PDFFont; mono: PDFFont }, lang: "ru" | "en", pageNo: number): PDFPage {
  const page = pdf.addPage(A4);
  page.drawText("AppSeal", { x: M, y: 26, size: 8, font: fonts.bold, color: C.mut });
  page.drawText(lang === "ru" ? "Отчёт техосмотра приложения" : "Application trust report", {
    x: M + 46,
    y: 26,
    size: 8,
    font: fonts.reg,
    color: C.mut,
  });
  page.drawText(String(pageNo), { x: A4[0] - M - 10, y: 26, size: 8, font: fonts.reg, color: C.mut });
  return page;
}

export async function buildReportPdf(scan: ScanResult): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  // turbopackIgnore: font lookup is runtime-probed; the files are bundled via
  // outputFileTracingIncludes in next.config.ts
  const reg = await pdf.embedFont(await fs.readFile(/* turbopackIgnore: true */ await resolveFont("reg")), { subset: true });
  const bold = await pdf.embedFont(await fs.readFile(/* turbopackIgnore: true */ await resolveFont("bold")), { subset: true });
  const mono = await pdf.embedFont(await fs.readFile(/* turbopackIgnore: true */ await resolveFont("mono")), { subset: true });
  const lang = scan.lang;
  pdf.setTitle(`AppSeal report — ${scan.host}`);
  pdf.setAuthor("AppSeal");
  pdf.setSubject(lang === "ru" ? "Отчёт техосмотра ИИ-собранного приложения" : "Trust report for an AI-built application");

  let pageNo = 1;
  let page = newPage(pdf, { reg, bold, mono }, lang, pageNo);
  let y = A4[1] - M;

  const ensure = (need: number) => {
    if (y - need < 56) {
      page = newPage(pdf, { reg, bold, mono }, lang, ++pageNo);
      y = A4[1] - M;
    }
  };

  const text = (
    s: string,
    o: { x?: number; size?: number; font?: PDFFont; color?: ReturnType<typeof rgb>; maxW?: number; gap?: number } = {},
  ) => {
    const size = o.size ?? 9.5;
    const font = o.font ?? reg;
    const maxW = o.maxW ?? CW - (o.x ? o.x - M : 0);
    for (const line of wrap(s, font, size, maxW)) {
      ensure(size + 4);
      page.drawText(line, { x: o.x ?? M, y: y - size, size, font, color: o.color ?? C.ink });
      y -= size + 2.5;
    }
    y -= o.gap ?? 0;
  };

  /* ---------------- header band ---------------- */
  const gm = GRADE_META[scan.grade];
  page.drawRectangle({ x: M, y: A4[1] - M - 118, width: CW, height: 118, color: C.bgSoft });
  // grade box
  page.drawRectangle({ x: M + 18, y: A4[1] - M - 100, width: 82, height: 82, color: hex2rgb(gm.color) });
  const gsize = 42;
  page.drawText(scan.grade, {
    x: M + 18 + (82 - bold.widthOfTextAtSize(scan.grade, gsize)) / 2,
    y: A4[1] - M - 100 + (82 - gsize) / 2 + 8,
    size: gsize,
    font: bold,
    color: rgb(1, 1, 1),
  });
  page.drawText(lang === "ru" ? "ПЕЧАТЬ ДОВЕРИЯ ПРИЛОЖЕНИЯ" : "APP TRUST SEAL", {
    x: M + 118,
    y: A4[1] - M - 26,
    size: 8,
    font: bold,
    color: C.mut,
  });
  page.drawText(`${scan.host}`, { x: M + 118, y: A4[1] - M - 52, size: 16, font: bold, color: C.ink });
  page.drawText(
    (lang === "ru" ? "Оценка: " : "Score: ") + `${scan.score}/100 — ${t(gm.label, lang)}`,
    { x: M + 118, y: A4[1] - M - 72, size: 10.5, font: reg, color: hex2rgb(gm.color) },
  );
  page.drawText(
    (lang === "ru" ? "Дата: " : "Date: ") +
      new Date(scan.finishedAt || scan.startedAt).toISOString().slice(0, 16).replace("T", " ") +
      " UTC" +
      (scan.platform ? `   ${lang === "ru" ? "Платформа: " : "Platform: "}${scan.platform}` : ""),
    { x: M + 118, y: A4[1] - M - 90, size: 8.5, font: reg, color: C.mut },
  );
  y = A4[1] - M - 134;

  /* ---------------- summary ---------------- */
  const fails = scan.results.filter((r) => r.status === "fail");
  const warns = scan.results.filter((r) => r.status === "warn");
  const passes = scan.results.filter((r) => r.status === "pass").length;

  text(
    lang === "ru"
      ? `Проверено ${scan.results.length} пунктов: ${fails.length} провалено, ${warns.length} с предупреждениями, ${passes} в порядке.`
      : `${scan.results.length} checks completed: ${fails.length} failed, ${warns.length} warnings, ${passes} passed.`,
    { size: 10.5, font: bold, gap: 6 },
  );

  if (fails.length || warns.length) {
    text(
      lang === "ru"
        ? "Сначала перечислены проваленные пункты в порядке важности. Каждый пункт содержит объяснение и доказательства — их достаточно, чтобы починить вручную или отдать агенту для автофикса."
        : "Failed checks are listed first, most important on top. Each entry explains the issue and includes evidence — enough to fix manually or hand to an autofix agent.",
      { color: C.mut, gap: 10 },
    );
  } else {
    text(
      lang === "ru"
        ? "Проваленных пунктов нет — это редкий результат. Поддерживайте уровень: перепроверяйте приложение после каждого изменения."
        : "No failed checks — a rare result. Keep the level: re-scan after every change.",
      { color: C.mut, gap: 10 },
    );
  }

  /* ---------------- findings ---------------- */
  const ordered: CheckResult[] = [
    ...fails,
    ...warns,
    ...scan.results.filter((r) => r.status !== "fail" && r.status !== "warn"),
  ];

  for (const r of ordered) {
    ensure(70);
    const color = r.status === "fail" ? sevColor(r.severity) : r.status === "warn" ? sevColor(r.severity) : C.ok;
    const label = r.status === "fail" || r.status === "warn" ? t(SEVERITY_META[r.severity].label, lang).toUpperCase() : t(STATUS_LABEL[r.status], lang).toUpperCase();

    page.drawRectangle({ x: M, y: y - 13, width: 3.5, height: 14, color });
    page.drawText(label, { x: M + 10, y: y - 10, size: 7.5, font: bold, color });
    page.drawText(t(r.title, lang), { x: M + 10 + bold.widthOfTextAtSize(label, 7.5) + 8, y: y - 10, size: 10.5, font: bold, color: C.ink });
    y -= 20;

    if (r.finding) {
      text(t(r.finding.detail, lang), { x: M + 10, size: 9, color: C.mut, gap: 2 });
      for (const ev of r.finding.evidence.slice(0, 4)) {
        const lines = wrap(ev, mono, 7.3, CW - 20);
        for (const ln of lines.slice(0, 2)) {
          ensure(12);
          page.drawRectangle({ x: M + 8, y: y - 11, width: CW - 8, height: 13.5, color: C.bgSoft });
          page.drawText(ln, { x: M + 14, y: y - 8, size: 7.3, font: mono, color: C.ink });
          y -= 15;
        }
      }
    }
    y -= 8;
  }

  /* ---------------- footer note ---------------- */
  ensure(60);
  page.drawLine({ start: { x: M, y: y - 6 }, end: { x: A4[0] - M, y: y - 6 }, thickness: 0.7, color: C.line });
  text(
    lang === "ru"
      ? "AppSeal — техосмотр для приложений, собранных с ИИ. Сканирование внешнее, чёрный ящик: мы видим только то, что видит посетитель. Полный отчёт доступен онлайн."
      : "AppSeal — the trust seal for AI-built apps. The scan is external black-box: we only see what a visitor sees. The interactive report is available online.",
    { size: 7.8, color: C.mut, gap: 2 },
  );

  return pdf.save();
}
