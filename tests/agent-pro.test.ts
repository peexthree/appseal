import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  activatePass,
  daysForKind,
  hasActivePass,
  PRO_PASS_DAYS,
  proHostFromLavaMarker,
} from "../src/lib/passes.ts";
import {
  buildMyScansText,
  botPlanBtn,
  botPlanPrompt,
  handleBotInput,
} from "../src/lib/telegram-bot.ts";
import type { MyScanEntry } from "../src/lib/telegram-bot.ts";

/**
 * Pro Pass (30 days, one-time) and /myscans: pass length parameterization in
 * the store, the pro variant carried through the payment payload (YooKassa
 * metadata kind "lpro" / Lava invoice "pro:<host>" marker) and the bot dialog,
 * plus the pure /myscans text builder. Redis-dependent tests intercept global
 * fetch with a tiny Upstash REST emulator (same shape as tests/agent-infra).
 */

/** Minimal Upstash REST emulator over a Map (SET/GET/EXPIRE/ZADD/SMEMBERS). */
function makeFakeUpstash() {
  const store = new Map<string, string>();
  const calls: string[][] = [];
  const fakeFetch = async (url: string | URL, init?: { body?: string }) => {
    const cmd = JSON.parse(init?.body ?? "[]") as string[];
    calls.push(cmd);
    const op = String(cmd[0]).toUpperCase();
    const key = String(cmd[1]);
    let result: unknown = null;
    if (op === "SET") {
      store.set(key, String(cmd[2]));
      result = "OK";
    } else if (op === "GET") {
      result = store.get(key) ?? null;
    } else if (op === "EXPIRE") {
      result = store.has(key) ? 1 : 0;
    } else if (op === "ZADD" || op === "DEL") {
      result = 1;
    } else if (op === "SMEMBERS") {
      const raw = store.get(key);
      result = raw ? JSON.parse(raw) : [];
    }
    return new Response(JSON.stringify({ result }), { status: 200 });
  };
  return { store, calls, fakeFetch };
}

function passHostKeyOf(host: string): string {
  const clean = host.replace(/^www\./i, "").toLowerCase();
  return `lpass:host:${createHash("sha256").update(clean).digest("hex")}`;
}

const DAY_MS = 24 * 3600 * 1000;

/* --------------------- activatePass: 7 vs 30 days --------------------- */

describe("activatePass pass length", () => {
  it("defaults to 7 days (Launch) and takes 30 for Pro, expiry differs by 23 days", async () => {
    const launch = await activatePass("pay-launch", "launch-site.ru");
    const pro = await activatePass("pay-pro", "pro-site.ru", PRO_PASS_DAYS);
    assert.equal(launch.days, 7);
    assert.equal(pro.days, 30);
    const diffDays = (Date.parse(pro.until) - Date.parse(launch.until)) / DAY_MS;
    assert.equal(Math.round(diffDays), 23);
    // both stay within their nominal window (1% slack for clock drift)
    assert.ok(Math.abs((Date.parse(launch.until) - Date.now()) / DAY_MS - 7) < 0.1);
    assert.ok(Math.abs((Date.parse(pro.until) - Date.now()) / DAY_MS - 30) < 0.1);
  });

  it("stores the days field and a pass+grace Redis TTL (mocked Upstash)", async () => {
    process.env.UPSTASH_REDIS_REST_URL = "https://test-db.upstash.io";
    process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";
    const { store, calls, fakeFetch } = makeFakeUpstash();
    const realFetch = globalThis.fetch;
    (globalThis as { fetch: unknown }).fetch = fakeFetch;
    try {
      await activatePass("pay-ttl-7", "ttl7.ru");
      await activatePass("pay-ttl-30", "ttl30.ru", 30);
      const rec7 = JSON.parse(store.get("lpass:pay:pay-ttl-7") ?? "{}") as { days?: number; until: string };
      const rec30 = JSON.parse(store.get("lpass:pay:pay-ttl-30") ?? "{}") as { days?: number; until: string };
      assert.equal(rec7.days, 7);
      assert.equal(rec30.days, 30);
      // the SET EX TTL: 7-day pass + 1 day of grace vs 30 + 1
      const ttlOf = (paymentId: string) => {
        const cmd = calls.find((c) => c[0] === "SET" && c[1] === `lpass:pay:${paymentId}`) ?? [];
        const exIdx = cmd.findIndex((f) => String(f).toUpperCase() === "EX");
        return Number(cmd[exIdx + 1]);
      };
      assert.equal(ttlOf("pay-ttl-7"), 8 * 24 * 3600);
      assert.equal(ttlOf("pay-ttl-30"), 31 * 24 * 3600);
      // host records exist under the same layout as before (checks keep working)
      assert.ok(store.get(passHostKeyOf("ttl7.ru")));
      assert.ok(store.get(passHostKeyOf("www.ttl30.ru")));
    } finally {
      (globalThis as { fetch: unknown }).fetch = realFetch;
      delete process.env.UPSTASH_REDIS_REST_URL;
      delete process.env.UPSTASH_REDIS_REST_TOKEN;
    }
  });
});

/* --------------------- pass check accepts a live Pro --------------------- */

describe("hasActivePass with a Pro record", () => {
  it("passes an active 30-day pass, including through www", async () => {
    process.env.UPSTASH_REDIS_REST_URL = "https://test-db.upstash.io";
    process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";
    const { store, fakeFetch } = makeFakeUpstash();
    const realFetch = globalThis.fetch;
    (globalThis as { fetch: unknown }).fetch = fakeFetch;
    try {
      await activatePass("pay-live-pro", "pro-live.ru", 30);
      assert.equal(await hasActivePass("pro-live.ru"), true);
      assert.equal(await hasActivePass("www.pro-live.ru"), true);
      // an expired Pro record (wrong clock / replayed fixture) fails the check
      store.set(
        passHostKeyOf("pro-expired.ru"),
        JSON.stringify({
          paymentId: "pay-old",
          host: "pro-expired.ru",
          until: new Date(Date.now() - DAY_MS).toISOString(),
          days: 30,
        }),
      );
      assert.equal(await hasActivePass("pro-expired.ru"), false);
      // unknown host - no pass at all
      assert.equal(await hasActivePass("never-bought.ru"), false);
    } finally {
      (globalThis as { fetch: unknown }).fetch = realFetch;
      delete process.env.UPSTASH_REDIS_REST_URL;
      delete process.env.UPSTASH_REDIS_REST_TOKEN;
    }
  });
});

/* ------------- pro variant parsed from the payment payload ------------- */

describe("pro variant in the purchase payload", () => {
  it("YooKassa metadata kind lpro -> 30 days, lpass/unknown -> 7", () => {
    assert.equal(daysForKind("lpro"), 30);
    assert.equal(daysForKind("lpass"), 7);
    assert.equal(daysForKind(undefined), 7);
    assert.equal(daysForKind("lpack"), 7);
  });

  it("Lava invoice->host marker pro:<host> resolves, pack/plain markers do not", () => {
    assert.equal(proHostFromLavaMarker("pro:myapp.com"), "myapp.com");
    assert.equal(proHostFromLavaMarker("pro:MyApp.vercel.app"), "myapp.vercel.app");
    assert.equal(proHostFromLavaMarker("pro:"), null);
    assert.equal(proHostFromLavaMarker("pro:not a host"), null);
    assert.equal(proHostFromLavaMarker("pack:123"), null);
    assert.equal(proHostFromLavaMarker("plain-host.ru"), null);
  });

  it("bot dialog carries plan pro from the tariff menu into the purchase intent", () => {
    const asked = handleBotInput({ stage: "idle" }, "/buy_ru");
    assert.equal(asked.state.stage, "await_host");
    const domain = handleBotInput(asked.state, "https://www.myapp.vercel.app/");
    // after the domain comes the tariff menu with both honest offers
    assert.equal(domain.state.stage, "await_plan");
    assert.match(domain.reply, /Launch Pass/);
    assert.match(domain.reply, /7 дней/);
    assert.match(domain.reply, /Pro Pass/);
    assert.match(domain.reply, /30 дней/);
    assert.match(domain.reply, /490 ₽/);
    assert.match(domain.reply, /1 490 ₽/);
    assert.match(domain.reply, /без автосписаний/);
    // pick Pro -> straight to the email step, intent says plan "pro"
    const chosen = handleBotInput(domain.state, "/plan_pro");
    assert.equal(chosen.state.stage, "await_email");
    assert.equal(chosen.state.plan, "pro");
    const email = handleBotInput(chosen.state, "buyer@example.io");
    assert.equal(email.intent.action, "create_purchase");
    if (email.intent.action === "create_purchase") {
      assert.equal(email.intent.plan, "pro");
      assert.equal(email.intent.provider, "yk");
      assert.equal(email.intent.host, "myapp.vercel.app");
    }
    // the chosen plan survives into the serialized state, the email does not
    assert.ok(JSON.stringify(email.state).includes('"plan":"pro"'));
    assert.ok(!JSON.stringify(email.state).includes("buyer@example.io"));
  });

  it("Launch keeps its flow and EN buyers see the USD prices", () => {
    const asked = handleBotInput({ stage: "idle" }, "/buy_en");
    const domain = handleBotInput(asked.state, "myapp.com");
    assert.equal(domain.state.stage, "await_plan");
    assert.match(domain.reply, /\$6/);
    assert.match(domain.reply, /\$19/);
    const chosen = handleBotInput(domain.state, "/plan_launch");
    assert.equal(chosen.state.stage, "await_email");
    assert.equal(chosen.state.plan, "launch");
    const email = handleBotInput(chosen.state, "buyer@example.io");
    if (email.intent.action === "create_purchase") {
      assert.equal(email.intent.plan, "launch");
      assert.equal(email.intent.provider, "lava");
    }
  });

  it("random text in the tariff menu re-shows it, plan command typed cold restarts", () => {
    const domain = handleBotInput({ stage: "await_host", provider: "yk", mode: "single" }, "myapp.com");
    assert.equal(domain.state.stage, "await_plan");
    const again = handleBotInput(domain.state, "что?");
    assert.equal(again.state.stage, "await_plan");
    assert.match(again.reply, /Pro Pass/);
    // /plan_pro with no live dialog starts a fresh pro-preset dialog
    const cold = handleBotInput({ stage: "idle" }, "/plan_pro");
    assert.equal(cold.state.stage, "await_host");
    assert.equal(cold.state.plan, "pro");
    assert.equal(cold.state.mode, "single");
    const domain2 = handleBotInput(cold.state, "myapp.com");
    // the plan is preset: no tariff menu, straight to the email step
    assert.equal(domain2.state.stage, "await_email");
    assert.equal(domain2.state.plan, "pro");
  });

  it("deep-link and pack dialogs keep the legacy direct flow (no tariff menu)", () => {
    // landing deep link: no mode -> straight to the email step (Launch default)
    const deep = handleBotInput({ stage: "idle" }, "/start ru-my_site_com");
    assert.equal(deep.state.stage, "await_email");
    const email = handleBotInput(deep.state, "buyer@example.io");
    if (email.intent.action === "create_purchase") {
      assert.equal(email.intent.plan, "launch");
    }
    // pack flow is untouched
    const pack = handleBotInput({ stage: "await_email", provider: "yk", mode: "pack" }, "buyer@example.io");
    assert.equal(pack.intent.action, "create_pack_purchase");
  });

  it("plan prompt text helper follows the provider currency, buttons follow it too", () => {
    assert.match(botPlanPrompt("ru", "myapp.com", "yk"), /1 490 ₽/);
    assert.match(botPlanPrompt("en", "myapp.com", "lava"), /\$19/);
    // a RU speaker buying via /buy_en gets RU phrasing with the USD invoice
    assert.match(botPlanPrompt("ru", "myapp.com", "lava"), /\$19/);
    assert.match(botPlanBtn("yk", "pro"), /1 490 ₽/);
    assert.match(botPlanBtn("lava", "launch"), /\$6/);
  });
});

/* ------------------------ /myscans text builder ------------------------ */

describe("buildMyScansText", () => {
  const NOV17 = Date.UTC(2025, 10, 17, 12, 0, 0);

  it("empty list points at /watch and the scanner", () => {
    const ru = buildMyScansText([], "ru");
    assert.match(ru, /нет доменов|Пока нет доменов/);
    assert.match(ru, /\/watch/);
    const en = buildMyScansText([], "en");
    assert.match(en, /No domains yet/);
    assert.match(en, /\/watch/);
  });

  it("compact lines: host - grade score (date), ru date first", () => {
    const entries: MyScanEntry[] = [{ host: "akulenok-tmz.ru", grade: "A", score: 91, ts: NOV17 }];
    const ru = buildMyScansText(entries, "ru");
    assert.match(ru, /Твои домены/);
    assert.match(ru, /akulenok-tmz\.ru<\/code> - 💚 A 91 \(17 нояб\.\)/);
    const en = buildMyScansText(entries, "en");
    assert.match(en, /Your domains/);
    assert.match(en, /akulenok-tmz\.ru<\/code> - 💚 A 91 \(Nov 17\)/);
  });

  it("several domains and a never-scanned one degrade gracefully", () => {
    const entries: MyScanEntry[] = [
      { host: "a.ru", grade: "B", score: 74, ts: NOV17 },
      { host: "b.ru" },
      { host: "c.ru", grade: "C" },
    ];
    const ru = buildMyScansText(entries, "ru");
    const lines = ru.split("\n");
    assert.equal(lines.length, 4);
    assert.match(lines[1], /a\.ru<\/code> - 💙 B 74/);
    assert.match(lines[2], /b\.ru<\/code> - нет данных/);
    assert.match(lines[3], /c\.ru<\/code> - 💛 C$/);
  });

  it("garbage timestamps are ignored without breaking the line", () => {
    const entries: MyScanEntry[] = [{ host: "weird.ru", grade: "D", score: 50, ts: Number.NaN }];
    assert.match(buildMyScansText(entries, "ru"), /weird\.ru<\/code> - 🧡 D 50/);
    assert.doesNotMatch(buildMyScansText(entries, "ru"), /NaN/);
  });
});
