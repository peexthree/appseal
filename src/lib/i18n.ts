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
    ru: "ИИ-сборка создала миллионы приложений, которые никто не проверял. AppSeal сканирует ваш живой сайт на утечки секретов, открытые базы, дырявые админки и признаки заброшенности — и выдаёт оценку A+–E с бейджем для сайта.",
    en: "AI builders created millions of apps nobody ever checked. AppSeal scans your live site for leaked secrets, open databases, exposed admin panels and signs of abandonment — and issues an A+–E grade with a badge for your site.",
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
    ru: "сгенерированного ИИ кода не проходит проверку безопасности (Veracode, 2026)",
    en: "of AI-generated code fails security testing (Veracode, 2026)",
  },
  stat2: {
    ru: "просканированных вайб-кодед приложений сливают чувствительные данные",
    en: "of scanned vibe-coded apps expose sensitive data",
  },
  stat3: {
    ru: "новых приложений вышло в сторах за первое полугодие 2026",
    en: "new apps hit the stores in H1 2026 alone",
  },
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
    ru: "Только живой адрес приложения. Ничего не нужно устанавливать, доступ к коду не нужен — скан внешний.",
    en: "Just the live URL. Nothing to install, no code access needed — the scan is external.",
  },
  how2Title: { ru: "Движок гоняет 16 проверок", en: "The engine runs 16 checks" },
  how2Text: {
    ru: "Секреты в клиентском коде, открытые .env и .git, дырявые правила Firebase, CORS, админки, бэкапы, заголовки, TLS, битые ссылки и заглушки.",
    en: "Secrets in client code, open .env and .git, misconfigured Firebase rules, CORS, admin panels, backups, headers, TLS, broken links and placeholders.",
  },
  how3Title: { ru: "Получаете оценку и план", en: "Get a grade and a plan" },
  how3Text: {
    ru: "Оценка A+–E, объяснение каждой проблемы человеческим языком, доказательства и 3D-бейдж, который показывает пользователям, что приложению можно доверять.",
    en: "An A+–E grade, every issue explained in plain language, evidence attached, and a 3D badge telling users your app can be trusted.",
  },
  checksTitle: { ru: "Что проверяем", en: "What we check" },
  checksSub: {
    ru: "Четыре категории, от которых реально болит голова у вайб-кодеров.",
    en: "Four categories that actually hurt vibe coders.",
  },
  pricingTitle: { ru: "Тарифы", en: "Pricing" },
  planFreeCta: { ru: "Проверить бесплатно", en: "Scan for free" },
  planSoonCta: { ru: "Скоро", en: "Coming soon" },
  pricingSub: {
    ru: "Начните бесплатно. Платите, когда приложение начнёт зарабатывать.",
    en: "Start free. Pay when your app starts earning.",
  },
  planFree: { ru: "Free", en: "Free" },
  planFreePrice: { ru: "$0", en: "$0" },
  planFreeFeats: {
    ru: "1 полный скан в день|Оценка A+–E и отчёт|3D-бейдж для сайта|PDF-экспорт",
    en: "1 full scan per day|A+–E grade and report|3D site badge|PDF export",
  },
  planPro: { ru: "Pro", en: "Pro" },
  planProPrice: { ru: "$19/мес", en: "$19/mo" },
  planProFeats: {
    ru: "Безлимит сканов|Недельный мониторинг изменений|Автопроверка после каждого релиза|Бейдж со свежей датой|Приоритетные проверки",
    en: "Unlimited scans|Weekly change monitoring|Post-release auto rescan|Badge with fresh date|Priority queue",
  },
  planPlatform: { ru: "Platform", en: "Platform" },
  planPlatformPrice: { ru: "по договорённости", en: "custom" },
  planPlatformFeats: {
    ru: "API для платформ-конструкторов|White-label бейджи|Массовый скан каталога приложений|SLA и партнёрская интеграция",
    en: "API for app builders|White-label badges|Bulk catalog scans|SLA and partner integration",
  },
  planLP: { ru: "Launch Pass", en: "Launch Pass" },
  planLPPrice: { ru: "490 ₽", en: "490 ₽" },
  planLPFeats: {
    ru: "Неделя безлимитных проверок одного домена|Повторный скан сразу после фикса|Помогает довести домен до класса A|Промпт для ИИ-агента и PDF-отчёт",
    en: "A week of unlimited checks of one domain|Re-scan right after each fix|Helps bring your domain to grade A|AI-agent prompt and PDF report",
  },
  planLPCta: { ru: "Купить за 490 ₽", en: "Buy for 490 ₽" },
  lpDomainPh: { ru: "домен пропуска, например myapp.vercel.app", en: "pass domain, e.g. myapp.vercel.app" },
  lpEmailPh: { ru: "email для чека и доступа", en: "email for the receipt and access" },
  lpPay: { ru: "Оплатить", en: "Pay" },
  lpNote: {
    ru: "Оплата картой через ЮKassa. Чек придёт на email автоматически (НПД).",
    en: "Card payment via YooKassa. The receipt arrives by email automatically.",
  },
  lpErr: { ru: "Не удалось создать платёж: ", en: "Could not create the payment: " },
  lpDomainBad: { ru: "Укажите домен в формате myapp.com", en: "Enter a domain like myapp.com" },
  lpEmailBad: { ru: "Укажите корректный email", en: "Enter a valid email" },
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
  issue2Title: { ru: "Выпуск №2: соберём датасет вместе", en: "Issue #2: let's build the dataset together" },
  issue2Sub: {
    ru: "Готовим «State of Vibe-Coded App Security» - отчёт по реальным vibe-приложениям. Просканируйте свой проект бесплатно: оценка попадёт в анонимную статистику, а класс A открывает индексируемую ссылку из публичного реестра.",
    en: "We're preparing \"State of Vibe-Coded App Security\" - a report based on real vibe-built apps. Scan yours for free: the grade feeds the anonymized stats, and an A grade unlocks an indexable link from the public registry.",
  },
  issue2CtaScan: { ru: "Пришли свой URL - просканировать", en: "Bring your URL - scan it" },
  issue2CtaRegistry: { ru: "Смотреть реестр", en: "Browse the registry" },
  faq1Q: { ru: "Это безопасно? Вы не взламываете сайт?", en: "Is this safe? Are you hacking my site?" },
  faq1A: {
    ru: "Нет. Скан идёт только по публично доступным страницам — ровно то, что видит любой посетитель: заголовки ответов, HTML, общедоступные файлы. Никаких эксплойтов, никакой нагрузки сверх нескольких десятков запросов.",
    en: "No. The scan only touches publicly accessible pages — exactly what any visitor sees: response headers, HTML, public files. No exploits, no load beyond a few dozen requests.",
  },
  faq2Q: { ru: "Зачем приложению бейдж?", en: "Why does my app need a badge?" },
  faq2A: {
    ru: "Пользователи не отличают хорошее приложение от дырявого. Оценка A+–E — короткий сигнал доверия, как значок SSL-замка: конверсия растёт, а вам не нужно объяснять словами, что вы следите за безопасностью.",
    en: "Users can't tell a well-built app from a leaky one. An A+–E grade is a short trust signal, like the SSL padlock: conversion grows and you don't have to explain in words that you care about security.",
  },
  faq3Q: { ru: "Что делать, если оценка низкая (D или E)?", en: "What if my grade is low (D or E)?" },
  faq3A: {
    ru: "Каждый проваленный пункт содержит объяснение и доказательства — большинство закрывается за вечер: убрать секреты из клиента, закрыть .env, поправить правила Firebase. Отчёт можно отдать ИИ-агенту и починить силами той же вайб-кодинг-сессии.",
    en: "Every failed check explains the issue and shows evidence — most fixes take an evening: remove secrets from the client, lock .env, tighten Firebase rules. Hand the report to an AI agent and fix it in the same vibe-coding session.",
  },
  faq4Q: { ru: "Вы храните результаты сканов?", en: "Do you store scan results?" },
  faq4A: {
    ru: "Отчёт доступен по ссылке и не содержит самих секретов — только факты находок и маскированные фрагменты. Полные ключи мы никогда не сохраняем и не показываем даже вам.",
    en: "The report is available via a link and contains no raw secrets — only findings and masked fragments. Full key values are never stored or shown, even to you.",
  },
  footerText: {
    ru: "AppSeal — независимый слой доверия для эпохи, когда софт пишут все. Прототип MVP.",
    en: "AppSeal — an independent trust layer for the era when everyone writes software. MVP prototype.",
  },
  gradeTitle: { ru: "Оценка техосмотра", en: "Trust grade" },
  findingsTitle: { ru: "Находки по категориям", en: "Findings by category" },
  allGood: {
    ru: "Критичных проблем не найдено. Но один скан — не навсегда: приложение меняется, и проверки стоит повторять после каждого релиза.",
    en: "No critical issues found. But one scan is not forever: apps change, and checks should be repeated after every release.",
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
