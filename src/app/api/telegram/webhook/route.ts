import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { redisCommand } from "@/lib/passes";
import { sendTelegramMessage } from "@/lib/telegram";
import {
  botPayBtn,
  botPayFail,
  botPayText,
  botStatusText,
  BotLang,
  BotState,
  handleBotInput,
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
 */

const STATE_TTL_SECONDS = 3600;
const HOSTED_ORIGIN = "https://appseal.online";

interface TgUser {
  language_code?: string;
}
interface TgChat {
  id?: number | string;
}
interface TgMessage {
  message?: { chat?: TgChat; from?: TgUser; text?: string };
  edited_message?: { chat?: TgChat; from?: TgUser; text?: string };
  callback_query?: { data?: string; from?: TgUser; message?: { chat?: TgChat } };
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

function idleKeyboard(): object {
  return {
    inline_keyboard: [
      [{ text: "Открыть сканер AppSeal", url: "https://appseal.online" }],
      [
        { text: "Купить 490 ₽", callback_data: "buy_ru" },
        { text: "Pay $6", callback_data: "buy_en" },
      ],
    ],
  };
}

function scannerKeyboard(): object {
  return {
    inline_keyboard: [[{ text: "Открыть сканер AppSeal", url: "https://appseal.online" }]],
  };
}

async function createPurchase(
  provider: string,
  host: string,
  email: string,
  nonce: string,
): Promise<string> {
  const res = await fetch(`${HOSTED_ORIGIN}/api/purchase`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ host, email, nonce, provider }),
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
  if (!secret || got !== secret) {
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
  const raw = update.callback_query?.data
    ? `/${update.callback_query.data.replace(/^\//, "")}`
    : (update.message?.text ?? "");

  const state = await loadState(chatId);
  const step = handleBotInput(state, raw, lang);

  try {
    if (step.intent.action === "create_purchase") {
      const nonce = `tg-${randomUUID()}`;
      const provider = step.intent.provider;
      try {
        const url = await createPurchase(provider, step.intent.host, step.intent.email, nonce);
        const paidState: BotState = { ...step.state, provider, host: step.intent.host, nonce };
        await saveState(chatId, paidState);
        await sendTelegramMessage(chatId, botPayText(step.lang, step.intent.host), {
          inline_keyboard: [[{ text: botPayBtn(step.lang, provider), url }]],
        });
        return NextResponse.json({ ok: true });
      } catch (e) {
        await saveState(chatId, { stage: "idle" });
        const retryCmd = provider === "lava" ? "buy_en" : "buy_ru";
        await sendTelegramMessage(
          chatId,
          botPayFail(step.lang, e instanceof Error ? e.message : String(e), retryCmd),
        );
        return NextResponse.json({ ok: true });
      }
    }

    if (step.intent.action === "check_status") {
      const d = await checkStatus(state.nonce ?? "");
      const text =
        d.status === "succeeded"
          ? botStatusText(step.lang, "done", d.host, d.until)
          : d.status
            ? botStatusText(step.lang, "pending", undefined, undefined, d.status)
            : botStatusText(step.lang, "fail");
      await sendTelegramMessage(chatId, text, scannerKeyboard());
      return NextResponse.json({ ok: true });
    }

    await saveState(chatId, step.state);
    await sendTelegramMessage(chatId, step.reply, step.state.stage === "idle" ? idleKeyboard() : undefined);
    return NextResponse.json({ ok: true });
  } catch {
    // Telegram retries non-2xx; swallow errors after best-effort replies
    return NextResponse.json({ ok: true });
  }
}
