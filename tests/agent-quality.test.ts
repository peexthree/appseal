import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { checkRateLimitProtection } from "../src/lib/scanner/checks/admin.ts";
import { checkBrokenLinks } from "../src/lib/scanner/checks/liveness.ts";
import {
  checkClientEnvLeak,
  checkSecretsInSource,
  SIG_GROUPS,
} from "../src/lib/scanner/checks/secrets.ts";

type AdminCtx = Parameters<typeof checkRateLimitProtection>[0];
type LivenessCtx = Parameters<typeof checkBrokenLinks>[0];
type SecretsCtx = Parameters<typeof checkSecretsInSource>[0];

/**
 * Agent-quality fixes regression suite:
 * - auth_rate_limit is honest (skip instead of a fake pass, real header evidence)
 * - OpenAI/Anthropic key signatures do not swallow each other's keys
 * - broken_links never counts a timeout as a dead link
 * - client_env_leak requires an assignment position, not a bare mention
 *
 * Everything here is offline: the checks under test either read ctx data only,
 * or their network probes are stopped by the SSRF guard (127.0.0.1) before any
 * socket opens.
 */

/** Minimal scan context for the check functions, cast to the ctx type the
 *  check expects (the Ctx interfaces are module-private, so a generic keeps
 *  the call sites honest without exporting anything new). */
function mkCtx<T extends object = Record<string, unknown>>(over: Record<string, unknown> = {}): T {
  return {
    origin: "https://example.com",
    host: "example.com",
    homeBody: "",
    homeHeaders: {},
    isHttp: false,
    ...over,
  } as unknown as T;
}

function sigByName(name: string) {
  for (const g of SIG_GROUPS) {
    const s = g.sigs.find((x) => x.name === name);
    if (s) return s;
  }
  throw new Error(`signature not found: ${name}`);
}

/** fresh RegExp per assertion: the signatures carry the /g flag, lastIndex sticks */
const fresh = (sig: { re: RegExp }): RegExp => new RegExp(sig.re.source, sig.re.flags);

/* ------------------------------------------------------------------ */
/* auth_rate_limit: honest passive behavior                            */
/* ------------------------------------------------------------------ */

describe("auth_rate_limit (honest passive rate-limit check)", () => {
  it("passes when rate-limit headers ride on the homepage response", async () => {
    const res = await checkRateLimitProtection(
      mkCtx<AdminCtx>({ homeHeaders: { "x-ratelimit-limit": "100" } }),
    );
    assert.equal(res.length, 1);
    assert.equal(res[0].id, "auth_rate_limit");
    assert.equal(res[0].status, "pass");
    assert.equal(res[0].penalty, 0);
    assert.ok(res[0].finding?.evidence.includes("заголовки rate-limit присутствуют"));
  });

  it("passes on Retry-After evidence", async () => {
    const res = await checkRateLimitProtection(
      mkCtx<AdminCtx>({ homeHeaders: { "retry-after": "30" } }),
    );
    assert.equal(res[0].status, "pass");
    assert.ok((res[0].finding?.evidence ?? []).some((e) => e.startsWith("retry-after:")));
  });

  it("passes with headers accumulated by admin probes (stash pathway)", async () => {
    const ctx = mkCtx<AdminCtx>({});
    ctx.rateLimitEvidence = ["x-ratelimit-remaining: 97"];
    const res = await checkRateLimitProtection(ctx);
    assert.equal(res[0].status, "pass");
    assert.ok((res[0].finding?.evidence ?? []).join(" ").includes("x-ratelimit-remaining"));
  });

  it("skips neutrally when nothing was observed (no fake pass)", async () => {
    const res = await checkRateLimitProtection(mkCtx<AdminCtx>());
    assert.equal(res.length, 1);
    assert.equal(res[0].status, "skip");
    assert.equal(res[0].penalty, 0);
    assert.equal(res[0].finding, undefined);
    assert.equal(res[0].title.ru, "Rate limit не проверяется в пассивном режиме");
    assert.equal(res[0].title.en, "Rate limiting is not verified in passive mode");
  });
});

/* ------------------------------------------------------------------ */
/* OpenAI vs Anthropic key signatures                                  */
/* ------------------------------------------------------------------ */

describe("AI key signature boundaries (OpenAI vs Anthropic)", () => {
  // filler strings avoid doc-example markers (abcd/123456/test/demo/...) that
  // the scanner filters out before classifying
  const ant = "sk-ant-api03-8Qm3xV7bN2kL9pR4tW6yZ5uVbWcXdEf9gH2jK4mN";
  const openaiProj = "sk-proj-8Qm3xV7bN2kL9pR4tW6yZ5uVbWcXdEf9gH2jK4mNqRsT";

  it("the OpenAI signature no longer swallows Anthropic keys", () => {
    const openai = sigByName("OpenAI API key");
    const anthropic = sigByName("Anthropic API key");
    assert.equal(fresh(openai).test(ant), false);
    assert.equal(fresh(anthropic).test(ant), true);
  });

  it("the OpenAI signature still matches legacy and proj key shapes", () => {
    const openai = sigByName("OpenAI API key");
    assert.equal(fresh(openai).test(openaiProj), true);
    assert.equal(fresh(openai).test("sk-8Qm3xV7bN2kL9pR4tW6yZaBc"), true);
  });

  it("end-to-end: an sk-ant- key in client code reports as Anthropic", async () => {
    const ctx = mkCtx<SecretsCtx>({
      homeBody: `<html><body><script>var cfg="${ant}"</script></body></html>`,
    });
    const res = await checkSecretsInSource(ctx);
    const ai = res.find((r) => r.id === "sig_ai_keys");
    assert.ok(ai, "sig_ai_keys result missing");
    assert.equal(ai.status, "fail");
    const evidence = (ai.finding?.evidence ?? []).join(" | ");
    assert.ok(evidence.includes("Anthropic API key"), evidence);
    assert.ok(!evidence.includes("OpenAI API key"), evidence);
  });

  it("end-to-end: an sk-proj- key still reports as OpenAI", async () => {
    const ctx = mkCtx<SecretsCtx>({
      homeBody: `<html><body><script>var cfg="${openaiProj}"</script></body></html>`,
    });
    const res = await checkSecretsInSource(ctx);
    const ai = res.find((r) => r.id === "sig_ai_keys");
    assert.ok(ai, "sig_ai_keys result missing");
    assert.equal(ai.status, "fail");
    const evidence = (ai.finding?.evidence ?? []).join(" | ");
    assert.ok(evidence.includes("OpenAI API key"), evidence);
    assert.ok(!evidence.includes("Anthropic API key"), evidence);
  });
});

/* ------------------------------------------------------------------ */
/* broken_links: timeouts are not dead links                           */
/* ------------------------------------------------------------------ */

describe("broken_links: timeouts are counted separately", () => {
  const LINKS_HTML = `<html><body>
    <a href="/about">About</a>
    <a href="/pricing">Pricing</a>
    <a href="/contact">Contact</a>
    <a href="/blog">Blog</a>
  </body></html>`;

  it("all-slow links warn honestly instead of failing", async () => {
    // 127.0.0.1 is refused by the SSRF guard -> every probe yields status 0
    const ctx = mkCtx<LivenessCtx>({ origin: "https://127.0.0.1", homeBody: LINKS_HTML });
    const res = await checkBrokenLinks(ctx);
    assert.equal(res.length, 1);
    assert.equal(res[0].id, "broken_links");
    assert.equal(res[0].status, "warn", "timeouts must not fail the check");
    assert.equal(res[0].penalty, 0);
    assert.equal(res[0].finding?.code, "LINK_TIMEOUTS");
    assert.equal(res[0].title.ru, "Не удалось дождаться ответов от внутренних ссылок");
    assert.equal(res[0].title.en, "Internal links did not answer in time");
    const evidence = res[0].finding?.evidence ?? [];
    assert.equal(evidence.length, 4);
    assert.ok(evidence.every((e) => e.includes("таймаут")));
  });

  it("a page without internal links stays informational", async () => {
    const ctx = mkCtx<LivenessCtx>({ origin: "https://127.0.0.1", homeBody: "<html><body>no links</body></html>" });
    const res = await checkBrokenLinks(ctx);
    assert.equal(res[0].status, "info");
  });
});

/* ------------------------------------------------------------------ */
/* client_env_leak: assignment positions only                          */
/* ------------------------------------------------------------------ */

describe("client_env_leak: requires an assignment position", () => {
  it("a bare mention of a private env name is not a leak", async () => {
    const ctx = mkCtx<SecretsCtx>({
      homeBody:
        "<html><body><p>Configure NEXT_PUBLIC_SECRET in your hosting dashboard settings.</p></body></html>",
    });
    const res = await checkClientEnvLeak(ctx);
    assert.equal(res[0].id, "client_env_leak");
    assert.equal(res[0].status, "pass");
    assert.equal(res[0].penalty, 0);
  });

  it("object-literal assignment with a string value is a leak", async () => {
    const ctx = mkCtx<SecretsCtx>({
      homeBody:
        `<html><body><script>window.cfg={NEXT_PUBLIC_SECRET:"8Qm3xV7bN2kL9pR4tW"}</script></body></html>`,
    });
    const res = await checkClientEnvLeak(ctx);
    assert.equal(res[0].status, "fail");
    assert.equal(res[0].penalty, 15);
    assert.ok((res[0].finding?.evidence ?? []).some((e) => e.includes("NEXT_PUBLIC_SECRET=********")));
  });

  it("a JSON key form \"NAME\":\"value\" is a leak", async () => {
    const ctx = mkCtx<SecretsCtx>({
      homeBody:
        `<html><body><script>var env={"NEXT_PUBLIC_AUTH_SECRET":"8Qm3xV7bN2kL9pR4tW"}</script></body></html>`,
    });
    const res = await checkClientEnvLeak(ctx);
    assert.equal(res[0].status, "fail");
    assert.ok((res[0].finding?.evidence ?? []).some((e) => e.includes("NEXT_PUBLIC_AUTH_SECRET=********")));
  });

  it("escaped JSON inside an inline RSC payload is still detected", async () => {
    const ctx = mkCtx<SecretsCtx>({
      homeBody:
        `<html><body><script>self.__next_f.push([1,"{\\"NEXT_PUBLIC_TOKEN\\":\\"tok_live_8Qm3xV7b\\"}"])</script></body></html>`,
    });
    const res = await checkClientEnvLeak(ctx);
    assert.equal(res[0].status, "fail");
    assert.ok((res[0].finding?.evidence ?? []).some((e) => e.includes("NEXT_PUBLIC_TOKEN=********")));
  });
});
