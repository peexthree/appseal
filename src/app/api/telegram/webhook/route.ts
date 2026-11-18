import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import {
  addChatRedeemedHost,
  bindPassChat,
  consumePackCredit,
  extendHostPass,
  getChatPack,
  getChatPassHosts,
  getChatRedeemedHosts,
  getPackCredits,
  getPassRecord,
  hasActivePass,
  redeemPackPass,
  redisCommand,
} from "@/lib/passes";
import { issueApiToken } from "@/lib/api-tokens";
import { deleteUserData, setReviewFeatured, updateReviewStatus } from "@/lib/db/index";
import { refCommandReply, recordRefJoin, rewardReferral, type ReferralReward } from "@/lib/referral";
import { signChatToken } from "@/lib/myscans-token";
import { getLatestHostEntry } from "@/lib/scanner/store";
import {
  FREE_PER_CHAT_MAX,
  FREE_WATCH_KEY_PREFIX,
  FREE_WATCH_MAX,
  FREE_WATCH_ZSET,
  parseWatchHosts,
} from "@/lib/watch";
import { answerCallbackQuery, sendChatAction, sendTelegramMessage } from "@/lib/telegram";
import { secretsMatch } from "@/lib/sec";
import {
  BotLang,
  BotPlan,
  BotState,
  botCancelKeyboard,
  botDeleteDone,
  botIdleKeyboard,
  botInvoiceKeyboard,
  botPackPayText,
  botPayFail,
  botPayText,
  botPlanKeyboard,
  botRenewalPrompt,
  botRedeemNoPack,
  botRedeemResultText,
  botScanText,
  botScannerKeyboard,
  botStatusText,
  botTokenFail,
  botTokenNoPro,
  botTokenText,
  botUnwatchPickText,
  botUnwatchPicked,
  botWatchChatFull,
  botWatchDone,
  botWatchLimit,
  botWatchNone,
  botWatchRemoved,
  buildMyScansText,
  handleBotInput,
  MyScanEntry,
  parseRenewCallback,
  renewCarryDays,
} from "@/lib/telegram-bot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Telegram bot webhook: Launch Pass purchases straight from the chat.
 * Telegram authenticates the call with the secret token configured in
 * setWebhook (X-Telegram-Bot-Api-Secret-Token header). Per-chat state lives
 * in Redis for 1 hour and never holds the buyer email.
 * Language comes from the sender's language_code (ru* -> RU, else EN); a
 * landing deep link carries an explicit prefix that overrides it.
 * The purchase itself is submitted over HTTPS to our own /api/purchase
 * (literal URL - the route exists only on appseal.online), reusing the same
 * provider branches and activation chain as the landing.
 *
 * Feel-alive layer: button presses are acknowledged with a toast, slow
 * operations (payment creation, status poll, registry lookups) flip the
 * "typing…" indicator, dialogs carry a ✖️ cancel button, the invoice message
 * carries a ✅ check-payment button, and every bot message is Telegram HTML.
 *
 * One-click renewal: the monitor-tick expiry reminder carries a renew:<host>
 * button. This route re-validates the host, parks the current pass's plan and
 * its unspent days (renewRemainDays) in the dialog state and asks only for
 * the email; the email step fires the usual one-time invoice, and the
 * check_status branch stacks the parked days onto the fresh pass with
 * extendHostPass (burnt from the state right after - never stacked twice).
 *
 * Review moderation: the site posts every queued review to the moderation
 * channel with rev:ok:<uuid> / rev:no:<uuid> / rev:feat:<uuid> buttons; this
 * route answers the verdict - only for callbacks arriving from
 * TELEGRAM_CHAT_ID itself.
 */

const STATE_TTL_SECONDS = 3600;
// literal on purpose: the purchase route exists only on our production
// origin, and a literal URL keeps the outbound fetch SSRF-scannable
const HOSTED_ORIGIN = "https://appseal.online";
// one /myscans grade lookup must not stall the whole reply on a dead store
const MYSCANS_LOOKUP_TIMEOUT_MS = 5000;
// free re-scan nudge record (the monitor tick nudges 48h later and flips
// nudged:true; 10 days covers the window with slack)
const LASTSCAN_KEY_PREFIX = "tg:lastscan:";
const LASTSCAN_TTL_SECONDS = 864000;

/** Resolve with null when the promise outlives the budget (unref'd timer - the
 *  timeout never keeps the process alive on its own). */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    p,
    new Promise<null>((resolve) => {
      const t = setTimeout(() => resolve(null), ms);
      if (typeof t === "object" && t !== null && "unref" in t) (t as { unref(): void }).unref();
    }),
  ]);
}

interface TgUser {
  language_code?: string;
}
interface TgChat {
  id?: number | string;
}
interface TgMessage {
  message?: { chat?: TgChat; from?: TgUser; text?: string };
  edited_message?: { chat?: TgChat; from?: TgUser; text?: string };
  callback_query?: { id?: string; data?: string; from?: TgUser; message?: { chat?: TgChat } };
}

function stateKey(chatId: string): string {
  return `tg:state:${chatId}`;
}

async function loadState(chatId: string): Promise<BotState> {
  const raw = await redisCommand<string>(["GET", stateKey(chatId)]);
  if (!raw) return { stage: "idle" };
  try {
    return JSON.parse(raw) as BotState;
  } catch {
    return { stage: "idle" };
  }
}

async function saveState(chatId: string, state: BotState): Promise<void> {
  await redisCommand(["SET", stateKey(chatId), JSON.stringify(state), "EX", String(STATE_TTL_SECONDS)]);
}

/** Short toast shown above the tapped button - the buyer knows the press
 *  registered and what is happening while the slow round-trips run. */
function toastFor(callbackData: string, lang: BotLang): string {
  const ru = lang === "ru";
  switch (callbackData) {
    case "buy_ru":
    case "buy_en":
    case "buy5":
      return ru ? "Открываю покупку…" : "Starting checkout…";
    case "plan_launch":
      return ru ? "Тариф: Launch Pass ✅" : "Plan: Launch Pass ✅";
    case "plan_pro":
      return ru ? "Тариф: Pro Pass ✅" : "Plan: Pro Pass ✅";
    case "status":
      return ru ? "Проверяю оплату…" : "Checking payment…";
    case "cancel":
      return ru ? "Диалог сброшен ✅" : "Dialog reset ✅";
    case "watch":
      return ru ? "Включаю наблюдение…" : "Enabling the watch…";
    case "myscans":
      return ru ? "Смотрю реестр…" : "Checking the registry…";
    default:
      return ru ? "Секунду…" : "One moment…";
  }
}

/** Best-effort typing indicator while a slow operation runs. */
function typing(chatId: string): void {
  void sendChatAction(chatId).catch(() => undefined);
}

async function createPurchase(
  provider: string,
  host: string,
  email: string,
  nonce: string,
  kind?: "lpack",
  chatId?: string,
  plan?: BotPlan,
): Promise<string> {
  const res = await fetch(`${HOSTED_ORIGIN}/api/purchase`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ host, email, nonce, provider, kind, chatId, plan }),
    cache: "no-store",
  });
  const data = (await res.json().catch(() => ({}))) as { confirmationUrl?: string; error?: string };
  if (!res.ok || !data.confirmationUrl) {
    throw new Error(data.error ?? `HTTP ${res.status}`);
  }
  return data.confirmationUrl;
}

async function checkStatus(nonce: string): Promise<{ status?: string; host?: string; until?: string }> {
  const res = await fetch(`${HOSTED_ORIGIN}/api/purchase?nonce=${encodeURIComponent(nonce)}`, {
    cache: "no-store",
  });
  return (await res.json().catch(() => ({}))) as {
    status?: string;
    host?: string;
    until?: string;
    error?: string;
  };
}

export async function POST(req: NextRequest) {
  const secret = (process.env.TELEGRAM_WEBHOOK_SECRET ?? "").trim();
  const got = (req.headers.get("x-telegram-bot-api-secret-token") ?? "").trim();
  if (!secretsMatch(got, secret)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  let update: TgMessage = {};
  try {
    update = (await req.json()) as TgMessage;
  } catch {
    return NextResponse.json({ ok: true });
  }

  const chat = update.message?.chat ?? update.edited_message?.chat ?? update.callback_query?.message?.chat;
  const from = update.message?.from ?? update.edited_message?.from ?? update.callback_query?.from;
  const chatId = chat?.id !== undefined ? String(chat.id) : "";
  if (!chatId) {
    return NextResponse.json({ ok: true });
  }
  // buyer language: Telegram language_code (ru* -> RU, everything else EN)
  const lang: BotLang = (from?.language_code ?? "").toLowerCase().startsWith("ru") ? "ru" : "en";
  // callback_query data is re-interpreted as a command (/buy_ru, /buy_en)
  const callbackData = update.callback_query?.data?.replace(/^\//, "") ?? "";
  const raw = callbackData ? `/${callbackData}` : (update.message?.text ?? "");

  // review moderation first: it must run before the generic toast below so
  // the verdict toast is the one the moderator sees (a callback query can be
  // answered once). Fully isolated - a broken DB never reaches other branches.
  const cbq = update.callback_query;
  const revVerdict = cbq?.data?.match(/^rev:(ok|no|feat):([0-9a-f-]{36})$/i);
  if (revVerdict && cbq?.id) {
    const cbId = cbq.id;
    try {
      // the buttons exist only in the moderation channel post - a forwarded
      // copy pressed from any other chat (or a non-moderator) is rejected
      if (chatId.trim() !== (process.env.TELEGRAM_CHAT_ID ?? "").trim()) {
        await answerCallbackQuery(cbId, "Недостаточно прав");
        return NextResponse.json({ ok: true });
      }
      const action = revVerdict[1].toLowerCase();
      if (action === "feat") {
        // the third "⭐ В витрину" button: pin the review to the top of the
        // showcase. setReviewFeatured re-validates the uuid shape, only fires
        // on approved reviews and is idempotent - re-pressing is a safe no-op
        const pinned = await setReviewFeatured(revVerdict[2], true);
        await answerCallbackQuery(cbId, pinned ? "⭐ Закреплено на витрине" : "Не найден или БД выключена");
      } else {
        const approved = action === "ok";
        // updateReviewStatus re-validates the uuid shape and no-ops (false)
        // without DATABASE_URL
        const done = await updateReviewStatus(revVerdict[2], approved ? "approved" : "rejected");
        await answerCallbackQuery(
          cbId,
          done ? (approved ? "✅ Опубликован" : "❌ Отклонён") : "Не найден или БД выключена",
        );
      }
    } catch (e) {
      console.warn("[appseal-bot] review moderation failed:", e instanceof Error ? e.message : String(e));
      await answerCallbackQuery(cbId, "Ошибка, попробуй ещё раз");
    }
    return NextResponse.json({ ok: true });
  }

  // one-click renewal: the "🔁 Продлить" button on the expiry reminder sent by
  // monitor-tick. Runs before the generic toast below so the press is
  // acknowledged with its own wording (a callback query can be answered
  // once). The host rides the callback and is re-validated; the plan follows
  // the CURRENT pass (Pro extends to Pro), the unspent remainder is parked in
  // the state as renewRemainDays and stacked onto the fresh pass in the
  // check_status branch after the payment - still a one-time invoice, never
  // an auto-renewal.
  if ((cbq?.data ?? "").toLowerCase().startsWith("renew:") && cbq?.id) {
    const cbId = cbq.id;
    try {
      const host = parseRenewCallback(cbq.data ?? "");
      if (!host) {
        // forged/garbled callback_data: an honest refusal, the dialog stays
        // untouched
        await answerCallbackQuery(cbId, lang === "ru" ? "Не похоже на домен" : "Not a domain");
        return NextResponse.json({ ok: true });
      }
      await answerCallbackQuery(cbId, lang === "ru" ? "Создаём продление…" : "Creating the renewal…");
      typing(chatId);
      const rec = await getPassRecord(host);
      const days = rec?.days === 30 ? 30 : 7;
      const carry = renewCarryDays(rec?.until);
      await saveState(chatId, {
        stage: "await_email",
        provider: lang === "en" ? "lava" : "yk",
        plan: days === 30 ? "pro" : "launch",
        mode: "single",
        host,
        renewRemainDays: carry,
      });
      // the domain is already fixed - no await_host step: the usual email
      // step below fires the one-time invoice through the same
      // create_purchase intent as a regular purchase
      await sendTelegramMessage(chatId, botRenewalPrompt(lang, host, days, carry), botCancelKeyboard(lang), "HTML");
    } catch (e) {
      // the toast is already answered - only the chat reply can fail here;
      // swallow so Telegram never retries into a broken dialog
      console.warn("[appseal-bot] renew callback failed:", e instanceof Error ? e.message : String(e));
    }
    return NextResponse.json({ ok: true });
  }

  // acknowledge the button press right away with a meaningful toast: Telegram
  // keeps the button in loading state until answerCallbackQuery arrives
  if (update.callback_query?.id) {
    try {
      await answerCallbackQuery(update.callback_query.id, toastFor(callbackData, lang));
    } catch (e) {
      console.warn("[appseal-bot] answerCallbackQuery failed:", e instanceof Error ? e.message : String(e));
    }
  }

  const state = await loadState(chatId);
  const step = handleBotInput(state, raw, lang);

  try {
    if (step.intent.action === "create_purchase") {
      typing(chatId);
      const nonce = `tg-${randomUUID()}`;
      const provider = step.intent.provider;
      const plan: BotPlan = step.intent.plan === "pro" ? "pro" : "launch";
      try {
        const url = await createPurchase(provider, step.intent.host, step.intent.email, nonce, undefined, undefined, plan);
        const paidState: BotState = { ...step.state, provider, host: step.intent.host, nonce };
        await saveState(chatId, paidState);
        await sendTelegramMessage(
          chatId,
          botPayText(step.lang, step.intent.host, plan === "pro" ? 30 : 7),
          botInvoiceKeyboard(step.lang, provider, url, plan),
          "HTML",
        );
        return NextResponse.json({ ok: true });
      } catch (e) {
        await saveState(chatId, { stage: "idle" });
        const retryCmd = provider === "lava" ? "buy_en" : "buy_ru";
        await sendTelegramMessage(
          chatId,
          botPayFail(step.lang, e instanceof Error ? e.message : String(e), retryCmd),
          undefined,
          "HTML",
        );
        return NextResponse.json({ ok: true });
      }
    }

    if (step.intent.action === "create_pack_purchase") {
      typing(chatId);
      const nonce = `tg-${randomUUID()}`;
      const provider = step.intent.provider;
      try {
        const url = await createPurchase(provider, "", step.intent.email, nonce, "lpack", chatId);
        const paidState: BotState = { ...step.state, provider, nonce };
        await saveState(chatId, paidState);
        await sendTelegramMessage(chatId, botPackPayText(step.lang), botInvoiceKeyboard(step.lang, provider, url, "pack"), "HTML");
        return NextResponse.json({ ok: true });
      } catch (e) {
        await saveState(chatId, { stage: "idle" });
        await sendTelegramMessage(
          chatId,
          botPayFail(step.lang, e instanceof Error ? e.message : String(e), "buy5"),
          undefined,
          "HTML",
        );
        return NextResponse.json({ ok: true });
      }
    }

    if (step.intent.action === "redeem") {
      typing(chatId);
      const host = step.intent.host;
      const packPaymentId = await getChatPack(chatId);
      if (!packPaymentId) {
        await sendTelegramMessage(chatId, botRedeemNoPack(step.lang), botScannerKeyboard(step.lang), "HTML");
        return NextResponse.json({ ok: true });
      }
      // pass check FIRST: a credit must never be spent on a host that is
      // already covered (consuming before this check would eat the credit
      // and there is no reliable refund path in the reply flow)
      if (await hasActivePass(host)) {
        await sendTelegramMessage(
          chatId,
          step.lang === "ru"
            ? `У домена <code>${host}</code> уже есть активный пропуск - кредит не списан. Пришли другой домен: /redeem site.ru`
            : `<code>${host}</code> already has an active pass - the credit was not spent. Send another domain: /redeem myapp.com`,
          botScannerKeyboard(step.lang),
          "HTML",
        );
        return NextResponse.json({ ok: true });
      }
      const credits = await getPackCredits(packPaymentId);
      if (credits <= 0 || !(await consumePackCredit(packPaymentId))) {
        await sendTelegramMessage(chatId, botRedeemResultText(step.lang, "empty"), botScannerKeyboard(step.lang), "HTML");
        return NextResponse.json({ ok: true });
      }
      const record = await redeemPackPass(packPaymentId, host);
      // remember the host for /myscans (single purchases have no chat binding,
      // but a pack redemption always happens inside this chat)
      await addChatRedeemedHost(chatId, record.host);
      // bind the chat for the pass too: personal alerts, the weekly digest
      // and the /token Pro lookup all key off this mapping
      await bindPassChat(record.host, chatId);
      await sendTelegramMessage(
        chatId,
        botRedeemResultText(step.lang, "done", record.host, record.until),
        botScannerKeyboard(step.lang),
        "HTML",
      );
      return NextResponse.json({ ok: true });
    }

    if (step.intent.action === "watch") {
      typing(chatId);
      const host = step.intent.host;
      // free watch capacity guards: up to FREE_PER_CHAT_MAX domains per chat
      // (tg:watch:{chatId} = JSON {"hosts":[...]}; a legacy bare string parses
      // as one host) plus the global cap on chats joining the shared rescan
      // rotation
      const current = parseWatchHosts(
        ((await redisCommand<string>(["GET", FREE_WATCH_KEY_PREFIX + chatId])) ?? "") as string,
      );
      if (current.includes(host)) {
        // re-watch of a listed host: keep the list, refresh the rescan clock
        // to "as soon as possible"
        await redisCommand(["ZADD", FREE_WATCH_ZSET, "0", chatId]);
        const entry = await getLatestHostEntry(host);
        await sendTelegramMessage(
          chatId,
          botWatchDone(step.lang, host, entry?.grade, `${current.length}/${FREE_PER_CHAT_MAX}`),
          botScannerKeyboard(step.lang),
          "HTML",
        );
        return NextResponse.json({ ok: true });
      }
      if (current.length >= FREE_PER_CHAT_MAX) {
        await sendTelegramMessage(
          chatId,
          botWatchChatFull(step.lang, FREE_PER_CHAT_MAX),
          botScannerKeyboard(step.lang),
          "HTML",
        );
        return NextResponse.json({ ok: true });
      }
      if (current.length === 0) {
        const count = await redisCommand<number>(["ZCARD", FREE_WATCH_ZSET]);
        if ((count ?? 0) >= FREE_WATCH_MAX) {
          await sendTelegramMessage(chatId, botWatchLimit(step.lang, FREE_WATCH_MAX), botScannerKeyboard(step.lang), "HTML");
          return NextResponse.json({ ok: true });
        }
      }
      // add without duplicates and write the JSON shape the tick reads
      const next = [...current, host];
      await redisCommand(["SET", FREE_WATCH_KEY_PREFIX + chatId, JSON.stringify({ hosts: next })]);
      await redisCommand(["ZADD", FREE_WATCH_ZSET, "0", chatId]);
      const entry = await getLatestHostEntry(host);
      await sendTelegramMessage(
        chatId,
        botWatchDone(step.lang, host, entry?.grade, `${next.length}/${FREE_PER_CHAT_MAX}`),
        botScannerKeyboard(step.lang),
        "HTML",
      );
      return NextResponse.json({ ok: true });
    }

    if (step.intent.action === "unwatch") {
      const hosts = parseWatchHosts(
        ((await redisCommand<string>(["GET", FREE_WATCH_KEY_PREFIX + chatId])) ?? "") as string,
      );
      if (hosts.length <= 1) {
        // zero or one host: the old one-step removal, no pick dialog needed
        const removed = await redisCommand<number>(["DEL", FREE_WATCH_KEY_PREFIX + chatId]);
        await redisCommand(["ZREM", FREE_WATCH_ZSET, chatId]);
        await sendTelegramMessage(
          chatId,
          removed ? botWatchRemoved(step.lang) : botWatchNone(step.lang),
          botScannerKeyboard(step.lang),
          "HTML",
        );
        return NextResponse.json({ ok: true });
      }
      // 2-3 hosts: a numbered pick dialog keeps the other watches alive
      await saveState(chatId, { stage: "await_unwatch_pick", hosts });
      await sendTelegramMessage(chatId, botUnwatchPickText(step.lang, hosts), botCancelKeyboard(step.lang), "HTML");
      return NextResponse.json({ ok: true });
    }

    if (step.intent.action === "unwatch_pick") {
      const host = step.intent.host;
      // the state snapshot may be stale (dialog TTL, a concurrent edit) - the
      // fresh Redis list is the source of truth
      const hosts = parseWatchHosts(
        ((await redisCommand<string>(["GET", FREE_WATCH_KEY_PREFIX + chatId])) ?? "") as string,
      );
      if (!hosts.includes(host)) {
        // the chosen host is already gone: re-show the live list, or honestly
        // report that nothing is followed anymore
        if (hosts.length >= 2) {
          await saveState(chatId, { stage: "await_unwatch_pick", hosts });
          await sendTelegramMessage(chatId, botUnwatchPickText(step.lang, hosts), botCancelKeyboard(step.lang), "HTML");
        } else {
          await sendTelegramMessage(chatId, botWatchNone(step.lang), botScannerKeyboard(step.lang), "HTML");
        }
        return NextResponse.json({ ok: true });
      }
      const next = hosts.filter((h) => h !== host);
      if (next.length === 0) {
        // the last host left the watchlist - the chat leaves the rotation too
        await redisCommand(["DEL", FREE_WATCH_KEY_PREFIX + chatId]);
        await redisCommand(["ZREM", FREE_WATCH_ZSET, chatId]);
      } else {
        await redisCommand(["SET", FREE_WATCH_KEY_PREFIX + chatId, JSON.stringify({ hosts: next })]);
      }
      await sendTelegramMessage(
        chatId,
        botUnwatchPicked(step.lang, host, next),
        botScannerKeyboard(step.lang),
        "HTML",
      );
      return NextResponse.json({ ok: true });
    }

    if (step.intent.action === "delete_data") {
      // the 152-FZ self-service deletion, confirmed by a second /delete in
      // the state machine. PG first (durable truth: users row, ledger chat
      // binding, tokens, passes), then every chat-keyed Redis record, then
      // the dialog state itself. The honest reply reports a failed DB pass.
      const dbOk = await deleteUserData(chatId);
      await redisCommand(["DEL", FREE_WATCH_KEY_PREFIX + chatId]);
      await redisCommand(["ZREM", FREE_WATCH_ZSET, chatId]);
      await redisCommand(["DEL", `tg:pack:${chatId}`]);
      await redisCommand(["DEL", `tg:redeem:${chatId}`]);
      await redisCommand(["DEL", LASTSCAN_KEY_PREFIX + chatId]);
      await redisCommand(["DEL", `tg:chatpass:${chatId}`]);
      await redisCommand(["DEL", stateKey(chatId)]);
      await sendTelegramMessage(chatId, botDeleteDone(step.lang, dbOk), botScannerKeyboard(step.lang), "HTML");
      return NextResponse.json({ ok: true });
    }

    if (step.intent.action === "check_status") {
      typing(chatId);
      const d = await checkStatus(state.nonce ?? "");
      // a confirmed payment binds the chat to the pass (the "✅ Проверить
      // оплату" button and the /status command share this branch): personal
      // alerts, the weekly digest and the /token Pro lookup all key off it
      let reward: ReferralReward | null = null;
      let renewCarry = 0;
      if (d.status === "succeeded" && d.host) {
        await bindPassChat(d.host, chatId);
        // referral payout: on an invited chat's FIRST purchase both sides get
        // +7 days - the newbie's fresh pass, the referrer's active pass (or
        // banked for later); no-op for everyone else
        reward = await rewardReferral(chatId, d.host);
        // one-click renewal: stack the previous pass's unspent remainder onto
        // the fresh one. extendHostPass needs an ACTIVE pass - the activation
        // above (and the referral extension) have just re-pinned it, so this
        // works. The carry is burnt right after a successful extension (the
        // undefined value drops from the JSON): a repeated /status press must
        // never stack the same days twice. A failed extension keeps the carry
        // in the state, so the next /status can retry within the dialog TTL.
        const carry = state.renewRemainDays ?? 0;
        if (carry > 0 && (await extendHostPass(d.host, carry))) {
          renewCarry = carry;
          await saveState(chatId, { ...state, renewRemainDays: undefined });
        }
      }
      const text =
        d.status === "succeeded"
          ? botStatusText(step.lang, "done", d.host, d.until, undefined, reward?.newbieDays === true, renewCarry)
          : d.status
            ? botStatusText(step.lang, "pending", undefined, undefined, d.status)
            : botStatusText(step.lang, "fail");
      await sendTelegramMessage(chatId, text, botScannerKeyboard(step.lang), "HTML");
      return NextResponse.json({ ok: true });
    }

    if (step.intent.action === "issue_token") {
      typing(chatId);
      // Pro entitlement: any bound host whose ACTIVE pass is the 30-day one
      // (legacy records without days never qualify); expired passes fail the
      // until check honestly
      const boundHosts = await getChatPassHosts(chatId);
      let pro = false;
      for (const h of boundHosts) {
        const rec = await getPassRecord(h);
        if (rec && rec.days === 30 && new Date(rec.until).getTime() > Date.now()) {
          pro = true;
          break;
        }
      }
      if (!pro) {
        await sendTelegramMessage(chatId, botTokenNoPro(step.lang), botScannerKeyboard(step.lang), "HTML");
        return NextResponse.json({ ok: true });
      }
      const tok = await issueApiToken(chatId);
      // null = both Redis and the durable mirror were down - no honest way to
      // hand over a token, so say so instead of pretending success
      await sendTelegramMessage(
        chatId,
        tok ? botTokenText(step.lang, tok.token, tok.expiresAt) : botTokenFail(step.lang),
        botScannerKeyboard(step.lang),
        "HTML",
      );
      return NextResponse.json({ ok: true });
    }

    if (step.intent.action === "my_scans") {
      typing(chatId);
      // domains the chat owns: every free-watched host (up to 3 per chat;
      // tg:watch:{chatId} = JSON {"hosts":[...]}, a legacy bare string parses
      // as one) plus every host a pack credit was redeemed onto here. Lookups
      // are best-effort - a slow or broken store lookup must not kill the
      // whole answer.
      const watchHosts = parseWatchHosts(
        ((await redisCommand<string>(["GET", FREE_WATCH_KEY_PREFIX + chatId])) ?? "") as string,
      );
      const redeemedHosts = await getChatRedeemedHosts(chatId);
      const hosts = [...new Set([...watchHosts, ...redeemedHosts])];
      const entries: MyScanEntry[] = [];
      for (const h of hosts) {
        try {
          const entry = await withTimeout(getLatestHostEntry(h), MYSCANS_LOOKUP_TIMEOUT_MS);
          entries.push({ host: h, grade: entry?.grade, score: entry?.score, ts: entry?.ts, id: entry?.id });
        } catch (e) {
          console.warn("[appseal-bot] myscans lookup failed:", e instanceof Error ? e.message : String(e));
          entries.push({ host: h });
        }
      }
      // web cabinet link: a signed 24h token opens /myscans?t=... in a
      // browser (no web accounts - the link IS the session); absent secret ->
      // the line is silently omitted
      await sendTelegramMessage(
        chatId,
        buildMyScansText(entries, step.lang, signChatToken(chatId) ?? undefined),
        botScannerKeyboard(step.lang),
        "HTML",
      );
      return NextResponse.json({ ok: true });
    }

    if (step.intent.action === "ref") {
      typing(chatId);
      // /ref: register this chat's invite code (so ref_<code> deep links
      // resolve) and render the honest stats + rules card
      const reply = await refCommandReply(chatId, step.lang);
      await sendTelegramMessage(chatId, reply, undefined, "HTML");
      return NextResponse.json({ ok: true });
    }

    if (step.intent.action === "ref_join") {
      // /start ref_<code>: bind ref:invited for the newcomer (a self-invite,
      // an unknown code or an already-invited chat is a no-op inside
      // recordRefJoin). No return: the regular greeting below still goes out.
      await recordRefJoin(chatId, step.intent.code).catch(() => null);
    }

    if (step.intent.action === "scan") {
      typing(chatId);
      let entry: Awaited<ReturnType<typeof getLatestHostEntry>> = null;
      try {
        entry = await withTimeout(getLatestHostEntry(step.intent.host), MYSCANS_LOOKUP_TIMEOUT_MS);
      } catch (e) {
        console.warn("[appseal-bot] scan lookup failed:", e instanceof Error ? e.message : String(e));
      }
      // a successful (graded) result arms the free re-scan nudge: the monitor
      // tick reads this record 48h+ later, sends one "did you fix it?" nudge
      // and flips nudged:true; 10-day TTL then expires the key
      if (entry?.grade) {
        await redisCommand([
          "SET",
          LASTSCAN_KEY_PREFIX + chatId,
          JSON.stringify({ host: step.intent.host, ts: Date.now(), nudged: false }),
          "EX",
          String(LASTSCAN_TTL_SECONDS),
        ]);
      }
      const text = botScanText(
        step.lang,
        entry
          ? { host: step.intent.host, grade: entry.grade, score: entry.score, ts: entry.ts, id: entry.id, desc: entry.desc }
          : { host: step.intent.host },
      );
      await sendTelegramMessage(chatId, text, botScannerKeyboard(step.lang), "HTML");
      return NextResponse.json({ ok: true });
    }

    await saveState(chatId, step.state);
    const keyboard =
      step.state.stage === "idle"
        ? botIdleKeyboard(step.lang)
        : step.state.stage === "await_plan"
          ? botPlanKeyboard(step.state.provider ?? "yk", step.lang)
            : ["await_host", "await_email", "await_redeem_host", "await_watch_host", "await_scan_host", "await_unwatch_pick", "await_delete_confirm"].includes(
                step.state.stage,
              )
            ? botCancelKeyboard(step.lang)
            : undefined;
    await sendTelegramMessage(chatId, step.reply, keyboard, "HTML");
    return NextResponse.json({ ok: true });
  } catch {
    // Telegram retries non-2xx; swallow errors after best-effort replies
    return NextResponse.json({ ok: true });
  }
}
