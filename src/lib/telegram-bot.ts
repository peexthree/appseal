/**
 * Telegram bot purchase flow for Launch Pass - a pure state machine, so the
 * transitions are unit-testable without Telegram or Redis. The webhook route
 * feeds each update through handleBotInput and executes the returned intent.
 *
 * Language: the route resolves the buyer's language from the Telegram
 * language_code (site deep links carry an explicit ru-/en- prefix that wins).
 * Provider and language are independent - a Russian speaker buying via
 * /buy_en gets RU texts with the USD invoice.
 *
 * 152-FZ note: the per-chat state stored in Redis holds stage/provider/host/
 * nonce only - the buyer email never lands there, it transits to the payment
 * provider inside the invoice call and is forgotten.
 */

const HOST_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export type BotProvider = "yk" | "lava";
export type BotLang = "ru" | "en";

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
  lang: BotLang; // effective language - the route needs it for status/purchase texts
}

interface LangPack {
  greeting: string;
  unknown: string;
  step1: string;
  step2: string;
  hostBad: string;
  emailBad: string;
  statusNone: string;
  cancelled: string;
  payText: (host: string) => string;
  payFail: (msg: string, retryCmd: string) => string;
  btnPay: string;
}

const RU: LangPack = {
  greeting:
    "AppSeal - печать доверия для ИИ-приложений (appseal.online).\n\n" +
    "/buy_ru - Launch Pass за 490 ₽ (ЮKassa, РФ)\n" +
    "/buy_en - Launch Pass за $6 (любая зарубежная карта)\n" +
    "/status - статус последней покупки\n" +
    "/cancel - сброс диалога",
  unknown: "Не понял сообщение. Команды: /start - меню, /buy_ru или /buy_en - купить Launch Pass.",
  step1: "Шаг 1/2. Пришли домен, для которого нужен пропуск (например myapp.vercel.app).",
  step2: "Шаг 2/2. Пришли email для чека - он уходит напрямую в платёжную систему и у нас не хранится.",
  hostBad: "Не похоже на домен. Пришли адрес в виде myapp.com или myapp.vercel.app.",
  emailBad: "Не похоже на email. Пришли ещё раз, например you@example.com.",
  statusNone: "Активной покупки нет. /buy_ru или /buy_en - начать.",
  cancelled: "Диалог сброшен. /start - меню.",
  payText: (host) =>
    `Пропуск для домена: ${host}. После оплаты активируется автоматически (до пары минут) - проверяй /status.`,
  payFail: (msg, retryCmd) => `Не удалось создать платёж: ${msg}. Попробуй /${retryCmd} ещё раз.`,
  btnPay: "Оплатить 490 ₽ (ЮKassa)",
};

const EN: LangPack = {
  greeting:
    "AppSeal - the trust seal for AI-built apps (appseal.online).\n\n" +
    "/buy_ru - Launch Pass for 490 RUB (YooKassa, RF cards)\n" +
    "/buy_en - Launch Pass for $6 (any international card)\n" +
    "/status - status of your last purchase\n" +
    "/cancel - reset the dialog",
  unknown: "Not sure what you mean. Commands: /start - menu, /buy_ru or /buy_en - buy a Launch Pass.",
  step1: "Step 1/2. Send the domain for the pass (e.g. myapp.vercel.app).",
  step2: "Step 2/2. Send your email for the receipt - it goes straight to the payment provider and is never stored on our side.",
  hostBad: "That does not look like a domain. Send an address like myapp.com or myapp.vercel.app.",
  emailBad: "That does not look like an email. Try again, e.g. you@example.com.",
  statusNone: "No active purchase. /buy_ru or /buy_en to start one.",
  cancelled: "Dialog reset. /start for the menu.",
  payText: (host) =>
    `Pass for ${host}. It activates automatically right after payment (up to a couple of minutes) - check /status.`,
  payFail: (msg, retryCmd) => `Could not create the payment: ${msg}. Try /${retryCmd} again.`,
  btnPay: "Pay $6 with card",
};

const PACKS: Record<BotLang, LangPack> = { ru: RU, en: EN };

export function handleBotInput(state: BotState, raw: string, lang: BotLang = "ru"): BotStep {
  const pack = PACKS[lang];
  const text = raw.trim();
  if (text.startsWith("/")) {
    const cmd = text.split(/[\s@]+/)[0].toLowerCase();
    switch (cmd) {
      case "/start": {
        // deep link from the landing: /start ru-myapp_vercel_app - dots arrive
        // as underscores (start_param allows only latin/digits/_/-); the
        // prefix presets BOTH the provider and the language of the dialog
        const param = text.split(/\s+/)[1] ?? "";
        const m = param.match(/^(ru|en)-([a-z0-9_-]{3,60})$/i);
        if (m) {
          const deepLang: BotLang = m[1].toLowerCase() === "en" ? "en" : "ru";
          const deepPack = PACKS[deepLang];
          const provider = m[1].toLowerCase() === "en" ? "lava" : "yk";
          const host = m[2].replace(/_/g, ".").toLowerCase();
          if (HOST_RE.test(host)) {
            return {
              state: { stage: "await_email", provider, host },
              intent: { action: "reply" },
              reply: `Домен пропуска: ${host}\n\n${deepPack.step2}`,
              lang: deepLang,
            };
          }
        }
        return { state: { stage: "idle" }, intent: { action: "reply" }, reply: pack.greeting, lang };
      }
      case "/buy_ru":
        return {
          state: { stage: "await_host", provider: "yk" },
          intent: { action: "reply" },
          reply: RU.step1,
          lang: "ru",
        };
      case "/buy_en":
        return {
          state: { stage: "await_host", provider: "lava" },
          intent: { action: "reply" },
          reply: EN.step1,
          lang: "en",
        };
      case "/status":
        if (state.nonce) {
          return { state, intent: { action: "check_status" }, reply: "", lang };
        }
        return { state, intent: { action: "reply" }, reply: pack.statusNone, lang };
      case "/cancel":
        return { state: { stage: "idle" }, intent: { action: "reply" }, reply: pack.cancelled, lang };
      default:
        return { state, intent: { action: "reply" }, reply: pack.unknown, lang };
    }
  }

  if (state.stage === "await_host") {
    const host = text
      .replace(/^https?:\/\//i, "")
      .replace(/\/.*$/, "")
      .replace(/^www\./i, "");
    if (!HOST_RE.test(host)) {
      return { state, intent: { action: "reply" }, reply: pack.hostBad, lang };
    }
    return {
      state: { ...state, stage: "await_email", host },
      intent: { action: "reply" },
      reply: pack.step2,
      lang,
    };
  }

  if (state.stage === "await_email") {
    if (!EMAIL_RE.test(text)) {
      return { state, intent: { action: "reply" }, reply: pack.emailBad, lang };
    }
    return {
      // the email must not persist in the Redis state - it only lives in the
      // intent object handed to the purchase call
      state: { ...state, stage: "paid_pending" },
      intent: {
        action: "create_purchase",
        provider: state.provider ?? "yk",
        host: state.host ?? "",
        email: text,
      },
      reply: "",
      lang,
    };
  }

  return { state, intent: { action: "reply" }, reply: pack.unknown, lang };
}

/* texts the webhook route needs after the state machine (payment attempt,
 * status poll) - kept next to the machine so copy edits land in one file */

export function botPayText(lang: BotLang, host: string): string {
  return PACKS[lang].payText(host);
}

export function botPayBtn(lang: BotLang, provider: BotProvider): string {
  return provider === "lava" ? EN.btnPay : RU.btnPay;
}

export function botPayFail(lang: BotLang, msg: string, retryCmd: string): string {
  return PACKS[lang].payFail(msg, retryCmd);
}

export function botStatusText(
  lang: BotLang,
  kind: "done" | "pending" | "fail",
  host?: string,
  until?: string,
  status?: string,
): string {
  if (kind === "done") {
    return lang === "en"
      ? `Pass active for ${host || "?"} until ${until ? until.slice(0, 10) : "?"}. Unlimited scans: https://appseal.online`
      : `Пропуск активен для ${host || "?"} до ${until ? until.slice(0, 10) : "?"}. Сканы без лимита: https://appseal.online`;
  }
  if (kind === "pending") {
    return lang === "en"
      ? `Payment has not gone through yet (status: ${status}). Press /status again after paying.`
      : `Оплата ещё не прошла (статус: ${status}). После оплаты нажми /status ещё раз.`;
  }
  return lang === "en"
    ? "Could not check the status - try again later."
    : "Не удалось проверить статус - попробуй позже.";
}
