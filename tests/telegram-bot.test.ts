import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { handleBotInput } from "../src/lib/telegram-bot.ts";
import type { BotState } from "../src/lib/telegram-bot.ts";

describe("telegram bot purchase flow", () => {
  it("greeting resets to idle and /start returns the menu", () => {
    const s: BotState = { stage: "paid_pending", nonce: "x" };
    const step = handleBotInput(s, "/start");
    assert.equal(step.state.stage, "idle");
    assert.match(step.reply, /buy_ru/);
    assert.equal(step.intent.action, "reply");
  });

  it("/buy_ru sets yk provider, /buy_en sets lava provider", () => {
    assert.equal(handleBotInput({ stage: "idle" }, "/buy_ru").state.provider, "yk");
    assert.equal(handleBotInput({ stage: "idle" }, "/buy_en").state.provider, "lava");
    assert.equal(handleBotInput({ stage: "idle" }, "/buy_ru").state.stage, "await_host");
  });

  it("callback query data re-interpreted as command", () => {
    const step = handleBotInput({ stage: "idle" }, "/buy_en");
    assert.equal(step.state.provider, "lava");
  });

  it("await_host accepts a domain and moves to email step", () => {
    const step = handleBotInput({ stage: "await_host", provider: "yk" }, "https://www.myapp.vercel.app/");
    assert.equal(step.state.stage, "await_email");
    assert.equal(step.state.host, "myapp.vercel.app");
    assert.equal(step.intent.action, "reply");
  });

  it("await_host rejects garbage without losing the stage", () => {
    const s: BotState = { stage: "await_host", provider: "yk" };
    const step = handleBotInput(s, "not a domain!!");
    assert.equal(step.state.stage, "await_host");
    assert.match(step.reply, /домен/i);
  });

  it("await_email returns a create_purchase intent and never persists the email", () => {
    const s: BotState = { stage: "await_email", provider: "lava", host: "myapp.com" };
    const step = handleBotInput(s, "buyer@example.io");
    assert.equal(step.intent.action, "create_purchase");
    if (step.intent.action === "create_purchase") {
      assert.equal(step.intent.provider, "lava");
      assert.equal(step.intent.host, "myapp.com");
      assert.equal(step.intent.email, "buyer@example.io");
    }
    // the state has no email field by type design - serialize to double-check
    assert.ok(!JSON.stringify(step.state).includes("buyer@example.io"));
    assert.equal(step.state.stage, "paid_pending");
  });

  it("await_email rejects a bad email and keeps the stage", () => {
    const s: BotState = { stage: "await_email", provider: "yk", host: "myapp.com" };
    const step = handleBotInput(s, "not-an-email");
    assert.equal(step.state.stage, "await_email");
    assert.match(step.reply, /email/i);
  });

  it("/status without a nonce asks to buy; with a nonce returns check_status intent", () => {
    const noNonce = handleBotInput({ stage: "idle" }, "/status");
    assert.equal(noNonce.intent.action, "reply");
    const withNonce = handleBotInput({ stage: "paid_pending", nonce: "tg-abc-123" }, "/status");
    assert.equal(withNonce.intent.action, "check_status");
  });

  it("/cancel resets the dialog", () => {
    const step = handleBotInput({ stage: "await_email", provider: "yk", host: "x.com" }, "/cancel");
    assert.equal(step.state.stage, "idle");
    assert.match(step.reply, /сброшен/i);
  });

  it("free text in idle falls back to the hint", () => {
    const step = handleBotInput({ stage: "idle" }, "привет");
    assert.equal(step.state.stage, "idle");
    assert.equal(step.reply, handleBotInput({ stage: "idle" }, "любой текст").reply);
  });

  it("deep link /start ru-<host> pre-fills host and provider, straight to email step", () => {
    const step = handleBotInput({ stage: "idle" }, "/start ru-myapp_vercel_app");
    assert.equal(step.state.stage, "await_email");
    assert.equal(step.state.provider, "yk");
    assert.equal(step.state.host, "myapp.vercel.app");
    assert.match(step.reply, /myapp\.vercel\.app/);
    assert.equal(step.intent.action, "reply");
  });

  it("deep link /start en-<host> presets the lava provider", () => {
    const step = handleBotInput({ stage: "idle" }, "/start en-my_site_com");
    assert.equal(step.state.provider, "lava");
    assert.equal(step.state.host, "my.site.com");
    assert.equal(step.state.stage, "await_email");
  });

  it("bad deep-link param falls back to the greeting", () => {
    const bad = handleBotInput({ stage: "idle" }, "/start ru-not!a!domain");
    assert.equal(bad.state.stage, "idle");
    assert.equal(bad.reply, handleBotInput({ stage: "idle" }, "/start").reply);
  });
});
