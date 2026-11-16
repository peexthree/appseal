/**
 * Telegram bot purchase flow for Launch Pass and the Agency Pack - a pure
 * state machine, so the transitions are unit-testable without Telegram or
 * Redis. The webhook route feeds each update through handleBotInput and
 * executes the returned intent.
 *
 * Language: the route resolves the buyer's language from the Telegram
 * language_code (site deep links carry an explicit ru-/en- prefix that wins).
 * Provider and language are independent - a Russian speaker buying via
 * /buy_en gets RU texts with the USD invoice.
 *
 * Agency Pack (5 pass-credits bought at once): /buy5 collects the email and
 * creates the pack payment; after the webhook grants the credits, /redeem
 * <domain> consumes one credit and activates a 7-day pass on that domain.
 * The chat->pack binding lives in Redis (tg:pack:{chatId}), not in the
 * dialog state, so /redeem works days later with no live dialog.
 *
 * 152-FZ note: the per-chat state stored in Redis holds stage/provider/mode/
 * nonce only - the buyer email never lands there, it transits to the payment
 * provider inside the invoice call and is forgotten.
 */

const HOST_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export type BotProvider = "yk" | "lava";
export type BotLang = "ru" | "en";

export interface BotState {
  stage: "idle" | "await_host" | "await_email" | "paid_pending" | "await_redeem_host" | "await_watch_host";
  provider?: BotProvider;
  host?: string;
  nonce?: string;
  /** "pack" - the email step belongs to the Agency Pack (no host involved) */
  mode?: "single" | "pack";
}

export type BotIntent =
  | { action: "reply" }
  | { action: "create_purchase"; provider: BotProvider; host: string; email: string }
  | { action: "create_pack_purchase"; provider: BotProvider; email: string }
  | { action: "redeem"; host: string }
  | { action: "watch"; host: string }
  | { action: "unwatch" }
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
  packStep2: string;
  packPayText: string;
  redeemPrompt: string;
  redeemNoPack: string;
  redeemBad: string;
  redeemEmpty: string;
  hostBad: string;
  emailBad: string;
  statusNone: string;
  cancelled: string;
  watchPrompt: string;
  watchRemoved: string;
  watchNone: string;
  payText: (host: string) => string;
  payFail: (msg: string, retryCmd: string) => string;
  btnPay: string;
  btnPackPay: string;
}

const RU: LangPack = {
  greeting:
    "AppSeal - печать доверия для ИИ-приложений (appseal.online).\n\n" +
    "/buy_ru - Launch Pass за 490 ₽ (ЮKassa, РФ)\n" +
    "/buy_en - Launch Pass за $6 (любая зарубежная карта)\n" +
    "/buy5 - Agency Pack: 5 пропусков за 1 490 ₽ (выгоднее на 39%)\n" +
    "/redeem - активировать пропуск из купленного пакета\n" +
    "/watch - следить за одним доменом бесплатно (алерт при изменении)\n" +
    "/unwatch - перестать следить\n" +
    "/status - статус последней покупки\n" +
    "/cancel - сброс диалога",
  unknown: "Не понял сообщение. Команды: /start - меню, /buy_ru, /buy_en или /buy5 - купить.",
  step1: "Шаг 1/2. Пришли домен, для которого нужен пропуск (например myapp.vercel.app).",
  step2: "Шаг 2/2. Пришли email для чека - он уходит напрямую в платёжную систему и у нас не хранится.",
  packStep2:
    "Agency Pack = 5 пропусков (по 7 дней безлимита на каждый домен). Шаг 1/1: пришли email для чека - он уходит напрямую в платёжную систему и у нас не хранится. После оплаты активируй пропуска командой /redeem <домен>.",
  packPayText:
    "Пакет из 5 пропусков создан. После оплаты кредиты появятся автоматически (до пары минут) - затем активируй каждый домен командой /redeem myapp.com (каждому - свои 7 дней, кредиты живут 30 дней).",
  redeemPrompt: "Пришли домен, на который активировать один пропуск из пакета (например myapp.vercel.app).",
  redeemNoPack: "Купленный пакет не найден. Купи его командой /buy5 - и возвращайся за /redeem.",
  redeemBad: "Не похоже на домен. Пришли адрес в виде myapp.com или myapp.vercel.app.",
  redeemEmpty: "Кредиты пакета исчерпаны или истекли. Новый пакет: /buy5.",
  hostBad: "Не похоже на домен. Пришли адрес в виде myapp.com или myapp.vercel.app.",
  emailBad: "Не похоже на email. Пришли ещё раз, например you@example.com.",
  statusNone: "Активной покупки нет. /buy_ru, /buy_en или /buy5 - начать.",
  cancelled: "Диалог сброшен. /start - меню.",
  watchPrompt: "Пришли домен для бесплатного наблюдения (например myapp.vercel.app). Один домен на чат: напишу, когда класс изменится после проверки. Перепроверка - раз в сутки.",
  watchRemoved: "Наблюдение снято. Вернуть: /watch myapp.com",
  watchNone: "Я и так ничего не наблюдаю в этом чате. Добавить: /watch myapp.com",
  payText: (host) =>
    `Пропуск для домена: ${host}. После оплаты активируется автоматически (до пары минут) - проверяй /status.`,
  payFail: (msg, retryCmd) => `Не удалось создать платёж: ${msg}. Попробуй /${retryCmd} ещё раз.`,
  btnPay: "Оплатить 490 ₽ (ЮKassa)",
  btnPackPay: "Оплатить пакет 1 490 ₽ (ЮKassa)",
};

const EN: LangPack = {
  greeting:
    "AppSeal - the trust seal for AI-built apps (appseal.online).\n\n" +
    "/buy_ru - Launch Pass for 490 RUB (YooKassa, RF cards)\n" +
    "/buy_en - Launch Pass for $6 (any international card)\n" +
    "/buy5 - Agency Pack: 5 passes for $19 (39% cheaper)\n" +
    "/redeem - activate a pass from a purchased pack\n" +
    "/watch - follow one domain for free (alert on any change)\n" +
    "/unwatch - stop following\n" +
    "/status - status of your last purchase\n" +
    "/cancel - reset the dialog",
  unknown: "Not sure what you mean. Commands: /start - menu, /buy_ru, /buy_en or /buy5 - buy a pass.",
  step1: "Step 1/2. Send the domain for the pass (e.g. myapp.vercel.app).",
  step2: "Step 2/2. Send your email for the receipt - it goes straight to the payment provider and is never stored on our side.",
  packStep2:
    "Agency Pack = 5 passes (7 days of unlimited scans per domain each). Step 1/1: send the email for the receipt - it goes straight to the payment provider and is never stored on our side. After paying, activate each domain with /redeem myapp.com.",
  packPayText:
    "The 5-pass pack is created. Credits land automatically after payment (up to a couple of minutes) - then activate every domain with /redeem myapp.com (7 days each, credits live 30 days).",
  redeemPrompt: "Send the domain to activate one pass from your pack (e.g. myapp.vercel.app).",
  redeemNoPack: "No purchased pack found. Buy one with /buy5 - then come back for /redeem.",
  redeemBad: "That does not look like a domain. Send an address like myapp.com or myapp.vercel.app.",
  redeemEmpty: "Pack credits are used up or expired. A new pack: /buy5.",
  hostBad: "That does not look like a domain. Send an address like myapp.com or myapp.vercel.app.",
  emailBad: "That does not look like an email. Try again, e.g. you@example.com.",
  statusNone: "No active purchase. /buy_ru, /buy_en or /buy5 to start one.",
  cancelled: "Dialog reset. /start for the menu.",
  watchPrompt: "Send the domain to follow for free (e.g. myapp.vercel.app). One domain per chat: I will message you whenever its grade changes after a check. Free re-scan cadence - once a day.",
  watchRemoved: "Unfollowed. Follow again with /watch myapp.com",
  watchNone: "Nothing is followed in this chat yet. Add one: /watch myapp.com",
  payText: (host) =>
    `Pass for ${host}. It activates automatically right after payment (up to a couple of minutes) - check /status.`,
  payFail: (msg, retryCmd) => `Could not create the payment: ${msg}. Try /${retryCmd} again.`,
  btnPay: "Pay $6 with card",
  btnPackPay: "Pay pack $19 with card",
};

const PACKS: Record<BotLang, LangPack> = { ru: RU, en: EN };

export function handleBotInput(state: BotState, raw: string, lang: BotLang = "ru"): BotStep {
  const pack = PACKS[lang];
  const text = raw.trim();
  if (text.startsWith("/")) {
    const cmd = text.split(/[\s@]+/)[0].toLowerCase();
    const arg = text.split(/\s+/).slice(1).join(" ");
    switch (cmd) {
      case "/start": {
        // deep link from the landing: /start ru-myapp_vercel_app - dots arrive
        // as underscores (start_param allows only latin/digits/_/-); the
        // prefix presets BOTH the provider and the language of the dialog
        const param = text.split(/\s+/)[1] ?? "";
        const packLink = param.match(/^(ru|en)-pack(5)?$/i);
        if (packLink) {
          // pack deep link: straight to the email step (no domain involved)
          const deepLang: BotLang = packLink[1].toLowerCase() === "en" ? "en" : "ru";
          const deepProvider: BotProvider = deepLang === "en" ? "lava" : "yk";
          const deepPack = PACKS[deepLang];
          return {
            state: { stage: "await_email", provider: deepProvider, mode: "pack" },
            intent: { action: "reply" },
            reply: deepPack.packStep2,
            lang: deepLang,
          };
        }
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
          state: { stage: "await_host", provider: "yk", mode: "single" },
          intent: { action: "reply" },
          reply: RU.step1,
          lang: "ru",
        };
      case "/buy_en":
        return {
          state: { stage: "await_host", provider: "lava", mode: "single" },
          intent: { action: "reply" },
          reply: EN.step1,
          lang: "en",
        };
      case "/buy5":
        // pack provider follows the language: RU -> YooKassa, EN -> Lava offer
        return {
          state: { stage: "await_email", provider: lang === "en" ? "lava" : "yk", mode: "pack" },
          intent: { action: "reply" },
          reply: pack.packStep2,
          lang,
        };
      case "/redeem": {
        if (arg) {
          const host = arg
            .replace(/^https?:\/\//i, "")
            .replace(/\/.*$/, "")
            .replace(/^www\./i, "")
            .toLowerCase();
          if (!HOST_RE.test(host)) {
            return { state, intent: { action: "reply" }, reply: pack.redeemBad, lang };
          }
          return { state, intent: { action: "redeem", host }, reply: "", lang };
        }
        return {
          state: { ...state, stage: "await_redeem_host" },
          intent: { action: "reply" },
          reply: pack.redeemPrompt,
          lang,
        };
      }
      case "/watch": {
        if (arg) {
          const host = arg
            .replace(/^https?:\/\//i, "")
            .replace(/\/.*$/, "")
            .replace(/^www\./i, "")
            .toLowerCase();
          if (!HOST_RE.test(host)) {
            return { state, intent: { action: "reply" }, reply: pack.hostBad, lang };
          }
          return { state: { stage: "idle" }, intent: { action: "watch", host }, reply: "", lang };
        }
        return {
          state: { ...state, stage: "await_watch_host" },
          intent: { action: "reply" },
          reply: pack.watchPrompt,
          lang,
        };
      }
      case "/unwatch":
        return { state: { stage: "idle" }, intent: { action: "unwatch" }, reply: "", lang };
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

  if (state.stage === "await_redeem_host") {
    const host = text
      .replace(/^https?:\/\//i, "")
      .replace(/\/.*$/, "")
      .replace(/^www\./i, "")
      .toLowerCase();
    if (!HOST_RE.test(host)) {
      return { state, intent: { action: "reply" }, reply: pack.redeemBad, lang };
    }
    return { state, intent: { action: "redeem", host }, reply: "", lang };
  }

  if (state.stage === "await_watch_host") {
    const host = text
      .replace(/^https?:\/\//i, "")
      .replace(/\/.*$/, "")
      .replace(/^www\./i, "")
      .toLowerCase();
    if (!HOST_RE.test(host)) {
      return { state, intent: { action: "reply" }, reply: pack.hostBad, lang };
    }
    return { state: { stage: "idle" }, intent: { action: "watch", host }, reply: "", lang };
  }

  if (state.stage === "await_email") {
    if (!EMAIL_RE.test(text)) {
      return { state, intent: { action: "reply" }, reply: pack.emailBad, lang };
    }
    if (state.mode === "pack") {
      return {
        // the email must not persist in the Redis state - it only lives in the
        // intent object handed to the purchase call
        state: { ...state, stage: "paid_pending" },
        intent: { action: "create_pack_purchase", provider: state.provider ?? "yk", email: text },
        reply: "",
        lang,
      };
    }
    return {
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

export function botPackPayText(lang: BotLang): string {
  return PACKS[lang].packPayText;
}

export function botRedeemNoPack(lang: BotLang): string {
  return PACKS[lang].redeemNoPack;
}

/** Confirmation after the webhook stored the watch; current grade optional. */
export function botWatchDone(lang: BotLang, host: string, currentGrade?: string): string {
  const known = currentGrade
    ? lang === "en"
      ? `Current standing: grade ${currentGrade}.`
      : `Текущий статус: класс ${currentGrade}.`
    : lang === "en"
      ? "Not scanned yet - the first check will set the baseline."
      : "Пока не проверен - первая проверка станет стартовой точкой.";
  return lang === "en"
    ? `Now following ${host}. ${known}\nI will message you when its grade changes (free re-scan: once a day). Move it: /watch other.com - stop: /unwatch`
    : `Следим за ${host}. ${known}\nНапишу, когда класс изменится (бесплатная перепроверка - раз в сутки). Сменить домен: /watch other.com - отменить: /unwatch`;
}

export function botWatchLimit(lang: BotLang, max: number): string {
  return lang === "en"
    ? `Free watch slots are full (${max}). Launch Pass keeps your own domain on the 6-hour watch - /buy_ru`
    : `Бесплатные слоты наблюдения закончились (${max}). Launch Pass держит твой домен на 6-часовом наблюдении - /buy_ru`;
}

export function botWatchRemoved(lang: BotLang): string {
  return PACKS[lang].watchRemoved;
}

export function botWatchNone(lang: BotLang): string {
  return PACKS[lang].watchNone;
}

export function botPackPayBtn(lang: BotLang, provider: BotProvider): string {
  return provider === "lava" ? EN.btnPackPay : RU.btnPackPay;
}

export function botPayFail(lang: BotLang, msg: string, retryCmd: string): string {
  return PACKS[lang].payFail(msg, retryCmd);
}

export function botRedeemResultText(
  lang: BotLang,
  kind: "done" | "empty",
  host?: string,
  until?: string,
): string {
  if (kind === "done") {
    return lang === "en"
      ? `Pass activated for ${host || "?"} until ${until ? until.slice(0, 10) : "?"} (7 days). Next domain: /redeem myapp.com`
      : `Пропуск активирован для ${host || "?"} до ${until ? until.slice(0, 10) : "?"} (7 дней). Следующий домен: /redeem myapp.com`;
  }
  return PACKS[lang].redeemEmpty;
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
