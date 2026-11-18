import test from "node:test";
import assert from "node:assert/strict";
import { validateBrandParams } from "../src/lib/scanner/report-pdf.ts";

test("validateBrandParams accepts valid https logo and title", () => {
  const r = validateBrandParams("https://cdn.example.com/logo.png", "  Acme Studio  ");
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.logoUrl, "https://cdn.example.com/logo.png");
  assert.equal(r.title, "Acme Studio");
});

test("validateBrandParams accepts both params absent (no branding)", () => {
  const r = validateBrandParams(null, null);
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.logoUrl, "");
  assert.equal(r.title, "");
  const r2 = validateBrandParams(undefined, undefined);
  assert.equal(r2.ok, true);
});

test("validateBrandParams accepts title without logo and vice versa", () => {
  const onlyTitle = validateBrandParams(null, "Acme");
  assert.equal(onlyTitle.ok, true);
  if (onlyTitle.ok) {
    assert.equal(onlyTitle.logoUrl, "");
    assert.equal(onlyTitle.title, "Acme");
  }
  const onlyLogo = validateBrandParams("https://example.com/l.png", null);
  assert.equal(onlyLogo.ok, true);
  if (onlyLogo.ok) {
    assert.equal(onlyLogo.logoUrl, "https://example.com/l.png");
    assert.equal(onlyLogo.title, "");
  }
});

test("validateBrandParams rejects http (non-https) logo", () => {
  const r = validateBrandParams("http://example.com/logo.png", null);
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.match(r.reason, /https/);
});

test("validateBrandParams rejects non-https schemes (ftp, data, javascript)", () => {
  for (const url of ["ftp://example.com/logo.png", "data:image/png;base64,AAAA", "javascript:alert(1)", "//example.com/logo.png"]) {
    const r = validateBrandParams(url, null);
    assert.equal(r.ok, false, `expected rejection for ${url}`);
  }
});

test("validateBrandParams rejects garbage and unparseable urls", () => {
  for (const url of ["not a url", "https://", "https:// spaces.example.com/l.png"]) {
    const r = validateBrandParams(url, null);
    assert.equal(r.ok, false, `expected rejection for ${url}`);
  }
});

test("validateBrandParams rejects junk hostnames (userinfo, ipv6, single label)", () => {
  for (const url of [
    "https://user:pass@example.com/logo.png",
    "https://[::1]/logo.png",
    "https://localhost/logo.png",
    "https://intranet/logo.png",
  ]) {
    const r = validateBrandParams(url, null);
    assert.equal(r.ok, false, `expected rejection for ${url}`);
  }
});

test("validateBrandParams rejects non-string logo (typeof guard)", () => {
  const r = validateBrandParams(123 as unknown as string, null);
  assert.equal(r.ok, false);
});

test("validateBrandParams trims, strips control characters and caps title at 60", () => {
  const long = "x".repeat(80);
  const r = validateBrandParams(null, long);
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.title.length, 60);

  const ctrl = validateBrandParams(null, "\u0007\u001f Be\u000bell \u007fWorks\tInc");
  assert.equal(ctrl.ok, true);
  if (!ctrl.ok) return;
  assert.equal(ctrl.title, "Beell WorksInc");
});

test("validateBrandParams control characters are removed from title", () => {
  const r = validateBrandParams(null, "Be\u0007ll \u001bWorks\u007f");
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.title, "Bell Works");
});

test("validateBrandParams rejects whitespace-only title", () => {
  const r = validateBrandParams(null, "   ");
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.match(r.reason, /empty/);
});

test("validateBrandParams rejects non-string title (typeof guard)", () => {
  const r = validateBrandParams(null, 42 as unknown as string);
  assert.equal(r.ok, false);
});

test("validateBrandParams keeps a 60-char title intact", () => {
  const exactly = "a".repeat(60);
  const r = validateBrandParams(null, exactly);
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.title, exactly);
});
