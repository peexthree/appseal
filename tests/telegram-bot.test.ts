import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  botCancelKeyboard,
  botDeleteDone,
  botGradeBadge,
  botIdleKeyboard,
  botInvoiceKeyboard,
  botPlanKeyboard,
  botScanText,
  botScannerKeyboard,
  botStatusText,
  BOT_SITE_URL,
  buildMyScansText,
  handleBotInput,
} from "../src/lib/telegram-bot.ts";
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

  it("deep link /start ru-lp opens the Launch Pass dialog with the plan preset", () => {
    const step = handleBotInput({ stage: "idle" }, "/start ru-lp");
    assert.equal(step.state.stage, "await_host");
    assert.equal(step.state.provider, "yk");
    assert.equal(step.state.mode, "single");
    assert.equal(step.state.plan, "launch");
    assert.match(step.reply, /Шаг 1\/2/);
    const en = handleBotInput({ stage: "idle" }, "/start en-lp");
    assert.equal(en.state.provider, "lava");
    assert.equal(en.state.plan, "launch");
    assert.equal(en.lang, "en");
  });

  it("bad deep-link param falls back to the greeting", () => {
    const bad = handleBotInput({ stage: "idle" }, "/start ru-not!a!domain");
    assert.equal(bad.state.stage, "idle");
    assert.equal(bad.reply, handleBotInput({ stage: "idle" }, "/start").reply);
  });

  it("language_code en produces EN greeting and prompts", () => {
    const step = handleBotInput({ stage: "idle" }, "/start", "en");
    assert.match(step.reply, /trust seal for AI-built apps/);
    assert.equal(step.lang, "en");
    const host = handleBotInput({ stage: "await_host", provider: "yk" }, "myapp.com", "en");
    assert.match(host.reply, /Send your email for the receipt/);
  });

  it("language_code ru produces RU prompts", () => {
    const step = handleBotInput({ stage: "idle" }, "/start", "ru");
    assert.match(step.reply, /печать доверия/);
  });

  it("explicit /buy_ru keeps RU texts even for an EN-speaker", () => {
    const step = handleBotInput({ stage: "idle" }, "/buy_ru", "en");
    assert.equal(step.state.provider, "yk");
    assert.match(step.reply, /Шаг 1\/2/);
    assert.equal(step.lang, "ru");
  });

  it("deep link en-<host> replies in EN regardless of detected language", () => {
    const step = handleBotInput({ stage: "idle" }, "/start en-my_site_com", "ru");
    assert.equal(step.state.provider, "lava");
    assert.match(step.reply, /my\.site\.com/);
    assert.match(step.reply, /Send your email for the receipt/);
    assert.equal(step.lang, "en");
  });
});

describe("bot live UX: /scan, /help, keyboards, badges", () => {
  it("/help returns the explainer and never resets an open dialog", () => {
    const s: BotState = { stage: "await_email", provider: "yk", host: "myapp.com" };
    const step = handleBotInput(s, "/help");
    assert.equal(step.intent.action, "reply");
    assert.equal(step.state.stage, "await_email");
    assert.match(step.reply, /AppSeal/);
    assert.match(step.reply, /проверяет/);
  });

  it("/scan <domain> answers with the scan intent and a normalized host", () => {
    const step = handleBotInput({ stage: "idle" }, "/scan https://www.MyApp.vercel.app/path");
    assert.equal(step.intent.action, "scan");
    if (step.intent.action === "scan") assert.equal(step.intent.host, "myapp.vercel.app");
  });

  it("/scan with garbage keeps the state and asks for a real domain", () => {
    const step = handleBotInput({ stage: "idle" }, "/scan not!a!domain");
    assert.equal(step.intent.action, "reply");
    assert.equal(step.state.stage, "idle");
    assert.match(step.reply, /домен/i);
  });

  it("/scan without an arg enters await_scan_host, then the domain completes it", () => {
    const prompt = handleBotInput({ stage: "idle" }, "/scan");
    assert.equal(prompt.state.stage, "await_scan_host");
    assert.equal(prompt.intent.action, "reply");
    const done = handleBotInput(prompt.state, "myapp.vercel.app");
    assert.equal(done.intent.action, "scan");
    if (done.intent.action === "scan") assert.equal(done.intent.host, "myapp.vercel.app");
    assert.equal(done.state.stage, "idle");
  });

  it("a bare domain pasted into idle chat runs a free scan", () => {
    const step = handleBotInput({ stage: "idle" }, "MyApp.vercel.app");
    assert.equal(step.intent.action, "scan");
    if (step.intent.action === "scan") assert.equal(step.intent.host, "myapp.vercel.app");
  });

  it("an email pasted into idle gets pointed to the purchase flow, not an error", () => {
    const step = handleBotInput({ stage: "idle" }, "buyer@example.com");
    assert.equal(step.intent.action, "reply");
    assert.match(step.reply, /email/i);
    assert.match(step.reply, /buy_ru/);
  });

  it("grade badges mirror the site palette", () => {
    assert.equal(botGradeBadge("A+"), "💜");
    assert.equal(botGradeBadge("A"), "💚");
    assert.equal(botGradeBadge("B"), "💙");
    assert.equal(botGradeBadge("C"), "💛");
    assert.equal(botGradeBadge("D"), "🧡");
    assert.equal(botGradeBadge("E"), "🔴");
    assert.equal(botGradeBadge(undefined), "⚪");
    assert.equal(botGradeBadge("X"), "⚪");
  });

  it("idle keyboard: honest labels, plan_launch/plan_pro/buy5 callbacks, scanner link", () => {
    const kb = botIdleKeyboard("ru") as { inline_keyboard: { text: string; callback_data?: string; url?: string }[][] };
    const flat = kb.inline_keyboard.flat();
    assert.ok(kb.inline_keyboard[0][0].url === BOT_SITE_URL);
    assert.ok(flat.some((b) => b.callback_data === "plan_launch"));
    assert.ok(flat.some((b) => b.callback_data === "plan_pro"));
    assert.ok(flat.some((b) => b.callback_data === "buy5"));
    assert.ok(flat.some((b) => b.callback_data === "watch"));
    assert.ok(flat.some((b) => b.callback_data === "myscans"));
    assert.match(flat.find((b) => b.callback_data === "plan_launch")!.text, /490/);
    const en = botIdleKeyboard("en") as { inline_keyboard: { text: string }[][] };
    assert.match(en.inline_keyboard[1][0].text, /\$6/);
  });

  it("plan keyboard carries a cancel row; dialog steps get a cancel button", () => {
    const plan = botPlanKeyboard("yk", "ru") as { inline_keyboard: { callback_data: string }[][] };
    assert.ok(plan.inline_keyboard.some((row) => row.some((b) => b.callback_data === "cancel")));
    const cancel = botCancelKeyboard("en") as { inline_keyboard: { callback_data: string; text: string }[][] };
    assert.equal(cancel.inline_keyboard[0][0].callback_data, "cancel");
    assert.match(cancel.inline_keyboard[0][0].text, /Cancel/);
  });

  it("invoice keyboard pairs the payment link with a check-payment callback", () => {
    const kb = botInvoiceKeyboard("ru", "yk", "https://pay.example/x", "pro") as {
      inline_keyboard: { text: string; url?: string; callback_data?: string }[][];
    };
    assert.equal(kb.inline_keyboard[0][0].url, "https://pay.example/x");
    assert.match(kb.inline_keyboard[0][0].text, /Оплатить 1 490/);
    assert.equal(kb.inline_keyboard[1][0].callback_data, "status");
    const pack = botInvoiceKeyboard("ru", "yk", "https://pay.example/y", "pack") as {
      inline_keyboard: { text: string }[][];
    };
    assert.match(pack.inline_keyboard[0][0].text, /пакет 1 490/);
  });

  it("myscans lines carry badges and report links when the entry id is known", () => {
    const text = buildMyScansText(
      [
        { host: "myapp.com", grade: "A+", score: 97, ts: Date.parse("2026-11-17T10:00:00Z"), id: "abc-123" },
        { host: "unscanned.io" },
      ],
      "ru",
    );
    assert.match(text, /💜/);
    assert.match(text, /A\+ 97/);
    assert.match(text, new RegExp(`<a href="${BOT_SITE_URL}/report/abc-123">myapp\\.com</a>`));
    assert.match(text, /17 нояб\./);
    assert.match(text, /unscanned\.io<\/code> - нет данных/);
  });

  it("scan answer: found grade links the report; missing grade points to a free scan", () => {
    const found = botScanText("ru", { host: "myapp.com", grade: "B", score: 81, ts: Date.parse("2026-11-17T10:00:00Z"), id: "rid" });
    assert.match(found, /💙 B 81/);
    assert.match(found, /\/report\/rid/);
    const none = botScanText("en", { host: "never-scanned.com" });
    assert.match(none, /No scans for/);
    assert.match(none, /never-scanned\.com/);
  });

  it("status text computes the days left from the until date", () => {
    const inTenDays = new Date(Date.now() + 10 * 86_400_000).toISOString();
    assert.match(botStatusText("ru", "done", "myapp.com", inTenDays), /осталось \d+ дн\./);
    assert.match(botStatusText("ru", "pending", undefined, undefined, "pending"), /статус/);
  });
});

describe("/delete self-service data removal (152-FZ)", () => {
  it("first /delete arms the confirmation, it never executes", () => {
    const step = handleBotInput({ stage: "idle" }, "/delete");
    assert.equal(step.state.stage, "await_delete_confirm");
    assert.equal(step.intent.action, "reply");
    assert.match(step.reply, /Удаление данных/);
    assert.match(step.reply, /\/delete ещё раз/);
  });

  it("second /delete in the armed state returns the destructive intent", () => {
    const step = handleBotInput({ stage: "await_delete_confirm" }, "/delete");
    assert.equal(step.intent.action, "delete_data");
    assert.equal(step.state.stage, "idle");
    // the reply is built after execution by botDeleteDone - the machine itself
    // carries no text for this step
    assert.equal(step.reply, "");
  });

  it("other text or /cancel in the armed state aborts back to idle", () => {
    const free = handleBotInput({ stage: "await_delete_confirm" }, "не хочу");
    assert.equal(free.state.stage, "idle");
    assert.equal(free.intent.action, "reply");
    assert.match(free.reply, /Удаление отменено/i);
    const cancelled = handleBotInput({ stage: "await_delete_confirm" }, "/cancel");
    assert.equal(cancelled.state.stage, "idle");
    assert.match(cancelled.reply, /сброшен/i);
  });

  it("the confirmation prompt warns about non-refundable pass/credit removal", () => {
    const ru = handleBotInput({ "stage": "idle" }, "/delete").reply;
    assert.match(ru, /Средства не возвращаются/);
    const en = handleBotInput({ stage: "idle" }, "/delete", "en").reply;
    assert.match(en, /No refunds/);
  });

  it("botDeleteDone reports a DB outage honestly instead of pretending", () => {
    assert.match(botDeleteDone("ru", false), /security@appseal\.online/);
    assert.match(botDeleteDone("ru", true), /Готово/);
    assert.doesNotMatch(botDeleteDone("ru", true), /security@appseal\.online/);
    assert.match(botDeleteDone("en", true), /Done:/);
  });
});
