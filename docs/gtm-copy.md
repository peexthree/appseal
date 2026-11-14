# GTM-копирайт для выпуска №2 (готовые тексты)

Каноникл: https://appseal.online. Продукт: внешний чёрно-ящичный сканер
AI-собранных приложений, 97 проверок по публичным страницам, шкала A+-E,
PDF-отчёт с промптом фикса для ИИ-агента. Launch Pass: 490 ₽ / 7 дней.

Как публиковать: раздел 1 - Reddit (вторник-среда), через день-два раздел 2 -
Show HN (утро по США = 16:00-18:00 по Туймазам). Раздел 6 - Telegram/X в день
релиза. Не постить всё в один день.

## 1. Reddit: r/vibecoding + r/SideProject (EN, готов к копипасту)

Title:

    I scanned 409 vibe-coded apps with a black-box security scanner - most miss basic security headers

Body:

    Vibe-coded apps often look finished but fail basic hygiene: no CSP, no frame
    protection, secrets sitting in client JS. I built AppSeal - an external
    black-box scanner: about 100 polite GET requests to public pages, no
    exploits, no load. You get an A+-E grade and a PDF report with a fix prompt
    you can hand straight back to your AI agent.

    I ran it against 627 apps their authors posted publicly on Hacker News and
    GitHub (Show HN posts, "built with v0/lovable/bolt"); 409 were alive and
    completed the full scan. The aggregate: average score 73/100, only 46 (11%)
    earned grade A/A+. What's missing most often: Permissions-Policy (86%),
    CSP (83%), X-Frame-Options (80%). Full anonymous stats:
    https://appseal.online/stats

    Names only go to the public registry with consent: scan your own domain
    (free, 1 scan/day) - grade A/A+ earns an indexable dofollow link from the
    registry: https://appseal.online/registry

    Opt-out: the scanner runs as UA AppSeal-Scanner/0.3 (+https://appseal.online/bot).
    Email linedrop@yandex.ru and we drop your domain within 3 business days.

Правила: в r/vibecoding сначала прочитай правила саба (некоторые требуют
флейр "Tool" или запрет саморекламы без участия в комментах) - отвечай на
комменты в первый час, это решает охват.

## 2. Show HN (EN, готов к копипасту)

Title:

    Show HN: AppSeal - black-box security scan for AI-built apps (A+-E in a minute)

First comment (постится сразу же автором):

    Hi HN. I built a black-box scanner for vibe-coded apps: secret signatures
    in client JS (21 groups), headers (26 rules), exposed endpoints (27),
    admin panels of 4 CMS, backups/.git, Firebase/Supabase rules, CSR shells
    (rendered headless). The result is an A+-E grade, a PDF report and a fix
    prompt for your AI agent.

    I ran a mass scan over 627 publicly posted projects (409 alive, full scan):
    average score 73/100, grade A/A+ for 11%. Most common gaps: no CSP (83%),
    no X-Frame-Options (80%), no Permissions-Policy (86%). Aggregates only -
    names go to the registry, and only for grade A or when the owner submitted
    the domain themselves: https://appseal.online/stats

    Drop your app's URL in the comments and I'll scan it for free
    (1 scan/day per IP). Scanner policy: https://appseal.online/bot

Главную ссылку в пост ведёт на https://appseal.online (лендинг), не на /stats -
HN не любит голые маркетинговые страницы, поэтому в посте ссылка на продукт,
а цифры и статистика - в первом комментарии.

## 3. Telegram/X тред на русском (готов к копипасту)

    1/ Я просканировал 409 AI-собранных приложений внешним сканером (панель 627,
    188 URL были мертвы - отдельный вывод о заброшенности vibe-проектов).
    97 проверок, нулевая нагрузка, только публичные страницы.

    2/ Средний балл - 73/100. Медиана - 73. Класс A/A+: 46 приложений (11%).
    Класс D: 12 (3%). E: 0 - полного провала нет, базовый уровень у всех есть.

    3/ Самые частые трещины: COOP не установлен (96%), Permissions-Policy (86%),
    CSP (83%), X-Frame-Options (80%). Секреты в клиентском JS - у 3%.

    4/ Источники панели: Hacker News Show HN - 311, GitHub «built with v0/lovable»
    - 91. Разница средних баллов между ними - 1 балл (73 vs 72).

    5/ Полная статистика: https://appseal.online/stats
    Реестр с dofollow для класса A: https://appseal.online/registry
    Свой домен - бесплатный скан: https://appseal.online

## 4. Прямое письмо авторам галерей (шаблон)

Тема: a quick security check for <host> - grade in a minute

    Hi! Found <host> in <gallery>. I'm building AppSeal - a MOT test for
    AI-built apps: 97 black-box checks on public pages (no exploits, no load),
    A+-E grade and a report. I can run it for free and send you the PDF; a
    grade A also gets you an indexable link from the public registry. Not
    interested - just ignore this, and your domain won't be scanned again.

## 5. Launch Pass 490 ₽ (лендинг-тезисы)

- Разовый пропуск: неделя безлимитных проверок одного домена до класса A
- Для тех, кто не хочет подписку, но хочет результат перед запуском
- Продающая фраза: «Проверь перед тем, как хвастаться скриншотом»
- EN-эквивалент: $6 (под кнопкой подпись «Payment charged in RUB (490 ₽) via YooKassa»)

## 6. Воронка на биржи микро-SaaS (Acquire / Flippa / TinyAcquisitions)

Тезис: «Техосмотр перед листингом» - покупатель микропроекта за $500-5000 хочет
видеть, что не покупает утечку API-ключей. AppSeal-отчёт прикладывается к листингу
как trust-артефакт. Пакет для брокеров и серийных продавцов - по запросу (Telegram @peexthree).

## Напоминание (регламент этики, отчёт №1 раздел 6)

Только публичные страницы, ~100 GET-запросов, без эксплойтов и аутентификации;
агрегаты можно публиковать сразу, имена - после ручной верификации или с согласия
владельца; opt-out - linedrop@yandex.ru, 3 рабочих дня; детали провалов -
только владельцу (rkey-модель), публичная поверхность = карта верификации.

Цифры в текстах соответствуют прогону 2026-11-14 (панель 627, живых 409).
После следующего автопрогона обновить из src/data/stats-harvest.json:
panel.done, gradeACount, avgScore, topFails (первые 3).
