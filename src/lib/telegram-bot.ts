/**
 * Telegram bot purchase flow for Launch Pass, Pro Pass and the Agency Pack -
 * a pure state machine, so the transitions are unit-testable without Telegram
 * or Redis. The webhook route feeds each update through handleBotInput and
 * executes the returned intent.
 *
 * Language: the route resolves the buyer's language from the Telegram
 * language_code (site deep links carry an explicit ru-/en- prefix that wins).
 * Provider and language are independent - a Russian speaker buying via
 * /buy_en gets RU texts with the USD invoice; the tariff prices follow the
 * provider (yk = RUB, lava = USD) the same way the payment button does.
 *
 * Presentation: every bot text is Telegram HTML (parse_mode "HTML" is set by
 * the webhook route only - monitor/digest alerts stay plain text). Grades use
 * the same emoji palette as the site's GRADE_META colors: A+ amethyst -> 💜,
 * A emerald -> 💚, B sky -> 💙, C amber -> 💛, D copper -> 🧡, E red -> 🔴.
 * Inline keyboards are built here as pure functions too, so the route just
 * hands them to Bot API and tests can assert the button layout.
 *
 * Single purchases ask the domain, then a tariff menu: Launch Pass (7 days)
 * or Pro Pass (30 days) - both one-time payments, no auto-renewals. The plan
 * step applies only to dialogs opened via /buy_ru|/buy_en (mode "single"):
 * landing deep links sell Launch directly, and /plan_pro|/plan_launch typed
 * cold preset the plan so the menu is skipped.
 *
 * Free conveniences on top of the sales flow: /scan <domain> (and a bare
 * domain typed into the chat) answers with the freshest registry grade and a
 * link to the full report; /watch keeps up to 3 domains per chat on the free
 * daily rescan (tg:watch:{chatId} = JSON {"hosts":[...]}, /unwatch asks a
 * digit when several are listed); /token mints the Pro Pass API token;
 * /myscans and /redeem as before; /help is a short explainer that never
 * resets an open dialog.
 *
 * Agency Pack (5 pass-credits bought at once): /buy5 collects the email and
 * creates the pack payment; after the webhook grants the credits, /redeem
 * <domain> consumes one credit and activates a 7-day pass on that domain.
 * The chat->pack binding lives in Redis (tg:pack:{chatId}), not in the
 * dialog state, so /redeem works days later with no live dialog.
 *
 * /myscans lists the chat's own domains: the free watch hosts (up to 3) plus
 * every host a pack credit was redeemed onto (tg:redeem:{chatId}), each with
 * its live grade from the scan store. Single pass purchases carry no chat
 * binding.
 *
 * 152-FZ note: the per-chat state stored in Redis holds stage/provider/mode/
 * plan/nonce/hosts only - hosts are the watched domains snapshotted for the
 * /unwatch pick (no personal data), and the buyer email never lands there:
 * it transits to the payment provider inside the invoice call and is
 * forgotten.
 */

const HOST_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export type BotProvider = "yk" | "lava";
export type BotLang = "ru" | "en";
/** single-purchase tariff: Launch = 7 days, Pro = 30 days (one-time, no renewals) */
export type BotPlan = "launch" | "pro";

export interface BotState {
  stage:
    | "idle"
    | "await_host"
    | "await_email"
    | "await_plan"
    | "paid_pending"
    | "await_redeem_host"
    | "await_watch_host"
    | "await_scan_host"
    | "await_unwatch_pick"
    | "await_delete_confirm";
  provider?: BotProvider;
  host?: string;
  nonce?: string;
  /** "pack" - the email step belongs to the Agency Pack (no host involved) */
  mode?: "single" | "pack";
  /** chosen tariff for single purchases; dialogs without it sell Launch */
  plan?: BotPlan;
  /** domains snapshotted for the /unwatch numbered pick (2-3 hosts); the
   *  fresh Redis list stays the source of truth at execution time */
  hosts?: string[];
}

export type BotIntent =
  | { action: "reply" }
  | { action: "create_purchase"; provider: BotProvider; host: string; email: string; plan: BotPlan }
  | { action: "create_pack_purchase"; provider: BotProvider; email: string }
  | { action: "redeem"; host: string }
  | { action: "watch"; host: string }
  | { action: "unwatch" }
  | { action: "unwatch_pick"; host: string }
  | { action: "issue_token" }
  | { action: "check_status" }
  | { action: "my_scans" }
  | { action: "scan"; host: string }
  | { action: "delete_data" };

export interface BotStep {
  state: BotState;
  intent: BotIntent;
  reply: string;
  lang: BotLang; // effective language - the route needs it for status/purchase texts
}

/** per-domain line source for /myscans and /scan - a scan-registry entry in
 *  its smallest form (all fields optional: an unscanned domain still lists) */
export interface MyScanEntry {
  host: string;
  grade?: string;
  score?: number;
  ts?: number; // ms epoch of the newest scan
  /** registry entry id - when present, the host becomes a link to the full report */
  id?: string;
  /** short public description from the registry entry (scan output meta) */
  desc?: string;
}

/** Production origin of the site: used in report links and the scanner button */
export const BOT_SITE_URL = "https://appseal.online";

interface PlanPrices {
  launch: string;
  pro: string;
}

const RU_PRICES: PlanPrices = { launch: "490 ₽", pro: "1 490 ₽" };
const EN_PRICES: PlanPrices = { launch: "$6", pro: "$19" };

/** Escape a dynamic value before embedding it into an HTML text. Hosts come
 *  from a strict regex and the email never appears in a reply, but escaping
 *  is one call and keeps the HTML contract unbreakable. */
function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Grade emoji palette - mirrors GRADE_META colors on the site so the chat
 *  badge and the site badge read as the same mark. Unknown/absent -> ⚪. */
const GRADE_BADGES: Record<string, string> = { "A+": "💜", A: "💚", B: "💙", C: "💛", D: "🧡", E: "🔴" };

export function botGradeBadge(grade?: string): string {
  return (grade && GRADE_BADGES[grade]) || "⚪";
}

interface LangPack {
  greeting: string;
  help: string;
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
  emailInIdle: string;
  statusNone: string;
  cancelled: string;
  watchPrompt: string;
  watchRemoved: string;
  watchNone: string;
  unwatchPick: (hosts: string[]) => string;
  tokenNoPro: string;
  tokenFail: string;
  deletePrompt: string;
  /** dbOk=false -> the durable store was unreachable, the deletion there did
   *  not run - the reply must say so instead of pretending success */
  deleteDone: (dbOk: boolean) => string;
  deleteCancelled: string;
  reviewCta: string;
  myscansEmpty: string;
  myscansHeader: string;
  myscansNoData: string;
  scanPrompt: string;
  scanNone: (host: string) => string;
  planPrompt: (host: string, prices: PlanPrices) => string;
  payText: (host: string, days: number) => string;
  payFail: (msg: string, retryCmd: string) => string;
  btnPay: string;
  btnPayPro: string;
  btnPackPay: string;
  btnPlanLaunch: string;
  btnPlanPro: string;
  btnScanner: string;
  btnLaunch: string;
  btnPro: string;
  btnPack: string;
  btnWatch: string;
  btnMyScans: string;
  btnCancel: string;
  btnCheckPay: string;
  btnReport: string;
  scanCta: string;
}

const RU: LangPack = {
  greeting:
    "🔐 <b>AppSeal</b> - печать доверия для ИИ-приложений (appseal.online).\n\n" +
    "Скан живого приложения: утечки секретов, открытые базы, дырявые админки, признаки заброшенности. Класс A+-E и бейдж доверия за минуту.\n\n" +
    "<b>Пропуск</b> - безлимитные сканы домена, разовая оплата без автосписаний:\n" +
    "/buy_ru - ЮKassa: Launch 7 дней - 490 ₽, Pro 30 дней - 1 490 ₽\n" +
    "/buy_en - зарубежной картой: $6 / $19\n" +
    "/buy5 - Agency Pack: 5 пропусков за 1 490 ₽ (выгоднее на 39%)\n\n" +
    "<b>Бесплатно:</b>\n" +
    "/scan myapp.com - свежий класс домена из реестра\n" +
    "/watch myapp.com - следить за доменом, алерт при изменении\n" +
    "/myscans - твои домены и их классы\n\n" +
    "/redeem - активировать домен из купленного пакета\n" +
    "/status - статус последней покупки\n" +
    "/cancel - сброс диалога\n" +
    "/delete - удалить данные этого чата",
  help:
    "🔐 <b>Что делает AppSeal:</b> проверяет живое приложение на утечки секретов, открытые базы, дырявые админки и заголовки безопасности. Класс A+-E и бейдж доверия на сайт за минуту.\n\n" +
    "<b>Пропуск</b> = безлимитные сканы одного домена: Launch Pass - 7 дней, Pro Pass - 30 дней. Разовые платежи, без автосписаний.\n\n" +
    "Начать: /buy_ru (ЮKassa) или /buy_en (карта). Всё остальное - в <a href=\"https://appseal.online\">сканере</a>: /scan myapp.com покажет класс прямо в чате.\n\n" +
    "Pro Pass (30 дней) включает /token - API-токен для встраивания: заголовок Authorization: Bearer к /api/scan снимает дневной лимит.\n\nУдаление своих данных из сервиса: /delete.",
  unknown: "Не понял сообщение. Команды: /start - меню, /scan myapp.com - проверка домена, /buy_ru - купить.",
  step1: "Шаг 1/2. Пришли домен, для которого нужен пропуск (например <code>myapp.vercel.app</code>).",
  step2: "Шаг 2/2. Пришли email для чека - он уходит напрямую в платёжную систему и у нас не хранится.",
  packStep2:
    "📦 <b>Agency Pack</b> = 5 пропусков (по 7 дней безлимита на каждый домен).\n\n" +
    "Шаг 1/1: пришли email для чека - он уходит напрямую в платёжную систему и у нас не хранится.\n\n" +
    "После оплаты активируй каждый домен командой <code>/redeem myapp.com</code> - кредиты живут 30 дней.",
  packPayText:
    "Пакет из 5 пропусков создан. После оплаты кредиты появятся автоматически (до пары минут) - затем активируй каждый домен командой /redeem myapp.com (каждому - свои 7 дней, кредиты живут 30 дней).",
  redeemPrompt: "Пришли домен, на который активировать один пропуск из пакета (например <code>myapp.vercel.app</code>).",
  redeemNoPack: "Купленный пакет не найден. Купи его командой /buy5 - и возвращайся за /redeem.",
  redeemBad: "Не похоже на домен. Пришли адрес в виде <code>myapp.com</code> или <code>myapp.vercel.app</code>.",
  redeemEmpty: "Кредиты пакета исчерпаны или истекли. Новый пакет: /buy5.",
  hostBad: "Не похоже на домен. Пришли адрес в виде <code>myapp.com</code> или <code>myapp.vercel.app</code>.",
  emailBad: "Не похоже на email. Пришли ещё раз, например <code>you@example.com</code>.",
  emailInIdle: "Это похоже на email - он понадобится на шаге 2 покупки. Начни с домена: пришли адрес сайта или /buy_ru.",
  statusNone: "Активной покупки нет. /buy_ru, /buy_en или /buy5 - начать.",
  cancelled: "Диалог сброшен. /start - меню.",
  watchPrompt: "Пришли домен для бесплатного наблюдения (например <code>myapp.vercel.app</code>). До 3 доменов на чат: напишу, когда класс изменится после проверки. Перепроверка - раз в сутки.",
  watchRemoved: "Наблюдение снято. Вернуть: /watch myapp.com",
  watchNone: "Я и так ничего не наблюдаю в этом чате. Добавить: /watch myapp.com",
  unwatchPick: (hosts) =>
    `Какой домен снять с наблюдения?\n${hosts.map((h, i) => `${i + 1}. <code>${esc(h)}</code>`).join("\n")}\n\nПришли цифру.`,
  tokenNoPro: "API-токен входит в Pro Pass (30 дней). Купить: /plan_pro",
  tokenFail: "Не удалось создать токен - попробуй позже.",
  deletePrompt:
    "🗑 <b>Удаление данных</b>\n\nБудут стёрты все записи, привязанные к этому чату: наблюдения за доменами (/watch), кредиты Agency Pack, API-токены, история доменов и идентификатор диалога из базы сервиса. Активные пропуска продолжат действовать на своих доменах до конца срока (товар привязан к домену, а не к чату), но алерты и поддержка по ним больше не придут в этот чат. Средства не возвращаются.\n\nОтправь /delete ещё раз для подтверждения или /cancel для отмены.",
  deleteDone: (dbOk) =>
    "🗑 Готово: наблюдения, кредиты, токены и привязки этого чата стёрты, идентификатор диалога удалён из базы сервиса. Чеки прошлых платежей остаются у платёжного провайдера - по закону хранит их он, не мы. Вернуться: /start." +
    (dbOk ? "" : "\n\nБаза сервиса была недоступна - пришли письмо на security@appseal.online, чтобы довершить удаление в базе."),
  deleteCancelled: "Удаление отменено. Диалог сброшен. /start - меню.",
  reviewCta: "💬 Понравилось? Оставьте отзыв: appseal.online/reviews",
  myscansEmpty:
    "Пока нет доменов. Пришли /watch myapp.com - следить бесплатно, или запусти скан на appseal.online.",
  myscansHeader: "📄 <b>Твои домены</b> (свежие классы):",
  myscansNoData: "нет данных",
  scanPrompt: "Пришли домен - покажу свежий класс из реестра (например <code>myapp.vercel.app</code>).",
  scanNone: (host) =>
    `Сканов для <code>${esc(host)}</code> в реестре пока нет.\n\nПрогони бесплатный скан на сайте - класс появится в реестре, в бейдже на твой сайт и здесь.`,
  planPrompt: (host, prices) =>
    `Домен принят: <code>${esc(host)}</code>. Выбери тариф - разовая покупка, без автосписаний:\n\n` +
    `💜 <b>Launch Pass</b> - 7 дней безлимита - ${prices.launch}\n` +
    `🚀 <b>Pro Pass</b> - 30 дней безлимита одного домена - ${prices.pro}\n\n` +
    `Нажми кнопку или пришли /plan_launch (или /plan_pro).`,
  payText: (host, days) =>
    days > 7
      ? `🚀 <b>Pro-пропуск (30 дней)</b> для домена: <code>${esc(host)}</code>.\n\nПосле оплаты активируется автоматически (до пары минут) - проверяй /status.`
      : `🔐 Пропуск для домена: <code>${esc(host)}</code>.\n\nПосле оплаты активируется автоматически (до пары минут) - проверяй /status.`,
  payFail: (msg, retryCmd) => `Не удалось создать платёж: ${esc(msg)}. Попробуй /${retryCmd} ещё раз.`,
  btnPay: "💳 Оплатить 490 ₽ (ЮKassa)",
  btnPayPro: "💳 Оплатить 1 490 ₽ (ЮKassa)",
  btnPackPay: "💳 Оплатить пакет 1 490 ₽ (ЮKassa)",
  btnPlanLaunch: "💜 Launch Pass - 7 дней - 490 ₽",
  btnPlanPro: "🚀 Pro Pass - 30 дней - 1 490 ₽",
  btnScanner: "🌐 Открыть сканер AppSeal",
  btnLaunch: "🔐 Launch Pass - 490 ₽",
  btnPro: "🚀 Pro Pass - 1 490 ₽",
  btnPack: "📦 Agency Pack - 5 пропусков за 1 490 ₽",
  btnWatch: "🔭 Следить за доменом",
  btnMyScans: "📄 Мои домены",
  btnCancel: "✖️ Отмена",
  btnCheckPay: "✅ Проверить оплату",
  btnReport: "📋 Полный отчёт",
  scanCta: "Прогнать свежий скан: appseal.online",
};

const EN: LangPack = {
  greeting:
    "🔐 <b>AppSeal</b> - the trust seal for AI-built apps (appseal.online).\n\n" +
    "A live-app scan: leaked secrets, open databases, exposed admin panels, signs of abandonment. An A+-E grade and a trust badge in a minute.\n\n" +
    "<b>A pass</b> - unlimited scans of one domain, one-time payment, no auto-renewals:\n" +
    "/buy_ru - YooKassa (RF cards): Launch 7 days - 490 RUB, Pro 30 days - 1 490 RUB\n" +
    "/buy_en - international card: $6 / $19\n" +
    "/buy5 - Agency Pack: 5 passes for $19 (37% cheaper)\n\n" +
    "<b>Free:</b>\n" +
    "/scan myapp.com - the freshest grade of a domain from the registry\n" +
    "/watch myapp.com - follow a domain, alert on any change\n" +
    "/myscans - your domains and their grades\n\n" +
    "/redeem - activate a domain from a purchased pack\n" +
    "/status - status of your last purchase\n" +
    "/cancel - reset the dialog\n" +
    "/delete - remove this chat's data",
  help:
    "🔐 <b>What AppSeal does:</b> scans a live app for leaked secrets, open databases, exposed admin panels and security headers. An A+-E grade and a trust badge for your site in a minute.\n\n" +
    "<b>A pass</b> = unlimited scans of one domain: Launch Pass - 7 days, Pro Pass - 30 days. One-time payments, no auto-renewals.\n\n" +
    "Start: /buy_ru (YooKassa) or /buy_en (card). Everything else lives in the <a href=\"https://appseal.online\">scanner</a>: /scan myapp.com shows the grade right in the chat.\n\n" +
    "The Pro Pass (30 days) unlocks /token - an API token for embedding: an Authorization: Bearer header on /api/scan lifts the daily limit.\n\nRemoving your data from the service: /delete.",
  unknown: "Not sure what you mean. Commands: /start - menu, /scan myapp.com - check a domain, /buy_ru - buy a pass.",
  step1: "Step 1/2. Send the domain for the pass (e.g. <code>myapp.vercel.app</code>).",
  step2: "Step 2/2. Send your email for the receipt - it goes straight to the payment provider and is never stored on our side.",
  packStep2:
    "📦 <b>Agency Pack</b> = 5 passes (7 days of unlimited scans per domain each).\n\n" +
    "Step 1/1: send the email for the receipt - it goes straight to the payment provider and is never stored on our side.\n\n" +
    "After paying, activate each domain with <code>/redeem myapp.com</code> - credits live 30 days.",
  packPayText:
    "The 5-pass pack is created. Credits land automatically after payment (up to a couple of minutes) - then activate every domain with /redeem myapp.com (7 days each, credits live 30 days).",
  redeemPrompt: "Send the domain to activate one pass from your pack (e.g. <code>myapp.vercel.app</code>).",
  redeemNoPack: "No purchased pack found. Buy one with /buy5 - then come back for /redeem.",
  redeemBad: "That does not look like a domain. Send an address like <code>myapp.com</code> or <code>myapp.vercel.app</code>.",
  redeemEmpty: "Pack credits are used up or expired. A new pack: /buy5.",
  hostBad: "That does not look like a domain. Send an address like <code>myapp.com</code> or <code>myapp.vercel.app</code>.",
  emailBad: "That does not look like an email. Try again, e.g. <code>you@example.com</code>.",
  emailInIdle: "That looks like an email - it is needed at purchase step 2. Start with a domain: send a site address or /buy_ru.",
  statusNone: "No active purchase. /buy_ru, /buy_en or /buy5 to start one.",
  cancelled: "Dialog reset. /start for the menu.",
  watchPrompt: "Send the domain to follow for free (e.g. <code>myapp.vercel.app</code>). Up to 3 domains per chat: I will message you whenever a grade changes after a check. Free re-scan cadence - once a day.",
  watchRemoved: "Unfollowed. Follow again with /watch myapp.com",
  watchNone: "Nothing is followed in this chat yet. Add one: /watch myapp.com",
  unwatchPick: (hosts) =>
    `Which domain should I stop following?\n${hosts.map((h, i) => `${i + 1}. <code>${esc(h)}</code>`).join("\n")}\n\nSend the number.`,
  tokenNoPro: "The API token comes with the Pro Pass (30 days). Buy one: /plan_pro",
  tokenFail: "Could not issue the token - try again later.",
  deletePrompt:
    "🗑 <b>Data deletion</b>\n\nEvery record tied to this chat will be wiped: domain watches (/watch), Agency Pack credits, API tokens, the domain history and the chat id in the Service database. Active passes keep working on their domains until expiry (the product is tied to the domain, not the chat), but alerts and support for them will no longer reach this chat. No refunds.\n\nSend /delete again to confirm, or /cancel to abort.",
  deleteDone: (dbOk) =>
    "🗑 Done: watches, credits, tokens and this chat's bindings are wiped, and the chat id is removed from the Service database. Receipts of past payments stay with the payment provider - by law they keep those, not us. To come back: /start." +
    (dbOk ? "" : "\n\nThe Service database was unreachable - email security@appseal.online to complete the deletion there."),
  deleteCancelled: "Deletion aborted. Dialog reset. /start for the menu.",
  reviewCta: "💬 Like it? Leave a review: appseal.online/reviews",
  myscansEmpty:
    "No domains yet. Send /watch myapp.com to follow one for free - or run a scan at appseal.online.",
  myscansHeader: "📄 <b>Your domains</b> (live grades):",
  myscansNoData: "no data yet",
  scanPrompt: "Send a domain - I will show its freshest grade from the registry (e.g. <code>myapp.vercel.app</code>).",
  scanNone: (host) =>
    `No scans for <code>${esc(host)}</code> in the registry yet.\n\nRun a free scan on the site - the grade will appear in the registry, on your site badge and here.`,
  planPrompt: (host, prices) =>
    `Domain accepted: <code>${esc(host)}</code>. Pick a plan - one-time purchase, no auto-renewals:\n\n` +
    `💜 <b>Launch Pass</b> - 7 days of unlimited scans - ${prices.launch}\n` +
    `🚀 <b>Pro Pass</b> - 30 days of unlimited scans on one domain - ${prices.pro}\n\n` +
    `Tap a button or send /plan_launch (or /plan_pro).`,
  payText: (host, days) =>
    days > 7
      ? `🚀 <b>Pro Pass (30 days)</b> for <code>${esc(host)}</code>.\n\nIt activates automatically right after payment (up to a couple of minutes) - check /status.`
      : `🔐 Pass for <code>${esc(host)}</code>.\n\nIt activates automatically right after payment (up to a couple of minutes) - check /status.`,
  payFail: (msg, retryCmd) => `Could not create the payment: ${esc(msg)}. Try /${retryCmd} again.`,
  btnPay: "💳 Pay $6 with card",
  btnPayPro: "💳 Pay $19 with card",
  btnPackPay: "💳 Pay pack $19 with card",
  btnPlanLaunch: "💜 Launch Pass - 7 days - $6",
  btnPlanPro: "🚀 Pro Pass - 30 days - $19",
  btnScanner: "🌐 Open the AppSeal scanner",
  btnLaunch: "🔐 Launch Pass - $6",
  btnPro: "🚀 Pro Pass - $19",
  btnPack: "📦 Agency Pack - 5 passes for $19",
  btnWatch: "🔭 Follow a domain",
  btnMyScans: "📄 My domains",
  btnCancel: "✖️ Cancel",
  btnCheckPay: "✅ Check payment",
  btnReport: "📋 Full report",
  scanCta: "Run a fresh scan: appseal.online",
};

const PACKS: Record<BotLang, LangPack> = { ru: RU, en: EN };

/** Strip protocol, path and www, lowercase - shared by every host input. */
function normalizeHost(raw: string): string {
  return raw
    .replace(/^https?:\/\//i, "")
    .replace(/\/.*$/, "")
    .replace(/^www\./i, "")
    .toLowerCase();
}

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
        const proLink = param.match(/^(ru|en)-pro$/i);
        if (proLink) {
          // Pro Pass deep link from the landing pricing card: straight into
          // the dialog with the plan preset, the domain question follows
          const deepLang: BotLang = proLink[1].toLowerCase() === "en" ? "en" : "ru";
          return {
            state: {
              stage: "await_host",
              provider: deepLang === "en" ? "lava" : "yk",
              mode: "single",
              plan: "pro",
            },
            intent: { action: "reply" },
            reply: PACKS[deepLang].step1,
            lang: deepLang,
          };
        }
        const lpLink = param.match(/^(ru|en)-lp$/i);
        if (lpLink) {
          // Launch Pass deep link from the landing pricing card: same shape
          // as -pro, the bot asks for the domain itself
          const deepLang: BotLang = lpLink[1].toLowerCase() === "en" ? "en" : "ru";
          return {
            state: {
              stage: "await_host",
              provider: deepLang === "en" ? "lava" : "yk",
              mode: "single",
              plan: "launch",
            },
            intent: { action: "reply" },
            reply: PACKS[deepLang].step1,
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
              reply: `🔐 Домен пропуска: <code>${esc(host)}</code>\n\n${deepPack.step2}`,
              lang: deepLang,
            };
          }
        }
        return { state: { stage: "idle" }, intent: { action: "reply" }, reply: pack.greeting, lang };
      }
      case "/help":
        // a pure explainer: never resets an open dialog
        return { state, intent: { action: "reply" }, reply: pack.help, lang };
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
      case "/plan_launch":
      case "/plan_pro": {
        // plan choice from the inline buttons (callback data arrives here as a
        // command). Inside an open plan-choice dialog it keeps the collected
        // host+provider; typed on its own it starts the dialog with the plan
        // preset so the domain step goes straight to the email afterwards.
        const plan: BotPlan = cmd === "/plan_pro" ? "pro" : "launch";
        if (state.stage === "await_plan" && state.host) {
          return {
            state: { ...state, stage: "await_email", plan },
            intent: { action: "reply" },
            reply: pack.step2,
            lang,
          };
        }
        return {
          state: { stage: "await_host", provider: lang === "en" ? "lava" : "yk", mode: "single", plan },
          intent: { action: "reply" },
          reply: pack.step1,
          lang,
        };
      }
      case "/myscans":
        return { state, intent: { action: "my_scans" }, reply: "", lang };
      case "/token":
        // the Pro entitlement check and the minting run in the webhook route
        // (Redis lookups + crypto) - the machine stays pure and the command
        // never resets an open dialog
        return { state, intent: { action: "issue_token" }, reply: "", lang };
      case "/buy5":
        // pack provider follows the language: RU -> YooKassa, EN -> Lava offer
        return {
          state: { stage: "await_email", provider: lang === "en" ? "lava" : "yk", mode: "pack" },
          intent: { action: "reply" },
          reply: pack.packStep2,
          lang,
        };
      case "/scan": {
        if (arg) {
          const host = normalizeHost(arg);
          if (!HOST_RE.test(host)) {
            return { state, intent: { action: "reply" }, reply: pack.hostBad, lang };
          }
          return { state, intent: { action: "scan", host }, reply: "", lang };
        }
        return {
          state: { ...state, stage: "await_scan_host" },
          intent: { action: "reply" },
          reply: pack.scanPrompt,
          lang,
        };
      }
      case "/redeem": {
        if (arg) {
          const host = normalizeHost(arg);
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
          const host = normalizeHost(arg);
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
      case "/delete":
        // two-step confirmation: the first call only arms the dialog; a
        // second /delete (state stage) hands the destructive intent to the
        // webhook route, everything else cancels out of it
        if (state.stage === "await_delete_confirm") {
          return { state: { stage: "idle" }, intent: { action: "delete_data" }, reply: "", lang };
        }
        return {
          state: { stage: "await_delete_confirm" },
          intent: { action: "reply" },
          reply: pack.deletePrompt,
          lang,
        };
      default:
        return { state, intent: { action: "reply" }, reply: pack.unknown, lang };
    }
  }

  // a bare domain typed into the chat = an instant free grade lookup: the
  // most common "just paste it" expectation, so honor it in idle
  if (state.stage === "idle" && !text.startsWith("/")) {
    if (EMAIL_RE.test(text)) {
      return { state, intent: { action: "reply" }, reply: pack.emailInIdle, lang };
    }
    const bareHost = normalizeHost(text);
    if (HOST_RE.test(bareHost)) {
      return { state, intent: { action: "scan", host: bareHost }, reply: "", lang };
    }
    return { state, intent: { action: "reply" }, reply: pack.unknown, lang };
  }

  if (state.stage === "await_host") {
    const host = normalizeHost(text);
    if (!HOST_RE.test(host)) {
      return { state, intent: { action: "reply" }, reply: pack.hostBad, lang };
    }
    if (state.mode === "single" && !state.plan) {
      // bot purchase dialog: after the domain comes the tariff menu -
      // Launch (7d) vs Pro (30d); prices follow the provider
      return {
        state: { ...state, stage: "await_plan", host },
        intent: { action: "reply" },
        reply: pack.planPrompt(host, state.provider === "lava" ? EN_PRICES : RU_PRICES),
        lang,
      };
    }
    return {
      state: { ...state, stage: "await_email", host },
      intent: { action: "reply" },
      reply: pack.step2,
      lang,
    };
  }

  if (state.stage === "await_plan") {
    // anything but a plan button/command re-shows the tariff menu
    return {
      state,
      intent: { action: "reply" },
      reply: pack.planPrompt(state.host ?? "", state.provider === "lava" ? EN_PRICES : RU_PRICES),
      lang,
    };
  }

  if (state.stage === "await_scan_host") {
    const host = normalizeHost(text);
    if (!HOST_RE.test(host)) {
      return { state, intent: { action: "reply" }, reply: pack.hostBad, lang };
    }
    return { state: { stage: "idle" }, intent: { action: "scan", host }, reply: "", lang };
  }

  if (state.stage === "await_redeem_host") {
    const host = normalizeHost(text);
    if (!HOST_RE.test(host)) {
      return { state, intent: { action: "reply" }, reply: pack.redeemBad, lang };
    }
    return { state, intent: { action: "redeem", host }, reply: "", lang };
  }

  if (state.stage === "await_watch_host") {
    const host = normalizeHost(text);
    if (!HOST_RE.test(host)) {
      return { state, intent: { action: "reply" }, reply: pack.hostBad, lang };
    }
    return { state: { stage: "idle" }, intent: { action: "watch", host }, reply: "", lang };
  }

  if (state.stage === "await_unwatch_pick") {
    // the numbered /unwatch pick: a digit selects one of the hosts
    // snapshotted into the state when the list was shown
    const list = state.hosts ?? [];
    const n = /^\d{1,2}$/.test(text) ? Number(text) : 0;
    if (n < 1 || n > list.length) {
      return { state, intent: { action: "reply" }, reply: pack.unwatchPick(list), lang };
    }
    return { state: { stage: "idle" }, intent: { action: "unwatch_pick", host: list[n - 1] }, reply: "", lang };
  }

  if (state.stage === "await_delete_confirm") {
    // in the armed state only a second /delete executes (handled above);
    // any other input backs out instead of silently waiting
    return { state: { stage: "idle" }, intent: { action: "reply" }, reply: pack.deleteCancelled, lang };
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
        plan: state.plan === "pro" ? "pro" : "launch",
      },
      reply: "",
      lang,
    };
  }

  return { state, intent: { action: "reply" }, reply: pack.unknown, lang };
}

/* texts the webhook route needs after the state machine (payment attempt,
 * status poll) - kept next to the machine so copy edits land in one file */

export function botPayText(lang: BotLang, host: string, days = 7): string {
  return PACKS[lang].payText(host, days);
}

/** Invoice button label. The price is plan-honest: Pro charges 1 490 ₽/$19,
 *  so the button must not show the Launch price. */
export function botPayBtn(lang: BotLang, provider: BotProvider, plan: BotPlan = "launch"): string {
  const pack = provider === "lava" ? EN : RU;
  return plan === "pro" ? pack.btnPayPro : pack.btnPay;
}

/** Tariff-menu text after the domain is accepted; prices follow the provider
 *  (yk = RUB, lava = USD), phrasing follows the language - same rule as the
 *  payment button. */
export function botPlanPrompt(lang: BotLang, host: string, provider: BotProvider): string {
  return PACKS[lang].planPrompt(host, provider === "lava" ? EN_PRICES : RU_PRICES);
}

/** Inline-button label for one of the two tariff buttons (Launch/Pro). */
export function botPlanBtn(provider: BotProvider, plan: BotPlan): string {
  const pack = provider === "lava" ? EN : RU;
  return plan === "pro" ? pack.btnPlanPro : pack.btnPlanLaunch;
}

/* ---------------------------- keyboards ------------------------------- */
/* Pure builders - the route passes them to Bot API untouched; tests assert
 * the layout (button text honesty: every label names the result of a tap). */

export function botIdleKeyboard(lang: BotLang): object {
  const p = PACKS[lang];
  return {
    inline_keyboard: [
      [{ text: p.btnScanner, url: BOT_SITE_URL }],
      [
        { text: p.btnLaunch, callback_data: "plan_launch" },
        { text: p.btnPro, callback_data: "plan_pro" },
      ],
      [{ text: p.btnPack, callback_data: "buy5" }],
      [
        { text: p.btnWatch, callback_data: "watch" },
        { text: p.btnMyScans, callback_data: "myscans" },
      ],
    ],
  };
}

export function botScannerKeyboard(lang: BotLang): object {
  const p = PACKS[lang];
  return {
    inline_keyboard: [
      [{ text: p.btnScanner, url: BOT_SITE_URL }],
      [
        { text: p.btnMyScans, callback_data: "myscans" },
        { text: p.btnWatch, callback_data: "watch" },
      ],
    ],
  };
}

/** Dialog steps get a one-tap escape hatch instead of a "type /cancel" hint. */
export function botCancelKeyboard(lang: BotLang): object {
  return { inline_keyboard: [[{ text: PACKS[lang].btnCancel, callback_data: "cancel" }]] };
}

export function botPlanKeyboard(provider: BotProvider, lang: BotLang = "ru"): object {
  return {
    inline_keyboard: [
      [{ text: botPlanBtn(provider, "launch"), callback_data: "plan_launch" }],
      [{ text: botPlanBtn(provider, "pro"), callback_data: "plan_pro" }],
      [{ text: PACKS[lang].btnCancel, callback_data: "cancel" }],
    ],
  };
}

/** Invoice message: the payment button plus a one-tap status poll, so the
 *  buyer does not have to type /status after paying. */
export function botInvoiceKeyboard(
  lang: BotLang,
  provider: BotProvider,
  url: string,
  kind: BotPlan | "pack" = "launch",
): object {
  const p = PACKS[lang];
  const payLabel =
    kind === "pack" ? botPackPayBtn(lang, provider) : botPayBtn(lang, provider, kind);
  return {
    inline_keyboard: [[{ text: payLabel, url }], [{ text: p.btnCheckPay, callback_data: "status" }]],
  };
}

/* ------------------------- /myscans + /scan text ----------------------- */

const MONTHS_SHORT_RU = ["янв.", "февр.", "мар.", "апр.", "мая", "июн.", "июл.", "авг.", "сен.", "окт.", "нояб.", "дек."];
const MONTHS_SHORT_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function shortDate(d: Date, lang: BotLang): string {
  return lang === "en"
    ? `${MONTHS_SHORT_EN[d.getUTCMonth()]} ${d.getUTCDate()}`
    : `${d.getUTCDate()} ${MONTHS_SHORT_RU[d.getUTCMonth()]}`;
}

function gradeLine(e: MyScanEntry, lang: BotLang): string {
  const badge = botGradeBadge(e.grade);
  const grade = e.grade
    ? [e.grade, typeof e.score === "number" ? String(e.score) : ""].filter(Boolean).join(" ")
    : "";
  const date = typeof e.ts === "number" && Number.isFinite(e.ts) ? new Date(e.ts) : null;
  const when = date && !Number.isNaN(date.getTime()) ? shortDate(date, lang) : "";
  return [badge, grade, when ? `(${when})` : ""].filter(Boolean).join(" ");
}

/** Compact /myscans answer: one line per domain with its live grade, e.g.
 *  "💜 A+ 97 · myapp.com (17 нояб.)" - the host links to the full report when
 *  the registry entry id is known. Pure - the route feeds it with the store
 *  lookups (or empty entries on failures), so tests need no Redis. */
export function buildMyScansText(entries: MyScanEntry[], lang: BotLang): string {
  const pack = PACKS[lang];
  if (entries.length === 0) return pack.myscansEmpty;
  const lines = entries.map((e) => {
    const host = e.id
      ? `<a href="${BOT_SITE_URL}/report/${e.id}">${esc(e.host)}</a>`
      : `<code>${esc(e.host)}</code>`;
    return `${host} - ${e.grade ? gradeLine(e, lang) : pack.myscansNoData}`;
  });
  return `${pack.myscansHeader}\n${lines.join("\n")}`;
}

/** /scan answer for one domain: the freshest registry grade with a link to
 *  the report, or an honest "not scanned yet" pointing at the free scan.
 *  A successful (graded) answer ends with the review nudge - the moment of
 *  delight is the moment to ask. */
export function botScanText(lang: BotLang, entry: MyScanEntry | null): string {
  const pack = PACKS[lang];
  const host = entry?.host ?? "";
  if (!entry?.grade) {
    return entry ? pack.scanNone(host) : pack.hostBad;
  }
  const head = `${gradeLine(entry, lang)} - <code>${esc(host)}</code>`;
  const desc = entry.desc ? `\n<i>${esc(entry.desc)}</i>` : "";
  const reportLink = entry.id
    ? `<a href="${BOT_SITE_URL}/report/${entry.id}">${pack.btnReport}</a>`
    : `<a href="${BOT_SITE_URL}">${pack.btnScanner}</a>`;
  return `${head}${desc}\n\n${reportLink} · ${pack.scanCta}\n${pack.reviewCta}`;
}

export function botPackPayText(lang: BotLang): string {
  return PACKS[lang].packPayText;
}

export function botRedeemNoPack(lang: BotLang): string {
  return PACKS[lang].redeemNoPack;
}

/** Confirmation after the webhook stored the watch; current grade optional.
 *  slots ("2/3") appends the free-list occupancy when the route knows it. */
export function botWatchDone(lang: BotLang, host: string, currentGrade?: string, slots?: string): string {
  const known = currentGrade
    ? lang === "en"
      ? `Current standing: grade ${currentGrade} ${botGradeBadge(currentGrade)}.`
      : `Текущий статус: класс ${currentGrade} ${botGradeBadge(currentGrade)}.`
    : lang === "en"
      ? "Not scanned yet - the first check will set the baseline."
      : "Пока не проверен - первая проверка станет стартовой точкой.";
  const slot = slots ? (lang === "en" ? ` (slot ${esc(slots)})` : ` (слот ${esc(slots)})`) : "";
  return lang === "en"
    ? `Now following <code>${esc(host)}</code>${slot}. ${known}\nI will message you when its grade changes (free re-scan: once a day). Add another (up to 3): /watch other.com - stop: /unwatch`
    : `Следим за <code>${esc(host)}</code>${slot}. ${known}\nНапишу, когда класс изменится (бесплатная перепроверка - раз в сутки). Добавить ещё (до 3): /watch other.com - убрать: /unwatch`;
}

/** Per-chat free watch cap: the list is full (3/3), something must go first. */
export function botWatchChatFull(lang: BotLang, max: number): string {
  return lang === "en"
    ? `Free watch is capped at ${max} domains per chat - remove one with /unwatch first.`
    : `Максимум ${max} домена на чат - удалите один через /unwatch`;
}

/** Numbered /unwatch pick (2-3 hosts): the chat replies with a digit and the
 *  machine resolves it via the await_unwatch_pick stage. */
export function botUnwatchPickText(lang: BotLang, hosts: string[]): string {
  return PACKS[lang].unwatchPick(hosts);
}

/** Confirmation after one host was removed from a multi-host watchlist -
 *  the remaining ones keep being followed. */
export function botUnwatchPicked(lang: BotLang, host: string, remaining: string[]): string {
  const rest = remaining.map((h) => `<code>${esc(h)}</code>`).join(", ");
  return lang === "en"
    ? `Stopped following <code>${esc(host)}</code>.${rest ? ` Still following: ${rest}.` : ""} Add more: /watch myapp.com`
    : `Убрал <code>${esc(host)}</code> из наблюдения.${rest ? ` Ещё наблюдаю: ${rest}.` : ""} Добавить: /watch myapp.com`;
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
      ? `✅ Pass activated for <code>${esc(host || "?")}</code> until ${until ? until.slice(0, 10) : "?"} (7 days). Next domain: /redeem myapp.com`
      : `✅ Пропуск активирован для <code>${esc(host || "?")}</code> до ${until ? until.slice(0, 10) : "?"} (7 дней). Следующий домен: /redeem myapp.com`;
  }
  return PACKS[lang].redeemEmpty;
}

/** "N days left" from an ISO-ish date string; 0 stays honest, unparseable
 *  input drops the parenthetical. */
function daysLeft(until?: string): { n: number; ok: boolean } {
  if (!until) return { n: 0, ok: false };
  const t = Date.parse(until);
  if (Number.isNaN(t)) return { n: 0, ok: false };
  const n = Math.max(0, Math.ceil((t - Date.now()) / 86_400_000));
  return { n, ok: true };
}

export function botStatusText(
  lang: BotLang,
  kind: "done" | "pending" | "fail",
  host?: string,
  until?: string,
  status?: string,
): string {
  if (kind === "done") {
    const d = daysLeft(until);
    const left = d.ok
      ? lang === "en"
        ? `, ${d.n} day${d.n === 1 ? "" : "s"} left`
        : `, осталось ${d.n} дн.`
      : "";
    return lang === "en"
      ? `✅ Pass active for <code>${esc(host || "?")}</code> until ${until ? until.slice(0, 10) : "?"}${left}. Unlimited scans: https://appseal.online`
      : `✅ Пропуск активен для <code>${esc(host || "?")}</code> до ${until ? until.slice(0, 10) : "?"}${left}. Сканы без лимита: https://appseal.online`;
  }
  if (kind === "pending") {
    return lang === "en"
      ? `Payment has not gone through yet (status: <code>${esc(status ?? "?")}</code>). Press /status again after paying.`
      : `Оплата ещё не прошла (статус: <code>${esc(status ?? "?")}</code>). После оплаты нажми /status ещё раз.`;
  }
  return lang === "en"
    ? "Could not check the status - try again later."
    : "Не удалось проверить статус - попробуй позже.";
}

/* ------------------------------ /token texts --------------------------- */

/** /token success: the raw token is shown exactly once (only its sha256 hash
 *  is stored), so this message is the single copy the buyer ever sees. */
export function botDeleteDone(lang: BotLang, dbOk: boolean): string {
  return PACKS[lang].deleteDone(dbOk);
}

export function botTokenText(lang: BotLang, token: string, expiresAt: string): string {
  const until = expiresAt.slice(0, 10);
  return lang === "en"
    ? `🔑 API token created:\n<code>${esc(token)}</code>\nValid until ${until}. Shown once - only its hash is stored.\nEmbedding: appseal.online/api - an Authorization: Bearer header lifts the daily limit of /api/scan.`
    : `🔑 API-токен создан:\n<code>${esc(token)}</code>\nДействует до ${until}. Показан один раз - хранится только хеш.\nВстраивание: appseal.online/api - заголовок Authorization: Bearer снимает дневной лимит /api/scan.`;
}

/** /token without an active 30-day pass: honest pointing at the Pro tariff. */
export function botTokenNoPro(lang: BotLang): string {
  return PACKS[lang].tokenNoPro;
}

/** Minting failed (Redis + the durable mirror both unavailable). */
export function botTokenFail(lang: BotLang): string {
  return PACKS[lang].tokenFail;
}
