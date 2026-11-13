import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { ScanResult, CheckResult, Localized, CategoryId } from "./types.ts";
import { GRADE_META, SEVERITY_META, STATUS_LABEL } from "./grade.ts";
import { buildFixPrompt } from "../fix-prompt.ts";

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

// Single light palette: the whole document shares one visual language.
const C = {
  ink: rgb(0.09, 0.1, 0.12),
  mut: rgb(0.42, 0.44, 0.48),
  faint: rgb(0.62, 0.65, 0.69),
  line: rgb(0.85, 0.86, 0.88),
  bgSoft: rgb(0.965, 0.97, 0.975),
  crit: rgb(0.85, 0.21, 0.21),
  high: rgb(0.91, 0.39, 0.04),
  med: rgb(0.83, 0.53, 0.02),
  low: rgb(0.45, 0.48, 0.52),
  ok: rgb(0.02, 0.6, 0.43),
};

const CAT_TITLES: Record<CategoryId, { ru: string; en: string }> = {
  secrets: { ru: "Секреты и утечки", en: "Secrets & Leaks" },
  headers: { ru: "Заголовки и TLS", en: "Headers & TLS" },
  admin: { ru: "Админки и доступ", en: "Admin & Auth" },
  liveness: { ru: "Живость и контент", en: "Liveness & Content" },
};

const CAT_ORDER: CategoryId[] = ["secrets", "headers", "admin", "liveness"];

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

function newPage(pdf: PDFDocument, fonts: { reg: PDFFont; bold: PDFFont; mono: PDFFont }, lang: "ru" | "en", pageNo: number, accent: string): PDFPage {
  const page = pdf.addPage(A4);
  // thin brand stripe across the very top of every page
  page.drawRectangle({ x: 0, y: A4[1] - 4, width: A4[0], height: 4, color: hex2rgb(accent) });
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
  pdf.setTitle(`AppSeal report - ${scan.host}`);
  pdf.setAuthor("AppSeal");
  pdf.setSubject(lang === "ru" ? "Отчёт техосмотра приложения" : "Trust report for application");

  const gm = GRADE_META[scan.grade] ?? GRADE_META["E"];
  const accent = gm.color;

  let pageNo = 1;
  let page = newPage(pdf, { reg, bold, mono }, lang, pageNo, accent);
  let y = A4[1] - M - 6;

  const ensure = (need: number) => {
    if (y - need < 56) {
      page = newPage(pdf, { reg, bold, mono }, lang, ++pageNo, accent);
      y = A4[1] - M - 6;
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

  /* ---------------- Light hero: white card + grade accent ---------------- */
  const heroH = 118;
  const heroY = A4[1] - M - 6 - heroH;
  page.drawRectangle({ x: M, y: heroY, width: CW, height: heroH, color: rgb(1, 1, 1), borderColor: C.line, borderWidth: 0.8 });
  // left accent spine in the grade color
  page.drawRectangle({ x: M, y: heroY, width: 5, height: heroH, color: hex2rgb(accent) });

  // trophy
  let trophyDrawn = false;
  try {
    const root = path.resolve("public");
    const trophyPath = path.resolve(root, TROPHY_FILE[scan.grade as keyof typeof TROPHY_FILE] ?? "E.png");
    if (!trophyPath.startsWith(root + path.sep)) throw new Error("path escapes public root");
    const trophyBytes = await fs.readFile(trophyPath);
    const trophyImg = await pdf.embedPng(trophyBytes);
    page.drawImage(trophyImg, { x: M + 16, y: heroY + 17, width: 84, height: 84 });
    trophyDrawn = true;
  } catch {
    // fallback if file not accessible
  }
  if (!trophyDrawn) {
    page.drawRectangle({ x: M + 20, y: heroY + 19, width: 80, height: 80, color: hex2rgb(gm.color) });
    const gsize = scan.grade.length > 1 ? 36 : 42;
    page.drawText(scan.grade, {
      x: M + 20 + (80 - bold.widthOfTextAtSize(scan.grade, gsize)) / 2,
      y: heroY + 19 + (80 - gsize) / 2 + (scan.grade.length > 1 ? 6 : 8),
      size: gsize,
      font: bold,
      color: rgb(1, 1, 1),
    });
  }

  const textX = M + 116;
  const hx = (dy: number) => heroY + heroH - dy;
  page.drawText(lang === "ru" ? "ПЕЧАТЬ ДОВЕРИЯ APPSEAL" : "APPSEAL TRUST REPORT", {
    x: textX,
    y: hx(26),
    size: 8,
    font: bold,
    color: C.faint,
  });
  page.drawText(scan.host, { x: textX, y: hx(48), size: 16, font: bold, color: C.ink });
  page.drawText(
    (lang === "ru" ? "Класс " : "Grade ") + `${scan.grade} (${scan.score}/100) - ${t(gm.label, lang)}`,
    { x: textX, y: hx(67), size: 10.5, font: bold, color: hex2rgb(accent) },
  );
  page.drawText(
    (lang === "ru" ? "Дата: " : "Date: ") +
      new Date(scan.finishedAt || scan.startedAt).toISOString().slice(0, 16).replace("T", " ") +
      " UTC" +
      (scan.platform ? `   ${lang === "ru" ? "Платформа: " : "Platform: "}${scan.platform}` : ""),
    { x: textX, y: hx(83), size: 8.5, font: reg, color: C.mut },
  );
  if (scan.techPassport) {
    const tp = scan.techPassport;
    page.drawText(
      lang === "ru"
        ? `Стек: ${tp.stack}   •   Сеть: ${tp.cdnWaf}   •   Вес: ${tp.pageSizeKb} КБ   •   TTFB: ${tp.ttfbMs} мс`
        : `Stack: ${tp.stack}   •   Network: ${tp.cdnWaf}   •   Size: ${tp.pageSizeKb} KB   •   TTFB: ${tp.ttfbMs} ms`,
      { x: textX, y: hx(99), size: 7.4, font: reg, color: C.faint },
    );
  }

  y = heroY - 20;

  /* ---------------- 4 category summary cards ---------------- */
  const gap = 8;
  const cardW = (CW - gap * 3) / 4;
  const cardH = 40;

  for (let i = 0; i < CAT_ORDER.length; i++) {
    const cat = CAT_ORDER[i];
    const catItems = scan.results.filter((r) => r.category === cat);
    const passed = catItems.filter((r) => r.status === "pass" || r.status === "info").length;
    const failed = catItems.filter((r) => r.status === "fail").length;
    const warned = catItems.filter((r) => r.status === "warn").length;
    const total = catItems.length;
    const cx = M + i * (cardW + gap);
    const cy = y - cardH;

    page.drawRectangle({ x: cx, y: cy, width: cardW, height: cardH, color: C.bgSoft, borderColor: C.line, borderWidth: 0.6 });
    page.drawRectangle({ x: cx, y: cy, width: cardW, height: 2.5, color: failed > 0 ? C.crit : warned > 0 ? C.med : C.ok });

    page.drawText(CAT_TITLES[cat][lang], {
      x: cx + 6,
      y: cy + cardH - 13,
      size: 6.8,
      font: bold,
      color: C.ink,
    });
    const statusTxt = `${passed}/${total}`;
    const scoreColor = failed > 0 ? C.crit : warned > 0 ? C.med : C.ok;
    page.drawText(statusTxt, {
      x: cx + cardW - bold.widthOfTextAtSize(statusTxt, 9) - 6,
      y: cy + cardH - 26,
      size: 9,
      font: bold,
      color: scoreColor,
    });
    const word = lang === "ru" ? "в норме" : "OK";
    page.drawText(word, {
      x: cx + 6,
      y: cy + 9,
      size: 7,
      font: reg,
      color: C.mut,
    });
  }

  y -= cardH + 18;

  /* ---------------- Summary ---------------- */
  const fails = scan.results.filter((r) => r.status === "fail");
  const warns = scan.results.filter((r) => r.status === "warn");
  const passes = scan.results.filter((r) => r.status === "pass").length;
  const infos = scan.results.filter((r) => r.status === "info").length;
  const skips = scan.results.filter((r) => r.status === "skip").length;

  function plural(n: number, one: string, few: string, many: string): string {
    const mod10 = n % 10;
    const mod100 = n % 100;
    if (mod100 >= 11 && mod100 <= 19) return many;
    if (mod10 === 1) return one;
    if (mod10 >= 2 && mod10 <= 4) return few;
    return many;
  }

  const countWord = plural(scan.results.length, "пункт", "пункта", "пунктов");
  const summaryMsg =
    lang === "ru"
      ? `Проверено ${scan.results.length} ${countWord}: ${fails.length} провалено, ${warns.length} с предупреждениями, ${passes} в норме${infos > 0 ? `, ${infos} инфо` : ""}${skips > 0 ? `, ${skips} пропущено` : ""}.`
      : `${scan.results.length} checks completed: ${fails.length} failed, ${warns.length} warnings, ${passes} passed${infos > 0 ? `, ${infos} info` : ""}${skips > 0 ? `, ${skips} skipped` : ""}.`;

  text(summaryMsg, { size: 10.5, font: bold, gap: 4 });
  text(
    lang === "ru"
      ? "Ниже - замечания по категориям в порядке важности. Каждый пункт содержит объяснение и доказательства: их достаточно, чтобы починить вручную или отдать ИИ-агенту."
      : "Below - findings grouped by category, most important first. Each entry explains the issue with evidence: enough to fix manually or hand to an AI agent.",
    { color: C.mut, gap: 8 },
  );

  /* ---------------- Findings grouped by category ---------------- */
  const isProblem = (r: CheckResult) => r.status === "fail" || r.status === "warn";

  const drawProblemRow = (r: CheckResult) => {
    ensure(60);
    const color = isProblem(r) ? sevColor(r.severity) : C.ok;
    const label = t(SEVERITY_META[r.severity].label, lang).toUpperCase();

    page.drawRectangle({ x: M, y: y - 13, width: 3.5, height: 14, color });
    page.drawText(label, { x: M + 10, y: y - 10, size: 7.5, font: bold, color });
    page.drawText(t(r.title, lang), { x: M + 10 + bold.widthOfTextAtSize(label, 7.5) + 8, y: y - 10, size: 10, font: bold, color: C.ink });
    y -= 19;

    if (r.finding) {
      text(t(r.finding.detail, lang), { x: M + 10, size: 8.8, color: C.mut, gap: 2 });
      for (const ev of r.finding.evidence.slice(0, 3)) {
        const lines = wrap(ev, mono, 7.2, CW - 20);
        for (const ln of lines.slice(0, 2)) {
          ensure(12);
          page.drawRectangle({ x: M + 8, y: y - 11, width: CW - 8, height: 13, color: C.bgSoft });
          page.drawText(ln, { x: M + 14, y: y - 8, size: 7.2, font: mono, color: C.ink });
          y -= 14.5;
        }
      }
    }
    y -= 6;
  };

  const drawPassedBlock = (items: CheckResult[], skipped: CheckResult[]) => {
    const names = items.map((r) => t(r.title, lang));
    const chunk = lang === "ru" ? "Без замечаний" : "No findings";
    ensure(24);
    page.drawText(chunk + ":", { x: M + 10, y: y - 10, size: 8.2, font: bold, color: C.ok });
    y -= 14;
    text(names.join("  ·  "), { x: M + 10, size: 7.8, color: C.faint, gap: 2 });
    if (skipped.length) {
      const labels = skipped.map((r) => t(r.title, lang)).join("  ·  ");
      text((lang === "ru" ? "Пропущено честно: " : "Skipped honestly: ") + labels, { x: M + 10, size: 7.8, color: C.faint, gap: 2 });
    }
  };

  CAT_ORDER.forEach((cat, idx) => {
    const items = scan.results.filter((r) => r.category === cat);
    if (!items.length) return;
    const problems = items.filter(isProblem);
    const ok = items.filter((r) => r.status === "pass" || r.status === "info");
    const skipped = items.filter((r) => r.status === "skip");
    const failed = problems.filter((r) => r.status === "fail").length;
    const warned = problems.filter((r) => r.status === "warn").length;

    // category header - force a fresh page if less than 120pt remains
    if (y - 120 < 56 && pageNo > 1) {
      page = newPage(pdf, { reg, bold, mono }, lang, ++pageNo, accent);
      y = A4[1] - M - 6;
    }
    ensure(40);
    page.drawRectangle({ x: M, y: y - 18, width: CW, height: 20, color: C.bgSoft });
    page.drawRectangle({ x: M, y: y - 18, width: 3.5, height: 20, color: failed ? C.crit : warned ? C.med : C.ok });
    page.drawText(
      `${idx + 1}. ${CAT_TITLES[cat][lang]}  ·  ${ok.length}/${items.length} ${lang === "ru" ? "в норме" : "OK"}`,
      { x: M + 10, y: y - 12.5, size: 10.5, font: bold, color: C.ink },
    );
    y -= 30;

    if (problems.length) {
      for (const r of problems) drawProblemRow(r);
    } else {
      text(
        lang === "ru" ? "Все проверки этой категории пройдены без замечаний." : "Every check in this category passed without findings.",
        { size: 8.8, color: C.ok, gap: 4 },
      );
    }
    if (ok.length || skipped.length) {
      drawPassedBlock(ok, skipped);
    }
    y -= 10;
  });

  /* ---------------- AI Fix Prompt Block ---------------- */
  if (scan.score < 100 || scan.grade !== "A+") {
    ensure(130);
    page.drawLine({ start: { x: M, y: y - 4 }, end: { x: A4[0] - M, y: y - 4 }, thickness: 0.7, color: C.line });
    y -= 14;

    text(
      lang === "ru"
        ? "ИНСТРУКЦИЯ ДЛЯ ИИ-АВТОФИКСА (CURSOR / CLAUDE / CHATGPT)"
        : "AI AUTOFIX INSTRUCTION (CURSOR / CLAUDE / COPILOT)",
      { size: 9, font: bold, color: hex2rgb(accent), gap: 3 },
    );
    text(
      lang === "ru"
        ? "Скопируйте этот контекст и передайте вашему ИИ-редактору кода для автоматического устранения замечаний:"
        : "Provide this context snippet to your AI coding agent to resolve the reported findings:",
      { size: 8, color: C.mut, gap: 6 },
    );

    const fullPrompt = buildFixPrompt(scan, lang);
    const rawLines = fullPrompt.split("\n");
    const displayLines: string[] = [];
    for (const raw of rawLines) {
      if (!raw.trim()) {
        displayLines.push("");
        continue;
      }
      const wrapped = wrap(raw, mono, 6.8, CW - 24);
      displayLines.push(...wrapped);
      if (displayLines.length >= 22) break;
    }

    const linesToDraw = displayLines.slice(0, 20);
    const boxH = Math.min(linesToDraw.length * 10 + 16, 210);
    ensure(boxH + 10);

    page.drawRectangle({ x: M, y: y - boxH, width: CW, height: boxH, color: C.bgSoft, borderColor: C.line, borderWidth: 0.7 });

    let py = y - 12;
    for (const pline of linesToDraw) {
      if (py < y - boxH + 6) break;
      if (pline) {
        page.drawText(pline, { x: M + 10, y: py, size: 6.8, font: mono, color: C.ink });
      }
      py -= 10;
    }
    y -= boxH + 12;
  }

  /* ---------------- Footer Note ---------------- */
  ensure(60);
  page.drawLine({ start: { x: M, y: y - 6 }, end: { x: A4[0] - M, y: y - 6 }, thickness: 0.7, color: C.line });
  text(
    lang === "ru"
      ? "AppSeal - печать доверия для приложений, собранных с ИИ. Сканирование внешнее, чёрный ящик: мы видим только то, что видит посетитель. Интерактивный отчёт доступен онлайн."
      : "AppSeal - the trust seal for AI-built apps. The scan is external black-box: we only see what a visitor sees. The interactive report is available online.",
    { size: 7.8, color: C.mut, gap: 2 },
  );

  return pdf.save();
}
