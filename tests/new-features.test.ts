import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { simulateFix } from "../src/lib/score-sim.ts";
import { buildLlmsTxt, buildSecurityTxt } from "../src/lib/generators.ts";
import { detectHosting, buildHostingPatch } from "../src/lib/config-patch.ts";
import { canonicalHost, dedupeRegistry, isReferenceSite, platformOf } from "../src/lib/registry.ts";
import { handleBotInput } from "../src/lib/telegram-bot.ts";
import type { CheckResult, ScanResult } from "../src/lib/scanner/types.ts";

function mkResult(over: Partial<CheckResult>): CheckResult {
  return {
    id: over.id ?? "test_check",
    category: over.category ?? "headers",
    title: over.title ?? { ru: "Проверка", en: "Check" },
    status: over.status ?? "pass",
    severity: over.severity ?? "low",
    penalty: over.penalty ?? 0,
    durationMs: 0,
    finding: over.finding,
  };
}

function mkScan(over: Partial<ScanResult>): ScanResult {
  return {
    id: "scanid1",
    inputUrl: "https://example.com",
    targetUrl: "https://example.com",
    host: "example.com",
    isDemo: false,
    lang: "ru",
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    status: "done",
    progress: 100,
    stage: { ru: "Готово", en: "Done" },
    score: 90,
    grade: "A",
    results: [],
    ...over,
  };
}

describe("score simulator", () => {
  it("potential equals the grader output with everything fixed", () => {
    const results = [
      mkResult({ id: "a", status: "fail", penalty: 8, severity: "medium" }),
      mkResult({ id: "b", status: "warn", penalty: 1, severity: "low" }),
    ];
    const sim = simulateFix(results);
    assert.equal(sim.items.length, 2);
    assert.equal(sim.potentialScore, 100);
    assert.equal(sim.potentialGrade, "A+");
  });

  it("critical caps recede when findings are fixed", () => {
    const results = [
      mkResult({ id: "crit", status: "fail", penalty: 20, severity: "critical" }),
    ];
    const sim = simulateFix(results);
    // with the finding left in place the grader caps to E (24); fixed - 100
    assert.equal(sim.potentialScore, 100);
    assert.equal(sim.potentialGrade, "A+");
    // one item is enough to leave the current (capped) grade
    assert.equal(sim.stepCount, 1);
  });

  it("clean report has no fixable items", () => {
    const sim = simulateFix([mkResult({ id: "ok", status: "pass" })]);
    assert.equal(sim.items.length, 0);
    assert.equal(sim.potentialScore, 100);
  });
});

describe("trust-file generators", () => {
  it("llms.txt names the host and flags the sitemap state", () => {
    const scan = mkScan({
      results: [mkResult({ id: "seo_sitemap", status: "pass", category: "trust" })],
    });
    const f = buildLlmsTxt(scan);
    assert.equal(f.path, "/llms.txt");
    assert.match(f.content, /# example\.com/);
    assert.match(f.content, /sitemap\.xml/);
    assert.ok(f.todo.length > 0);
  });

  it("security.txt is RFC 9116 shaped with TODO contact", () => {
    const f = buildSecurityTxt(mkScan({}));
    assert.equal(f.path, "/.well-known/security.txt");
    assert.match(f.content, /^Contact: mailto:\[TODO/m);
    assert.match(f.content, /Expires: \d{4}-\d{2}-\d{2}/);
    assert.match(f.content, /Canonical: https:\/\/example\.com\/\.well-known\/security\.txt/);
  });
});

describe("hosting config patch", () => {
  it("vercel detected from host suffix", () => {
    const scan = mkScan({ host: "myapp.vercel.app" });
    assert.equal(detectHosting(scan), "vercel");
    const patch = buildHostingPatch(scan);
    assert.equal(patch.file, "vercel.json");
    assert.match(patch.code, /"headers"/);
    assert.match(patch.code, /Strict-Transport-Security/);
  });

  it("cloudflare detected from the passport, netlify from host", () => {
    assert.equal(
      detectHosting(mkScan({ host: "x.pages.dev" })),
      "cloudflare",
    );
    assert.equal(
      detectHosting(mkScan({ host: "site.netlify.app" })),
      "netlify",
    );
  });

  it("unknown platform falls back to the generic nginx-style block", () => {
    const patch = buildHostingPatch(mkScan({ host: "example.com" }));
    assert.equal(patch.id, "generic");
    assert.match(patch.code, /add_header/);
  });
});

describe("registry helpers", () => {
  it("www. folds into the bare domain on dedupe", () => {
    const entries = [
      { host: "www.akulenok-tmz.ru", grade: "A", score: 89, ts: 100, id: "id-old" },
      { host: "akulenok-tmz.ru", grade: "A", score: 91, ts: 200, id: "id-new" },
    ];
    const deduped = dedupeRegistry(entries);
    assert.equal(deduped.length, 1);
    assert.equal(deduped[0].host, "akulenok-tmz.ru");
    assert.equal(deduped[0].score, 91);
  });

  it("reference giants are flagged", () => {
    assert.equal(isReferenceSite("youtube.com"), true);
    assert.equal(isReferenceSite("www.upstash.com"), true);
    assert.equal(isReferenceSite("myapp.lovable.app"), false);
  });

  it("platform buckets", () => {
    assert.equal(platformOf("site.lovable.app"), "lovable");
    assert.equal(platformOf("site.vercel.app"), "vercel");
    assert.equal(platformOf("site.github.io"), "github");
    assert.equal(platformOf("x.bolt.host"), "other");
    assert.equal(platformOf("akulenok-tmz.ru"), "custom");
    assert.equal(canonicalHost("WWW.Example.COM"), "example.com");
  });
});

describe("telegram bot pack flow", () => {
  it("/buy5 goes straight to the email step with pack mode", () => {
    const step = handleBotInput({ stage: "idle" }, "/buy5");
    assert.equal(step.state.stage, "await_email");
    assert.equal(step.state.mode, "pack");
    assert.match(step.reply, /Agency Pack|5 пропусков/);
  });

  it("email in pack mode creates a pack purchase intent", () => {
    const step = handleBotInput({ stage: "await_email", provider: "yk", mode: "pack" }, "a@b.co");
    assert.equal(step.intent.action, "create_pack_purchase");
    assert.deepEqual(step.state.stage, "paid_pending");
    assert.equal("email" in step.intent && step.intent.email, "a@b.co");
  });

  it("deep link ru-pack5 starts the pack dialog", () => {
    const step = handleBotInput({ stage: "idle" }, "/start ru-pack5");
    assert.equal(step.state.mode, "pack");
    assert.equal(step.state.stage, "await_email");
    assert.equal(step.lang, "ru");
  });

  it("/redeem with a domain emits a redeem intent", () => {
    const step = handleBotInput({ stage: "idle" }, "/redeem myapp.vercel.app");
    assert.equal(step.intent.action, "redeem");
    assert.deepEqual(step.state.stage, "idle");
  });

  it("/redeem without a domain asks for one, then the host completes the intent", () => {
    const asked = handleBotInput({ stage: "idle" }, "/redeem");
    assert.equal(asked.state.stage, "await_redeem_host");
    const done = handleBotInput(asked.state, "https://www.myapp.com/");
    assert.equal(done.intent.action, "redeem");
    assert.equal("host" in done.intent && done.intent.host, "myapp.com");
  });
});
