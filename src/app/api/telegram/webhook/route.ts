import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import {
  addChatRedeemedHost,
  consumePackCredit,
  getChatPack,
  getChatRedeemedHosts,
  getPackCredits,
  hasActivePass,
  redeemPackPass,
  redisCommand,
} from "@/lib/passes";
import { getLatestHostEntry } from "@/lib/scanner/store";
import { FREE_WATCH_KEY_PREFIX, FREE_WATCH_MAX, FREE_WATCH_ZSET } from "@/lib/watch";
import { answerCallbackQuery, sendChatAction, sendTelegramMessage } from "@/lib/telegram";
import { secretsMatch } from "@/lib/sec";
import {
  BotLang,
  BotPlan,
  BotState,
  botCancelKeyboard,
  botIdleKeyboard,
  botInvoiceKeyboard,
  botPackPayText,
  botPayFail,
  botPayText,
  botPlanKeyboard,
  botRedeemNoPack,
  botRedeemResultText,
  botScanText,
  botScannerKeyboard,
  botStatusText,
  botWatchDone,
  botWatchLimit,
  botWatchNone,
  botWatchRemoved,
  buildMyScansText,
  handleBotInput,
  MyScanEntry,
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
 */

const STATE_TTL_SECONDS = 3600;
// literal on purpose: the purchase route exists only on our production
// origin, and a literal URL keeps the outbound fetch SSRF-scannable
const HOSTED_ORIGIN = "https://appseal.online";
// one /myscans grade lookup must not stall the whole reply on a dead store
const MYSCANS_LOOKUP_TIMEOUT_MS = 5000;

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
      // free watch capacity guard: one domain per chat, bounded total slots
      const existing = await redisCommand<string>(["GET", FREE_WATCH_KEY_PREFIX + chatId]);
      const count = await redisCommand<number>(["ZCARD", FREE_WATCH_ZSET]);
      if (!existing && (count ?? 0) >= FREE_WATCH_MAX) {
        await sendTelegramMessage(chatId, botWatchLimit(step.lang, FREE_WATCH_MAX), botScannerKeyboard(step.lang), "HTML");
        return NextResponse.json({ ok: true });
      }
      await redisCommand([
        "SET",
        FREE_WATCH_KEY_PREFIX + chatId,
        host,
      ]);
      // re-watch or fresh watch both set the rescan clock to "as soon as possible"
      await redisCommand(["ZADD", FREE_WATCH_ZSET, "0", chatId]);
      const entry = await getLatestHostEntry(host);
      await sendTelegramMessage(
        chatId,
        botWatchDone(step.lang, host, entry?.grade),
        botScannerKeyboard(step.lang),
        "HTML",
      );
      return NextResponse.json({ ok: true });
    }

    if (step.intent.action === "unwatch") {
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

    if (step.intent.action === "check_status") {
      typing(chatId);
      const d = await checkStatus(state.nonce ?? "");
      const text =
        d.status === "succeeded"
          ? botStatusText(step.lang, "done", d.host, d.until)
          : d.status
            ? botStatusText(step.lang, "pending", undefined, undefined, d.status)
            : botStatusText(step.lang, "fail");
      await sendTelegramMessage(chatId, text, botScannerKeyboard(step.lang), "HTML");
      return NextResponse.json({ ok: true });
    }

    if (step.intent.action === "my_scans") {
      typing(chatId);
      // domains the chat owns: the free watch (one per chat) plus every host a
      // pack credit was redeemed onto here. Lookups are best-effort - a slow
      // or broken store lookup must not kill the whole answer.
      const watchHost = await redisCommand<string>(["GET", FREE_WATCH_KEY_PREFIX + chatId]);
      const redeemedHosts = await getChatRedeemedHosts(chatId);
      const hosts = [...new Set([watchHost ?? "", ...redeemedHosts].filter((h) => h.length > 0))];
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
      await sendTelegramMessage(chatId, buildMyScansText(entries, step.lang), botScannerKeyboard(step.lang), "HTML");
      return NextResponse.json({ ok: true });
    }

    if (step.intent.action === "scan") {
      typing(chatId);
      let entry: Awaited<ReturnType<typeof getLatestHostEntry>> = null;
      try {
        entry = await withTimeout(getLatestHostEntry(step.intent.host), MYSCANS_LOOKUP_TIMEOUT_MS);
      } catch (e) {
        console.warn("[appseal-bot] scan lookup failed:", e instanceof Error ? e.message : String(e));
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
          : ["await_host", "await_email", "await_redeem_host", "await_watch_host", "await_scan_host"].includes(
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
