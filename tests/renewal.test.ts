/**
 * One-click renewal (the "🔁 Продлить" button on the expiry reminder): pure
 * logic only - callback parsing, the carry-days math, the state-machine
 * transition that skips the domain step and the honest texts. No Redis, no
 * Telegram, no network: everything here is exported pure from
 * src/lib/telegram-bot.ts in the referral.ts style.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  botRenewalPrompt,
  botRenewKeyboard,
  botStatusText,
  handleBotInput,
  parseRenewCallback,
  renewCarryDays,
} from "../src/lib/telegram-bot.ts";
import type { BotState } from "../src/lib/telegram-bot.ts";

const DAY_MS = 86_400_000;

describe("renew callback parsing", () => {
  it("parses a valid renew:<host> callback", () => {
    assert.equal(parseRenewCallback("renew:myapp.com"), "myapp.com");
    assert.equal(parseRenewCallback("renew:my.app.vercel.app"), "my.app.vercel.app");
  });

  it("tolerates uppercase and normalizes to lowercase", () => {
    assert.equal(parseRenewCallback("RENEW:MyApp.COM"), "myapp.com");
    assert.equal(parseRenewCallback("Renew:MY.APP.VERCEL.APP"), "my.app.vercel.app");
  });

  it("rejects garbage, forged and malformed callback data", () => {
    assert.equal(parseRenewCallback(""), null);
    assert.equal(parseRenewCallback("renew:"), null);
    assert.equal(parseRenewCallback("renew:a..b"), null);
    assert.equal(parseRenewCallback("renew:-myapp.com"), null);
    assert.equal(parseRenewCallback("renew:myapp.com/path"), null);
    assert.equal(parseRenewCallback("renew:my app.com"), null);
    assert.equal(parseRenewCallback("renew:myapp.com extra"), null);
    assert.equal(parseRenewCallback("plan_launch"), null);
    assert.equal(parseRenewCallback("status"), null);
    assert.equal(parseRenewCallback("rev:ok:0f0e6d3e-1c1b-4a2d-9e8f-0a1b2c3d4e5f"), null);
  });
});

describe("renewCarryDays (the stacked remainder of the previous pass)", () => {
  const now = Date.now();

  it("ceil-rounds an active pass upward: 2.4 days left -> 3", () => {
    const until = new Date(now + 2.4 * DAY_MS).toISOString();
    assert.equal(renewCarryDays(until, now), 3);
  });

  it("keeps an exact day count honest: 2 days left -> 2", () => {
    const until = new Date(now + 2 * DAY_MS).toISOString();
    assert.equal(renewCarryDays(until, now), 2);
  });

  it("an expired pass carries nothing", () => {
    const until = new Date(now - 3 * DAY_MS).toISOString();
    assert.equal(renewCarryDays(until, now), 0);
    const second = new Date(now - 1).toISOString(); // just died
    assert.equal(renewCarryDays(second, now), 0);
  });

  it("a missing or unparseable record carries nothing", () => {
    assert.equal(renewCarryDays(undefined, now), 0);
    assert.equal(renewCarryDays("", now), 0);
    assert.equal(renewCarryDays("not-a-date", now), 0);
  });
});

describe("renew state-machine transition (email -> invoice, no domain step)", () => {
  const renewalState: BotState = {
    stage: "await_email",
    provider: "yk",
    plan: "launch",
    mode: "single",
    host: "myapp.com",
    renewRemainDays: 3,
  };

  it("goes straight to create_purchase with the SAME host - no await_host", () => {
    const step = handleBotInput(renewalState, "buyer@example.com");
    assert.equal(step.intent.action, "create_purchase");
    assert.equal(step.state.stage, "paid_pending");
    if (step.intent.action === "create_purchase") {
      assert.equal(step.intent.host, "myapp.com");
      assert.equal(step.intent.provider, "yk");
      assert.equal(step.intent.email, "buyer@example.com");
      assert.equal(step.intent.plan, "launch");
    }
  });

  it("keeps renewRemainDays in the paid_pending state and never the email", () => {
    const step = handleBotInput(renewalState, "buyer@example.com");
    assert.equal(step.state.renewRemainDays, 3);
    const serialized = JSON.stringify(step.state);
    assert.ok(!serialized.includes("buyer@example.com"));
    assert.ok(serialized.includes("renewRemainDays"));
  });

  it("a Pro renewal keeps the pro plan (kind lpro on the purchase call)", () => {
    const pro: BotState = { ...renewalState, plan: "pro" };
    const step = handleBotInput(pro, "buyer@example.com");
    if (step.intent.action === "create_purchase") {
      assert.equal(step.intent.plan, "pro");
    } else {
      assert.fail("expected a create_purchase intent");
    }
  });

  it("a bad email keeps the stage and the parked carry", () => {
    const step = handleBotInput(renewalState, "not-an-email");
    assert.equal(step.state.stage, "await_email");
    assert.equal(step.state.renewRemainDays, 3);
    assert.match(step.reply, /email/i);
  });

  it("/cancel resets the renewal dialog without touching other branches", () => {
    const step = handleBotInput(renewalState, "/cancel");
    assert.equal(step.state.stage, "idle");
    assert.match(step.reply, /сброшен/i);
  });
});

describe("renewal texts and keyboards", () => {
  it("the reminder button names the host, the days and rides renew:<host>", () => {
    const kb = botRenewKeyboard("myapp.com", 7) as {
      inline_keyboard: Array<Array<{ text: string; callback_data: string }>>;
    };
    assert.equal(kb.inline_keyboard[0][0].text, "🔁 Продлить myapp.com на 7 дн.");
    assert.equal(kb.inline_keyboard[0][0].callback_data, "renew:myapp.com");
    assert.equal(parseRenewCallback(kb.inline_keyboard[0][0].callback_data), "myapp.com");
    const pro = botRenewKeyboard("myapp.com", 30) as {
      inline_keyboard: Array<Array<{ text: string; callback_data: string }>>;
    };
    assert.match(pro.inline_keyboard[0][0].text, /на 30 дн\./);
  });

  it("the renewal prompt asks only for the email and names the carry", () => {
    const ru = botRenewalPrompt("ru", "myapp.com", 7, 3);
    assert.match(ru, /🔁 Продлеваем <code>myapp\.com<\/code> на 7 дн\./);
    assert.match(ru, /3 дн\. остатка сохранятся/);
    assert.match(ru, /Пришлите email для чека/);
    const ruNoCarry = botRenewalPrompt("ru", "myapp.com", 7, 0);
    assert.doesNotMatch(ruNoCarry, /сохранятся/);
    assert.match(ruNoCarry, /Пришлите email для чека/);
  });

  it("the renewal prompt has an EN mirror", () => {
    const en = botRenewalPrompt("en", "myapp.com", 30, 2);
    assert.match(en, /Renewing <code>myapp\.com<\/code> for 30 days/);
    assert.match(en, /2 days left from the current pass will be kept/);
    assert.match(en, /Send your email for the receipt/);
  });

  it("check_status done text carries the stacked-days line (ru + en)", () => {
    const until = new Date(Date.now() + 7 * DAY_MS).toISOString();
    const ru = botStatusText("ru", "done", "myapp.com", until, undefined, false, 5);
    assert.match(ru, /♻️ 5 дн\. с прошлого пасса сохранены/);
    const en = botStatusText("en", "done", "myapp.com", until, undefined, false, 2);
    assert.match(en, /♻️ 2 days from the previous pass are kept/);
  });

  it("done text without a carry shows no recycled-days line", () => {
    const until = new Date(Date.now() + 7 * DAY_MS).toISOString();
    const ru = botStatusText("ru", "done", "myapp.com", until);
    assert.doesNotMatch(ru, /♻️/);
    assert.match(ru, /Пропуск активен/);
  });
});
