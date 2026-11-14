/**
 * Telegram bot purchase flow for Launch Pass - a pure state machine, so the
 * transitions are unit-testable without Telegram or Redis. The webhook route
 * feeds each update through handleBotInput and executes the returned intent.
 *
 * 152-FZ note: the per-chat state stored in Redis holds stage/provider/host/
 * nonce only - the buyer email never lands there, it transits to the payment
 * provider inside the invoice call and is forgotten.
 */

const HOST_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export type BotProvider = "yk" | "lava";

export interface BotState {
  stage: "idle" | "await_host" | "await_email" | "paid_pending";
  provider?: BotProvider;
  host?: string;
  nonce?: string;
}

export type BotIntent =
  | { action: "reply" }
  | { action: "create_purchase"; provider: BotProvider; host: string; email: string }
  | { action: "check_status" };

export interface BotStep {
  state: BotState;
  intent: BotIntent;
  reply: string;
}

export const BOT_GREETING =
  "AppSeal - печать доверия для ИИ-приложений (appseal.online).\n\n" +
  "/buy_ru - Launch Pass за 490 ₽ (ЮKassa, РФ)\n" +
  "/buy_en - Launch Pass за $6 (любая зарубежная карта)\n" +
  "/status - статус последней покупки\n" +
  "/cancel - сброс диалога";

export const BOT_UNKNOWN =
  "Не понял сообщение. Команды: /start - меню, /buy_ru или /buy_en - купить Launch Pass.";

const RU_STEP1 =
  "Шаг 1/2. Пришли домен, для которого нужен пропуск (например myapp.vercel.app).";
const RU_STEP2 =
  "Шаг 2/2. Пришли email для чека - он уходит напрямую в ЮKassa и у нас не хранится.";
const EN_STEP1 =
  "Step 1/2. Send the domain for the pass (e.g. myapp.vercel.app).";
const EN_STEP2 =
  "Step 2/2. Send your email for the receipt - it goes straight to the payment provider and is never stored on our side.";
const HOST_BAD = "Не похоже на домен. Пришли адрес в виде myapp.com или myapp.vercel.app.";
const EMAIL_BAD = "Не похоже на email. Пришли ещё раз, например you@example.com.";

export function handleBotInput(state: BotState, raw: string): BotStep {
  const text = raw.trim();
  if (text.startsWith("/")) {
    const cmd = text.split(/[\s@]+/)[0].toLowerCase();
    switch (cmd) {
      case "/start":
        return { state: { stage: "idle" }, intent: { action: "reply" }, reply: BOT_GREETING };
      case "/buy_ru":
        return { state: { stage: "await_host", provider: "yk" }, intent: { action: "reply" }, reply: RU_STEP1 };
      case "/buy_en":
        return { state: { stage: "await_host", provider: "lava" }, intent: { action: "reply" }, reply: EN_STEP1 };
      case "/status":
        if (state.nonce) {
          return { state, intent: { action: "check_status" }, reply: "" };
        }
        return {
          state,
          intent: { action: "reply" },
          reply: "Активной покупки нет. /buy_ru или /buy_en - начать.",
        };
      case "/cancel":
        return { state: { stage: "idle" }, intent: { action: "reply" }, reply: "Диалог сброшен. /start - меню." };
      default:
        return { state, intent: { action: "reply" }, reply: BOT_UNKNOWN };
    }
  }

  if (state.stage === "await_host") {
    const host = text
      .replace(/^https?:\/\//i, "")
      .replace(/\/.*$/, "")
      .replace(/^www\./i, "");
    if (!HOST_RE.test(host)) {
      return { state, intent: { action: "reply" }, reply: HOST_BAD };
    }
    const step2 = state.provider === "lava" ? EN_STEP2 : RU_STEP2;
    return {
      state: { ...state, stage: "await_email", host },
      intent: { action: "reply" },
      reply: step2,
    };
  }

  if (state.stage === "await_email") {
    if (!EMAIL_RE.test(text)) {
      return { state, intent: { action: "reply" }, reply: EMAIL_BAD };
    }
    return {
      // the email must not persist in the Redis state - it only lives in the
      // intent object handed to the purchase call
      state: { ...state, stage: "paid_pending" },
      intent: { action: "create_purchase", provider: state.provider ?? "yk", host: state.host ?? "", email: text },
      reply: "",
    };
  }

  return { state, intent: { action: "reply" }, reply: BOT_UNKNOWN };
}
