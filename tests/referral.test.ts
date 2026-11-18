import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  REF_BONUS_DAYS,
  REF_TTL_S,
  parseRefParam,
  refCode,
  refInfoText,
  refLink,
  refRewardNotifyText,
  shouldReward,
} from "../src/lib/referral.ts";
import {
  botRedeemResultText,
  botStatusText,
  buildMyScansText,
  handleBotInput,
} from "../src/lib/telegram-bot.ts";

/* Pure layers only: refCode/parseRefParam/shouldReward are hash/string
 * functions, the /ref answer and the bot texts are builders fed with plain
 * data - no Redis, no network, no new Function. */

describe("refCode", () => {
  it("is stable: the same chat id always mints the same code", () => {
    assert.equal(refCode("123456789"), refCode("123456789"));
    assert.equal(refCode("-100200300"), refCode("-100200300"));
    assert.equal(refCode("  42  "), refCode("42")); // trim, not a new identity
  });

  it("meets the length contract (>= 6) and the unambiguous alphabet", () => {
    for (const id of ["1", "42", "123456789", "-100200300", "987654321098"]) {
      const code = refCode(id);
      assert.ok(code.length >= 6, `code for ${id} too short: ${code}`);
      assert.match(code, /^[a-z0-9]{6,32}$/);
      assert.doesNotMatch(code, /[01ilo]/, `ambiguous glyph in ${code}`);
    }
  });

  it("different chats get different codes", () => {
    const codes = new Set(Array.from({ length: 40 }, (_, i) => refCode(String(700000000 + i))));
    assert.equal(codes.size, 40);
    assert.notEqual(refCode("123"), refCode("124"));
  });
});

describe("parseRefParam", () => {
  it("extracts the code from ref_<code>, case-tolerant", () => {
    assert.equal(parseRefParam("ref_abc123"), "abc123");
    assert.equal(parseRefParam("REF_ABC123"), "abc123");
    assert.equal(parseRefParam("ref_ab12cd34"), "ab12cd34");
  });

  it("rejects other deep-link payloads and malformed codes", () => {
    assert.equal(parseRefParam("ru-lp"), null);
    assert.equal(parseRefParam("en-pro"), null);
    assert.equal(parseRefParam("ru-myapp_vercel_app"), null);
    assert.equal(parseRefParam(""), null);
    assert.equal(parseRefParam("ref_"), null);
    assert.equal(parseRefParam("ref_abc"), null); // shorter than the 6-char minimum
    assert.equal(parseRefParam("ref_ab-c123"), null); // dash is not a code glyph
    assert.equal(parseRefParam("ref_abc123 extra"), null);
    assert.equal(parseRefParam("myref_abc123"), null);
  });
});

describe("shouldReward - the reward-once gate", () => {
  it("pays only when the invited binding exists and done-marker does not", () => {
    assert.equal(shouldReward(true, false), true);
    assert.equal(shouldReward(true, true), false);
    assert.equal(shouldReward(false, false), false);
    assert.equal(shouldReward(false, true), false);
  });

  it("constants match the product rules", () => {
    assert.equal(REF_BONUS_DAYS, 7);
    assert.equal(REF_TTL_S, 90 * 24 * 3600);
  });
});

describe("referral wiring in the state machine", () => {
  it("/start ref_<code> returns a ref_join intent with the greeting intact", () => {
    const step = handleBotInput({ stage: "idle" }, "/start ref_abc123");
    assert.equal(step.intent.action, "ref_join");
    if (step.intent.action === "ref_join") assert.equal(step.intent.code, "abc123");
    assert.equal(step.state.stage, "idle");
    assert.match(step.reply, /AppSeal/);
    assert.match(step.reply, /buy_ru/);
  });

  it("uppercase deep-link codes normalize to lowercase", () => {
    const step = handleBotInput({ stage: "idle" }, "/start REF_ABC123");
    assert.equal(step.intent.action, "ref_join");
    if (step.intent.action === "ref_join") assert.equal(step.intent.code, "abc123");
  });

  it("other deep links are untouched by the ref parsing", () => {
    const lp = handleBotInput({ stage: "idle" }, "/start ru-lp");
    assert.equal(lp.intent.action, "reply");
    assert.equal(lp.state.plan, "launch");
    const bad = handleBotInput({ stage: "idle" }, "/start ref_abc"); // too short
    assert.equal(bad.intent.action, "reply");
    assert.equal(bad.state.stage, "idle");
  });

  it("/ref hands a ref intent and never resets an open dialog", () => {
    const step = handleBotInput({ stage: "await_email", provider: "yk", host: "myapp.com" }, "/ref");
    assert.equal(step.intent.action, "ref");
    assert.equal(step.state.stage, "await_email");
    assert.equal(step.reply, ""); // the route renders refCommandReply()
  });

  it("/help explains the referral in both languages", () => {
    assert.match(handleBotInput({ stage: "idle" }, "/help").reply, /\/ref/);
    assert.match(handleBotInput({ stage: "idle" }, "/help", "en").reply, /\/ref/);
  });
});

describe("referral text builders", () => {
  it("refInfoText shows the code, the share link and honest stats", () => {
    const ru = refInfoText("ru", { invited: 3, bankedDays: 7, earnedDays: 21 }, "abc123xy");
    assert.match(ru, /abc123xy/);
    assert.match(ru, /t\.me\/AppSeal_Monitor_Bot\?start=ref_abc123xy/);
    assert.match(ru, /Приглашено: 3/);
    assert.match(ru, /Заработано: 21/);
    assert.match(ru, /копилке: 7/);
    assert.match(ru, /\+7 дней/);
    assert.equal(refLink("abc123xy"), "https://t.me/AppSeal_Monitor_Bot?start=ref_abc123xy");
  });

  it("the banked line appears only when days are actually banked", () => {
    const en = refInfoText("en", { invited: 0, bankedDays: 0, earnedDays: 0 }, "abc123xy");
    assert.match(en, /Invited: 0/);
    assert.match(en, /Earned: 0 days/);
    assert.doesNotMatch(en, /Banked: \d+/); // no stats line while nothing is banked
    assert.match(refInfoText("en", { invited: 2, bankedDays: 14, earnedDays: 14 }, "abc123xy"), /Banked: 14/);
  });

  it("refRewardNotifyText names the detail honestly or sends nothing", () => {
    assert.match(refRewardNotifyText("ru", "pass", "myapp.com"), /Ваш друг купил пасс/);
    assert.match(refRewardNotifyText("ru", "pass", "myapp.com"), /myapp\.com/);
    assert.match(refRewardNotifyText("ru", "banked"), /копилке/);
    assert.match(refRewardNotifyText("en", "pass", "myapp.com"), /\+7 days for you/);
    assert.match(refRewardNotifyText("en", "banked"), /banked/);
    assert.equal(refRewardNotifyText("ru", "none"), "");
  });
});

/* Task 1: the joy-moment review CTA rides the pass-activation texts. */

describe("review CTA after pass activation", () => {
  const inTenDays = new Date(Date.now() + 10 * 86_400_000).toISOString();

  it("status-done carries the review CTA in both languages", () => {
    const ru = botStatusText("ru", "done", "myapp.com", inTenDays);
    assert.match(ru, /Оставьте отзыв о AppSeal: appseal\.online\/reviews/);
    assert.match(ru, /после короткой проверки/);
    const en = botStatusText("en", "done", "myapp.com", inTenDays);
    assert.match(en, /Leave a review: appseal\.online\/reviews/);
    assert.match(en, /quick check/);
  });

  it("the referral bonus line is opt-in and ordered before the CTA", () => {
    const plain = botStatusText("ru", "done", "myapp.com", inTenDays);
    assert.doesNotMatch(plain, /приглашению друга/);
    const bonus = botStatusText("ru", "done", "myapp.com", inTenDays, undefined, true);
    assert.match(bonus, /\+7 дней по приглашению друга уже в вашем пассе/);
    assert.match(bonus, /Оставьте отзыв/);
    assert.ok(bonus.indexOf("приглашению друга") < bonus.indexOf("Оставьте отзыв"));
    assert.match(botStatusText("en", "done", "myapp.com", inTenDays, undefined, true), /friend's invite/);
  });

  it("pending/fail statuses stay clean of the CTA", () => {
    assert.doesNotMatch(botStatusText("ru", "pending", undefined, undefined, "pending"), /Отзыв|отзыв/);
    assert.doesNotMatch(botStatusText("ru", "fail"), /Отзыв|отзыв/);
  });

  it("redeem-done carries the CTA; the exhausted-credits branch does not", () => {
    const done = botRedeemResultText("ru", "done", "myapp.com", "2026-11-26T00:00:00.000Z");
    assert.match(done, /Пропуск активирован/);
    assert.match(done, /appseal\.online\/reviews/);
    assert.match(botRedeemResultText("en", "done", "myapp.com", "2026-11-26T00:00:00.000Z"), /Leave a review/);
    assert.doesNotMatch(botRedeemResultText("ru", "empty"), /reviews/);
    assert.doesNotMatch(botRedeemResultText("en", "empty"), /review/i);
  });
});

/* Task 2: /myscans closes with the signed web-cabinet link when the route
 * could mint a token - and stays silent when it could not. */

describe("myscans web link", () => {
  const token = "1234567890.1732000000000.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

  it("appends the 24h web link when a token is present", () => {
    const ru = buildMyScansText([{ host: "myapp.com", grade: "A" }], "ru", token);
    assert.ok(ru.includes(`appseal.online/myscans?t=${token}`));
    assert.match(ru, /ссылка живёт 24 часа/);
    const en = buildMyScansText([], "en", token);
    assert.ok(en.includes(`appseal.online/myscans?t=${token}`));
    assert.match(en, /24 hours/);
  });

  it("no token - the line is silently absent (empty and non-empty lists)", () => {
    assert.doesNotMatch(buildMyScansText([{ host: "myapp.com", grade: "A" }], "ru"), /myscans\?t=/);
    assert.doesNotMatch(buildMyScansText([], "en"), /myscans\?t=/);
  });
});
