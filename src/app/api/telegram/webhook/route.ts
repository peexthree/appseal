import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { redisCommand } from "@/lib/passes";
import { sendTelegramMessage } from "@/lib/telegram";
import { BotState, handleBotInput } from "@/lib/telegram-bot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Telegram bot webhook: Launch Pass purchases straight from the chat.
 * Telegram authenticates the call with the secret token configured in
 * setWebhook (X-Telegram-Bot-Api-Secret-Token header). Per-chat state lives
 * in Redis for 1 hour and never holds the buyer email.
 * The purchase itself is submitted over HTTPS to our own /api/purchase
 * (literal URL - the route exists only on appseal.online), reusing the same
 * provider branches and activation chain as the landing.
 */

const STATE_TTL_SECONDS = 3600;
const HOSTED_ORIGIN = "https://appseal.online";

interface TgChat {
  id?: number | string;
}
interface TgMessage {
  message?: { chat?: TgChat; text?: string };
  edited_message?: { chat?: TgChat; text?: string };
  callback_query?: { data?: string; message?: { chat?: TgChat } };
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

async function checkStatus(nonce: string): Promise<string> {
  const res = await fetch(`${HOSTED_ORIGIN}/api/purchase?nonce=${encodeURIComponent(nonce)}`, {
    cache: "no-store",
  });
  const data = (await res.json().catch(() => ({}))) as {
    status?: string;
    host?: string;
    until?: string;
    error?: string;
  };
  if (data.status === "succeeded") {
    return `Пропуск активен для ${data.host || "?"} до ${data.until ? data.until.slice(0, 10) : "?"}. Сканы без лимита: https://appseal.online`;
  }
  if (data.status) {
    return `Оплата ещё не прошла (статус: ${data.status}). После оплаты нажми /status ещё раз.`;
  }
  return "Не удалось проверить статус - попробуй позже.";
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
  const chatId = chat?.id !== undefined ? String(chat.id) : "";
  if (!chatId) {
    return NextResponse.json({ ok: true });
  }
  // callback_query data is re-interpreted as a command (/buy_ru, /buy_en)
  const raw = update.callback_query?.data
    ? `/${update.callback_query.data.replace(/^\//, "")}`
    : (update.message?.text ?? "");

  const state = await loadState(chatId);
  const step = handleBotInput(state, raw);

  try {
    if (step.intent.action === "create_purchase") {
      const nonce = `tg-${randomUUID()}`;
      const provider = step.intent.provider;
      try {
        const url = await createPurchase(provider, step.intent.host, step.intent.email, nonce);
        const paidState: BotState = { ...step.state, provider, host: step.intent.host, nonce };
        await saveState(chatId, paidState);
        const btn = provider === "lava" ? "Pay $6 with card" : "Оплатить 490 ₽ (ЮKassa)";
        const payText =
          `Пропуск для домена: ${step.intent.host}. После оплаты активируется автоматически (до пары минут) - проверяй /status.`;
        await sendTelegramMessage(chatId, payText, {
          inline_keyboard: [[{ text: btn, url }]],
        });
        return NextResponse.json({ ok: true });
      } catch (e) {
        await saveState(chatId, { stage: "idle" });
        await sendTelegramMessage(
          chatId,
          `Не удалось создать платёж: ${e instanceof Error ? e.message : String(e)}. Попробуй /${provider === "lava" ? "buy_en" : "buy_ru"} ещё раз.`,
        );
        return NextResponse.json({ ok: true });
      }
    }

    if (step.intent.action === "check_status") {
      const statusText = await checkStatus(state.nonce ?? "");
      await sendTelegramMessage(chatId, statusText, {
        inline_keyboard: [[{ text: "Открыть сканер AppSeal", url: "https://appseal.online" }]],
      });
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
