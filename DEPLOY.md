# Деплой AppMOT

Проект - обычный Next.js 16 (standalone) + Node 22. Сканы хранятся файлами в `db/scans/`,
никакой внешней БД не требуется. Есть два пути: серверлесс (Vercel) или контейнер куда угодно.

## Что уже готово в репо

- `Dockerfile` - продакшн-образ (Node 22, standalone, non-root, volume под `db/scans`)
- `next.config.ts` - `outputFileTracingIncludes` кладёт DejaVu-шрифты в бандл `/api/report`
- Сканер ходит только на внешние http/https-цели; для тестов локально поднимаются
  мини-сервисы (`scripts/start-demo-app.sh`, `scripts/start-secure-app.sh`)

## Вариант А: Vercel (серверлесс, бесплатно на старте)

Архитектура под серверлесс уже готова: сканы хранятся в Redis (Upstash REST), фоновая
работа идёт через `after()` + `maxDuration=60`, цели скана проверяются на публичность
(SSRF-guard).

1. Аккаунт Vercel (vercel.com) - логин по email через `npx vercel login`
2. Аккаунт Upstash (upstash.com, бесплатный тариф без карты):
   - Console → Create Database → любая облако/reg ion → REST API включён по умолчанию
   - Скопируй `UPSTASH_REDIS_REST_URL` и `UPSTASH_REDIS_REST_TOKEN`
3. Переменные окружения (dashboard → Settings → Environment Variables или CLI):
   ```
   UPSTASH_REDIS_REST_URL=...
   UPSTASH_REDIS_REST_TOKEN=...
   ```
4. Деплой: `npx vercel` (из корня проекта) → превью-URL → `npx vercel --prod`
5. Бесплатный тариф Upstash: 10k команд/день - хватает на ~150 сканов в день; дальше - апгрейд

> Важно для РФ: у Vercel есть ограничения на оплату из России. Если аккаунт уже есть -
> ок; если нет - смотри вариант Б.

## Вариант Б: Docker на любом VPS (полный контроль, оплата российскими картами)

```bash
# на ПК, в корне проекта
docker build -t appmot .
docker run -d --name appmot -p 80:3000 -v appmot_scans:/app/db/scans --restart unless-stopped appmot

# TLS/домен: Caddy перед контейнером
# Caddyfile уже в репо - проксирует :80 → app:3000 и выдаёт сертификаты Let's Encrypt
```

Подходит: Timeweb Cloud, Selectel, reg.ru VPS, любой VPS с Docker.
Через `docker save`/`load` можно перенести образ на сервер без registry:

```bash
docker save appmot | ssh user@server "docker load"
```

## Вариант В: Российские PaaS (Next.js из коробки)

Amvera, Timeweb Cloud Apps - деплой через git push или загрузку проекта,
оплата российскими картами, Next.js поддерживается из коробки.

## После деплоя

1. Проверь: главная, демо-скан (`demo://app` не работает в проде - только локально),
   скан реального сайта, PDF, бейдж
2. Демо-скан в проде: сканер может ходить только на публичные цели -
   в проде кнопка «Скан демо-приложения» требует живого демо-сервиса в той же сети
   (см. mini-services) или замены цели на публичную демо-страницу
3. Rate limit и opt-out - по плану MVP (спека, раздел 10)
