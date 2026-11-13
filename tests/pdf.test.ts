import test from "node:test";
import assert from "node:assert/strict";
import { buildReportPdf } from "../src/lib/scanner/report-pdf.ts";
import type { ScanResult } from "../src/lib/scanner/types.ts";

test("buildReportPdf generates valid PDF buffer with trophy and tech passport", async () => {
  const mockScan: ScanResult = {
    id: "test-scan-123",
    inputUrl: "https://example.com",
    targetUrl: "https://example.com",
    host: "example.com",
    score: 98,
    grade: "A+",
    platform: "Vercel",
    lang: "ru",
    isDemo: false,
    stage: { ru: "Завершено", en: "Completed" },
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    status: "done",
    progress: 100,
    results: [
      {
        id: "env_exposure",
        category: "secrets",
        title: { ru: "Файл .env в корне", en: ".env file exposed" },
        status: "pass",
        severity: "critical",
        penalty: 40,
        durationMs: 45,
      },
      {
        id: "security_headers",
        category: "headers",
        title: { ru: "Базовые заголовки безопасности", en: "Security headers" },
        status: "pass",
        severity: "medium",
        penalty: 15,
        durationMs: 30,
      },
    ],
    techPassport: {
      stack: "Next.js (SSR)",
      cdnWaf: "Vercel Edge Network",
      pageSizeKb: 42,
      ttfbMs: 120,
    },
  };

  const pdfBytes = await buildReportPdf(mockScan);
  assert.ok(pdfBytes instanceof Uint8Array);
  assert.ok(pdfBytes.length > 1000);
  // PDF header magic bytes %PDF-
  const header = String.fromCharCode(...pdfBytes.slice(0, 5));
  assert.equal(header, "%PDF-");
});
