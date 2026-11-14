import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  shannonEntropy,
  bodiesEquivalent,
  looksLikeDocExample,
  maskSecret,
  truncate,
  extractSiteDesc,
} from "../src/lib/scanner/fetcher.ts";
import { isClientRenderShell } from "../src/lib/scanner/fetcher.ts";
import { buildFixPrompt } from "../src/lib/fix-prompt.ts";
import { registrableDomain } from "../src/lib/scanner/fetcher.ts";
import type { ScanResult } from "../src/lib/scanner/types.ts";

describe("shannonEntropy", () => {
  it("random base62 strings score high", () => {
    assert.ok(shannonEntropy("Ab3xY9kQ2mNpL5vT") >= 3.0);
  });
  it("word-like strings score low", () => {
    assert.ok(shannonEntropy("aaaaaaaabbbbcccc") < 3.0);
  });
});

describe("looksLikeDocExample", () => {
  it("flags your-api-key style values", () => {
    assert.equal(looksLikeDocExample("sk-your-api-key-here-0000", ""), true);
  });
  it("flags documentation context", () => {
    assert.equal(looksLikeDocExample("sk-proj-Ab3xY9kQ2mNpL5vT", "see the docs for details"), true);
  });
  it("passes a real key with neutral context", () => {
    assert.equal(looksLikeDocExample("sk-proj-Ab3xY9kQ2mNpL5vT", "apiKey"), false);
  });
});

describe("bodiesEquivalent (soft-404)", () => {
  it("same body equals", () => {
    assert.equal(bodiesEquivalent("a b", "a b"), true);
    assert.equal(bodiesEquivalent("<html> a </html>", "<html>   a </html>"), true);
  });
  it("different bodies do not equal", () => {
    assert.equal(bodiesEquivalent("<html>admin</html>", "<html>shop</html>"), false);
  });
});

describe("maskSecret", () => {
  it("keeps 4 first and last chars", () => {
    assert.equal(maskSecret("sk-proj-abcdefghijklmnop"), "sk-p…" + "*".repeat(12) + "mnop");
  });
});

describe("isClientRenderShell", () => {
  it("empty root div with no text -> CSR", () => {
    const html = `<html><body><div id="root"></div><script src="/b.js"></script></body></html>`;
    assert.equal(isClientRenderShell(html), true);
  });
  it("SSR content -> not CSR", () => {
    const html = `<html><body><div id="root"><p>${"real content ".repeat(20)}</p></div></body></html>`;
    assert.equal(isClientRenderShell(html), false);
  });
});

describe("extractSiteDesc (registry description)", () => {
  it("prefers meta description over og:description and title", () => {
    const html = `<head>
      <title>Page title only</title>
      <meta property="og:description" content="OG descr">
      <meta name="description" content="Meta descr &amp; more">
    </head>`;
    assert.equal(extractSiteDesc(html), "Meta descr & more");
  });
  it("falls back to og:description then title", () => {
    const og = `<head><title>FreshBite - food</title><meta property="og:description" content="Delivery for night owls"></head>`;
    assert.equal(extractSiteDesc(og), "Delivery for night owls");
    const t = `<head><title>  FreshBite -   food  </title></head>`;
    assert.equal(extractSiteDesc(t), "FreshBite - food");
  });
  it("caps at 160 chars and strips tags in title", () => {
    const t = `<title>${"x".repeat(300)}</title>`;
    assert.equal(extractSiteDesc(t).length, 160);
  });
});

describe("registrableDomain (DMARC lookup base)", () => {
  it("keeps two labels", () => {
    assert.equal(registrableDomain("appseal.online"), "appseal.online");
    assert.equal(registrableDomain("www.example.co"), "example.co");
  });
  it("keeps three labels for co.uk-style TLDs", () => {
    assert.equal(registrableDomain("shop.example.co.uk"), "example.co.uk");
  });
  it("subdomain yields the registrable part", () => {
    assert.equal(registrableDomain("blog.example.com"), "example.com");
  });
});

describe("buildFixPrompt", () => {
  it("includes findings, evidence and platform snippet", () => {
    const scan = {
      id: "t1",
      host: "example.com",
      platform: "Lovable",
      grade: "C",
      score: 62,
      results: [
        {
          id: "security_headers",
          status: "warn",
          severity: "medium",
          category: "headers",
          title: { ru: "Не хватает защитных заголовков", en: "x" },
          durationMs: 1,
          finding: { code: "HEADERS_MISSING", detail: { ru: "", en: "" }, evidence: ["missing: CSP"] },
        },
      ],
    } as unknown as ScanResult;
    const p = buildFixPrompt(scan, "ru");
    assert.ok(p.includes("example.com"));
    assert.ok(p.includes("Не хватает защитных заголовков"));
    assert.ok(p.includes("vercel.json"));
    assert.ok(p.includes("missing: CSP"));
  });
});
