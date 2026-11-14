import type { Lang } from "./scanner/types";

export const DICT = {
  brand: { ru: "AppSeal", en: "AppSeal" },
  tagline: {
    ru: "Печать доверия для приложений, собранных с ИИ",
    en: "The trust seal for AI-built apps",
  },
  heroTitle: {
    ru: "Собрал приложение за вечер?",
    en: "Built an app in an evening?",
  },
  heroTitleAccent: {
    ru: "Проверь его за минуту.",
    en: "Check it in a minute.",
  },
  heroSub: {
    ru: "ИИ-сборка создала миллионы приложений, которые никто не проверял. AppSeal сканирует ваш живой сайт на утечки секретов, открытые базы, дырявые админки и признаки заброшенности - и выдаёт оценку A+-E с бейджем для сайта.",
    en: "AI builders created millions of apps nobody ever checked. AppSeal scans your live site for leaked secrets, open databases, exposed admin panels and signs of abandonment - and issues an A+-E grade with a badge for your site.",
  },
  demoChipsTitle: {
    ru: "Быстрый демо-скан в 1 клик:",
    en: "One-click demo scan:",
  },
  showcaseHint: {
    ru: "Что означает каждый ранг",
    en: "What each rank means",
  },
  inputPlaceholder: {
    ru: "ваше-приложение.com",
    en: "your-app.com",
  },
  scanBtn: { ru: "Проверить бесплатно", en: "Scan for free" },
  demoBtn: { ru: "Скан демо-приложения", en: "Scan the demo app" },
  scanning: { ru: "Идёт техосмотр", en: "Inspection in progress" },
  errTitle: { ru: "Не получилось", en: "Something went wrong" },
  rescan: { ru: "Проверить другое приложение", en: "Scan another app" },
  downloadPdf: { ru: "Скачать PDF-отчёт", en: "Download PDF report" },
  fixPromptTitle: { ru: "Промпт для ИИ-фикса", en: "AI-fix prompt" },
  fixPromptCopy: {
    ru: "Готовый промпт со всеми находками, доказательствами и сниппетами конфигов. Отдай его своему ИИ-агенту в той же сессии вайб-кодинга - и перезапусти скан.",
    en: "A ready prompt with every finding, the evidence and config snippets. Hand it to your AI agent in the same vibe-coding session - then re-scan.",
  },
  fixPromptBtn: { ru: "Промпт для ИИ-агента", en: "Prompt for AI agent" },
  badgeTitle: { ru: "Бейдж доверия для вашего сайта", en: "Trust badge for your site" },
  badgeCopy: { ru: "Вставьте этот код на свой сайт, чтобы значок красовался на проверенном проекте:", en: "Embed this code on your site to proudly display your trust badge:" },
  badgeTrophyTab: { ru: "3D Трофей", en: "3D Trophy" },
  badgeShieldTab: { ru: "Компактный щит (SVG)", en: "Compact shield (SVG)" },
  copyBtn: { ru: "Копировать", en: "Copy" },
  copied: { ru: "Скопировано!", en: "Copied!" },
  summaryChecks: { ru: "пунктов проверено", en: "checks completed" },
  summaryFailed: { ru: "провалено", en: "failed" },
  summaryWarns: { ru: "с замечаниями", en: "warnings" },
  summaryPassed: { ru: "в порядке", en: "passed" },
  platform: { ru: "платформа", en: "platform" },
  evidence: { ru: "Доказательства", en: "Evidence" },
  demoNote: {
    ru: "Демо-скан: намеренно дырявое приложение, чтобы показать все проверки в действии.",
    en: "Demo scan: a deliberately vulnerable app showing every check firing.",
  },
  statsTitle: { ru: "Проблема уже здесь", en: "The problem is already here" },
  stat1: {
    ru: "AI-собранных приложений прошли наш внешний техосмотр",
    en: "AI-built apps went through our external inspection",
  },
  stat2: {
    ru: "из них не получают класс A - и это уже живые продакшены",
    en: "of them score below grade A - and they are already live in production",
  },
  stat3: {
    ru: "не настраивают CSP - базовый заголовок-щит от XSS",
    en: "ship without CSP - the basic XSS-shield header",
  },
  statsSource: {
    ru: "Цифры: наш массовый техосмотр от {date}, приложения из Show HN и GitHub. Полная статистика",
    en: "Source: our mass inspection of {date}, apps from Show HN and GitHub. Full statistics",
  },
  passGateTitle: { ru: "Бейдж и PDF - часть Launch Pass", en: "Badge and PDF are part of Launch Pass" },
  passGateText: {
    ru: "Пропуск на домен {host} открывает: скачиваемый PDF-отчёт, embed-бейдж доверия для вашего сайта и безлимит сканов на 7 дней. Fix-prompt остаётся бесплатным.",
    en: "A pass for {host} unlocks the downloadable PDF report, the embeddable trust badge for your site, and unlimited scans for 7 days. The fix prompt stays free.",
  },
  passGateCta: { ru: "Смотреть Launch Pass", en: "See Launch Pass" },
  passGatePdf: { ru: "PDF - в Launch Pass", en: "PDF - Launch Pass" },
  howTitle: { ru: "Как это работает", en: "How it works" },
  caseTitle: { ru: "Первый кейс: сайт аквацентра", en: "First case: an aqua center website" },
  caseSub: {
    ru: "Реальный домен, реальный деплой, реальный ИИ-агент · ноябрь 2026",
    en: "A real domain, a real deploy, a real AI agent · November 2026",
  },
  caseStep1t: { ru: "Первичный аудит", en: "Initial audit" },
  caseStep1n: { ru: "A · 86", en: "A · 86" },
  caseStep1d: {
    ru: "3 замечания: X-Frame-Options, CORS «для всех», пустой title",
    en: "3 findings: X-Frame-Options, wildcard CORS, empty title",
  },
  caseStep2t: { ru: "Промпт агенту", en: "Prompt to the agent" },
  caseStep2n: { ru: "7 мин", en: "7 min" },
  caseStep2d: {
    ru: "агент закрыл два пункта одним конфиг-коммитом",
    en: "the agent fixed two findings with one config commit",
  },
  caseStep3t: { ru: "Повторный скан", en: "Re-scan" },
  caseStep3n: { ru: "A · 97", en: "A · 97" },
  caseStep3d: {
    ru: "заголовки на месте, CORS явный",
    en: "headers in place, CORS explicit",
  },
  caseBody: {
    ru: "Сайт семейного аквацентра собран с ИИ и живёт на Vercel. Внешний скан без доступа к коду нашёл типовые дыры деплоя. Кнопка «Промпт для ИИ-агента» скопировала отчёт, агент той же сессии внёс правки, повторный скан подтвердил результат.",
    en: "A family aqua center site built with AI, hosted on Vercel. The external black-box scan found typical deploy holes. The built-in 'prompt for your AI agent' button copied the report, an agent applied the fixes, and the re-scan confirmed the result.",
  },
  caseQuote: {
    ru: "Ни строчки бизнес-кода не переписано - только конфигурация деплоя.",
    en: "Not a single line of business code rewritten - deploy configuration only.",
  },
  how1Title: { ru: "Вводите адрес", en: "Enter the URL" },
  how1Text: {
    ru: "Только живой адрес приложения. Ничего не нужно устанавливать, доступ к коду не нужен - скан внешний.",
    en: "Just the live URL. Nothing to install, no code access needed - the scan is external.",
  },
  how2Title: { ru: "Движок гоняет 121 проверку", en: "The engine runs 121 checks" },
  how2Text: {
    ru: "Секреты и ключи в клиентском коде, открытые .env/.git, дырявые правила Firebase и Supabase, CORS, админки четырёх CMS, бэкапы и дампы, отладочные эндпоинты, source maps, заголовки, TLS, куки, ошибки СУБД в разметке, битые ссылки, заглушки - плюс ИИ-доверие: llms.txt, SPF/DMARC, трекеры без политики приватности.",
    en: "Secrets and keys in client code, open .env/.git, misconfigured Firebase and Supabase rules, CORS, admin panels of four CMSes, backups and dumps, debug endpoints, source maps, headers, TLS, cookies, DB errors in markup, broken links, placeholders - plus AI trust: llms.txt, SPF/DMARC, trackers without a privacy policy.",
  },
  how3Title: { ru: "Получаете оценку и план", en: "Get a grade and a plan" },
  how3Text: {
    ru: "Оценка A+-E, объяснение каждой проблемы человеческим языком, доказательства и 3D-бейдж, который показывает пользователям, что приложению можно доверять.",
    en: "An A+-E grade, every issue explained in plain language, evidence attached, and a 3D badge telling users your app can be trusted.",
  },
  checksTitle: { ru: "Что проверяем", en: "What we check" },
  checksSub: {
    ru: "Пять категорий, от которых реально болит голова у вайб-кодеров. Четыре из них есть у всех, пятая - только у нас.",
    en: "Five categories that actually hurt vibe coders. Four of them everyone has, the fifth is ours alone.",
  },
  pricingTitle: { ru: "Тарифы", en: "Pricing" },
  planFreeCta: { ru: "Проверить сайт бесплатно", en: "Scan your site free" },
  planSoonCta: { ru: "Скоро", en: "Coming soon" },
  planMostPopular: { ru: "Хит перед релизом", en: "Most popular" },
  planLPSub: {
    ru: "разовая покупка на 7 дней - без автосписаний",
    en: "one-time purchase for 7 days - no auto-renewal",
  },
  planPlatformCta: { ru: "Обсудить интеграцию", en: "Discuss integration" },
  platformRowText: {
    ru: "API для платформ-конструкторов, white-label бейджи и массовый скан каталога приложений - по договорённости.",
    en: "API for app builders, white-label badges and bulk catalog scans - by agreement.",
  },
  telegramCta: { ru: "Обсудить в Telegram", en: "Discuss on Telegram" },
  headerCta: { ru: "Проверить сайт", en: "Scan site" },
  pricingSub: {
    ru: "Начните бесплатно. Платите, когда приложение начнёт зарабатывать.",
    en: "Start free. Pay when your app starts earning.",
  },
  planFree: { ru: "Free", en: "Free" },
  planFreePrice: { ru: "0 ₽", en: "$0" },
  planFreeFeats: {
    ru: "1 полный скан в день|Оценка A+-E и отчёт|3D-бейдж для сайта|PDF-экспорт",
    en: "1 full scan per day|A+-E grade and report|3D site badge|PDF export",
  },
  planPro: { ru: "Pro", en: "Pro" },
  planProPrice: { ru: "$19/мес", en: "$19/mo" },
  planProFeats: {
    ru: "Безлимит сканов|Недельный мониторинг изменений|Автопроверка после каждого релиза|Бейдж со свежей датой|Приоритетные проверки",
    en: "Unlimited scans|Weekly change monitoring|Post-release auto rescan|Badge with fresh date|Priority queue",
  },
  planPlatform: { ru: "Platform", en: "Platform" },
  planPlatformPrice: { ru: "Индивидуально", en: "Custom" },
  planPlatformFeats: {
    ru: "API для платформ-конструкторов|White-label бейджи|Массовый скан каталога приложений|SLA и партнёрская интеграция",
    en: "API for app builders|White-label badges|Bulk catalog scans|SLA and partner integration",
  },
  planLP: { ru: "Launch Pass", en: "Launch Pass" },
  planLPPrice: { ru: "490 ₽", en: "$6" },
  planLPFeats: {
    ru: "Неделя безлимитных проверок одного домена|Повторный скан сразу после фикса|Помогает довести домен до класса A|Промпт для ИИ-агента и PDF-отчёт",
    en: "A week of unlimited checks of one domain|Re-scan right after each fix|Helps bring your domain to grade A|AI-agent prompt and PDF report",
  },
  planLPCta: { ru: "Разблокировать домен за 490 ₽", en: "Unlock your domain for $6" },
  lpDomainPh: { ru: "домен пропуска, например myapp.vercel.app", en: "pass domain, e.g. myapp.vercel.app" },
  lpPay: { ru: "Оплатить", en: "Pay" },
  lpNote: {
    ru: "Оплата картой или СБП через ЮKassa. Email нужен только для чека - он уходит напрямую в ЮKassa и у нас не хранится.",
    en: "Card or SBP payment via YooKassa. The email is only needed for the receipt - it goes straight to YooKassa and is never stored on our side.",
  },
  lpErr: { ru: "Не удалось создать платёж: ", en: "Could not create the payment: " },
  lpDomainBad: { ru: "Укажите домен в формате myapp.com", en: "Enter a domain like myapp.com" },
  lpEmailBad: { ru: "Укажите корректный email", en: "Enter a valid email" },
  lpEmailPh: { ru: "email для чека", en: "email for the receipt" },
  quotaTitle: {
    ru: "Бесплатный скан на сегодня уже использован",
    en: "The free scan for today is already used",
  },
  quotaText: {
    ru: "На Free - 1 скан в день с одного адреса. Launch Pass снимает лимит на один домен на неделю.",
    en: "Free tier is 1 scan per day per address. A Launch Pass removes the limit for one domain for a week.",
  },
  quotaCta: { ru: "Посмотреть Launch Pass", en: "See the Launch Pass" },
  paidOk: { ru: "Launch Pass активен:", en: "Launch Pass is active:" },
  paidUntil: { ru: "до", en: "until" },
  paidPending: {
    ru: "Платёж ещё не подтверждён - обновите страницу через минуту.",
    en: "The payment is not confirmed yet - refresh this page in a minute.",
  },
  faqTitle: { ru: "Частые вопросы", en: "FAQ" },
  issue2Title: { ru: "Публичный реестр проверенных приложений", en: "Public registry of verified apps" },
  issue2Sub: {
    ru: "Каждый класс A попадает в открытый реестр с индексируемой ссылкой на проект - бесплатный SEO-трафик и подтверждение доверия для пользователей. Готовим по нему отчёт «State of Vibe-Coded App Security».",
    en: "Every grade A lands in the open registry with an indexable link to your project - free SEO traffic and a visible trust proof. We also use it for the \"State of Vibe-Coded App Security\" report.",
  },
  issue2CtaScan: { ru: "Пришли свой URL - просканировать", en: "Bring your URL - scan it" },
  issue2CtaRegistry: { ru: "Смотреть реестр", en: "Browse the registry" },
  navRegistry: { ru: "Реестр", en: "Registry" },
  navStats: { ru: "Статистика", en: "Stats" },
  navPricing: { ru: "Тарифы", en: "Pricing" },
  navLegal: { ru: "Правила", en: "Legal" },
  faq1Q: { ru: "Это безопасно? Вы не взламываете сайт?", en: "Is this safe? Are you hacking my site?" },
  faq1A: {
    ru: "Нет. Скан идёт только по публично доступным страницам - ровно то, что видит любой посетитель: заголовки ответов, HTML, общедоступные файлы и DNS-записи. Никаких эксплойтов, никакой нагрузки сверх ~130 лёгких запросов за 20-40 секунд.",
    en: "No. The scan only touches publicly accessible pages - exactly what any visitor sees: response headers, HTML, public files, DNS records. No exploits, no load beyond ~130 lightweight requests over 20-40 seconds.",
  },
  faq2Q: { ru: "Зачем приложению бейдж?", en: "Why does my app need a badge?" },
  faq2A: {
    ru: "Пользователи не отличают хорошее приложение от дырявого. Оценка A+-E - короткий сигнал доверия, как значок SSL-замка: конверсия растёт, а вам не нужно объяснять словами, что вы следите за безопасностью.",
    en: "Users can't tell a well-built app from a leaky one. An A+-E grade is a short trust signal, like the SSL padlock: conversion grows and you don't have to explain in words that you care about security.",
  },
  faq3Q: { ru: "Что делать, если оценка низкая (D или E)?", en: "What if my grade is low (D or E)?" },
  faq3A: {
    ru: "Каждый проваленный пункт содержит объяснение и доказательства - большинство закрывается за вечер: убрать секреты из клиента, закрыть .env, поправить правила Firebase. Отчёт можно отдать ИИ-агенту и починить силами той же вайб-кодинг-сессии.",
    en: "Every failed check explains the issue and shows evidence - most fixes take an evening: remove secrets from the client, lock .env, tighten Firebase rules. Hand the report to an AI agent and fix it in the same vibe-coding session.",
  },
  faq4Q: { ru: "Вы храните результаты сканов?", en: "Do you store scan results?" },
  faq4A: {
    ru: "Отчёт доступен по ссылке и не содержит самих секретов - только факты находок и маскированные фрагменты. Полные ключи мы никогда не сохраняем и не показываем даже вам.",
    en: "The report is available via a link and contains no raw secrets - only findings and masked fragments. Full key values are never stored or shown, even to you.",
  },
  faq5Q: { ru: "Сколько длится скан?", en: "How long does a scan take?" },
  faq5A: {
    ru: "Обычно 20-40 секунд: около 100 лёгких GET-запросов к публичным страницам. Нагрузка сопоставима с одним активным посетителем - ничего не ломаем и не кладём.",
    en: "Usually 20-40 seconds: about 100 lightweight GET requests to public pages. The load is comparable to one active visitor - nothing breaks, nothing goes down.",
  },
  faq6Q: { ru: "А если приложение - SPA и рендерится в браузере?", en: "What if my app is an SPA rendered in the browser?" },
  faq6A: {
    ru: "Работаем и с такими: движок открывает страницу в headless-браузере, дожидается отрисовки и сканирует уже собранную разметку. Если что-то нельзя проверить без исходников, в отчёте будет честная пометка о пропуске.",
    en: "We handle those too: the engine opens the page in a headless browser, waits for the render and scans the assembled markup. Anything untestable without sources gets an honest skip note in the report.",
  },
  faq7Q: { ru: "Как попасть в публичный реестр?", en: "How do I get into the public registry?" },
  faq7A: {
    ru: "Автоматически: любой скан с классом A или A+ попадает в открытый реестр с индексируемой (dofollow) ссылкой на ваш домен - бесплатный SEO-сигнал доверия. Результаты ниже A остаются приватными.",
    en: "Automatically: any scan graded A or A+ lands in the open registry with an indexable (dofollow) link to your domain - a free SEO trust signal. Results below A stay private.",
  },
  faq8Q: { ru: "Какие данные вы собираете?", en: "What data do you collect?" },
  faq8A: {
    ru: "Минимум. Мы не собираем email и не храним персональные данные: в системе остаются только домен пропуска и соль-хеш IP для лимита. Полный отчёт видит только инициатор скана по секретной ссылке; в реестр попадают лишь домен, класс и дата.",
    en: "Bare minimum. We collect no email and store no personal data: only the pass domain and a salted IP hash for the quota live in our system. The full report is visible only to the scan initiator via a secret link; the registry shows just the domain, grade and date.",
  },
  bootStage1: { ru: "Подмешиваем сигнатуры утечек...", en: "Loading leak signatures..." },
  bootStage2: { ru: "Проверяем заголовки безопасности...", en: "Checking security headers..." },
  bootStage3: { ru: "Калибруем шкалу оценок...", en: "Calibrating the grade scale..." },
  footerText: {
    ru: "AppSeal - независимый слой доверия для эпохи, когда софт пишут все.",
    en: "AppSeal - an independent trust layer for the era when everyone writes software.",
  },
  footerEngine: {
    ru: "AppSeal Engine v1.0 · External Black-Box Security Scanner",
    en: "AppSeal Engine v1.0 · External Black-Box Security Scanner",
  },
  footerStatus: { ru: "All systems operational", en: "All systems operational" },
  footerBadgeNote: {
    ru: "Наш собственный сайт проверен AppSeal - нажмите на бейдж, чтобы подтвердить подлинность",
    en: "Our own site verified by AppSeal - click the badge to verify its authenticity",
  },
  gradeTitle: { ru: "Оценка техосмотра", en: "Trust grade" },
  findingsTitle: { ru: "Находки по категориям", en: "Findings by category" },
  allGood: {
    ru: "Критичных проблем не найдено. Но один скан - не навсегда: приложение меняется, и проверки стоит повторять после каждого релиза.",
    en: "No critical issues found. But one scan is not forever: apps change, and checks should be repeated after every release.",
  },
  caseReportLink: {
    ru: "Подтвердить подлинность этого скана →",
    en: "Verify the authenticity of this scan →",
  },
  casePrompt: {
    ru: "Ты ИИ-агент, дорабатывающий веб-приложение. Сайт: akulenok-tmz.ru.\nНезависимый сканер AppSeal поставил оценку A (86/100). Ниже - все найденные проблемы.\n\n## Проблемы (3)\n### 1. X-Frame-Options отсутствует [warn, medium]\n### 2. CORS «для всех» [warn, high]\n### 3. Пустой title [warn, low]",
    en: "You are an AI agent improving a web application. Site: akulenok-tmz.ru.\nThe independent AppSeal scanner graded it A (86/100). All findings follow.\n\n## Findings (3)\n### 1. X-Frame-Options missing [warn, medium]\n### 2. Wildcard CORS [warn, high]\n### 3. Empty title [warn, low]",
  },
} as const;

export type DictKey = keyof typeof DICT;

export function t(lang: Lang, key: DictKey): string {
  return DICT[key][lang];
}

export function list(lang: Lang, key: DictKey): string[] {
  const v = DICT[key][lang];
  return v.split("|");
}

/** Localized category/check helpers live in components */
