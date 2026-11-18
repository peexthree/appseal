# Деплой AppSeal

Проект - обычный Next.js 16 (standalone) + Node 22. Сканы хранятся файлами в `db/scans/`,
никакой внешней БД не требуется. Есть два пути: серверлесс (Vercel) или контейнер куда угодно.

## Что уже готово в репо

- `Dockerfile` - продакшн-образ (Node 22, standalone, non-root, volume под `db`, healthcheck на `/api/healthz`)
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
docker run -d --name appmot -p 80:3000 -v appmot_db:/app/db --restart unless-stopped appmot

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
4. Healthcheck: `GET /api/healthz` отвечает JSON `{"ok":true,"uptime":...,"redis":"up|down|skipped","ts":...}`
   без секретов; в Docker-образе уже прописан `HEALTHCHECK` на этот эндпоинт

## Бэкапы

### Docker/VPS (файловый store в `db/`)

Готов скрипт `scripts/backup-db.sh`: складывает `db/` (записи сканов + `registry.json`)
в `backups/db-YYYYMMDD-HHMM.tar.gz` и удаляет архивы старше 14 дней.

```bash
# разово
./scripts/backup-db.sh

# ежедневно в 04:10 (crontab -e)
10 4 * * * /path/to/appmot/scripts/backup-db.sh >> /path/to/appmot/backups/backup.log 2>&1
```

Восстановление: `tar -xzf backups/db-<date>.tar.gz` в корне контейнера-маунта (или
распаковать в директорию, которая примонтирована как `/app/db`), затем перезапуск контейнера.

### Upstash (вариант А, Vercel)

Данные сканов и passes живут в Upstash Redis - делай ежедневный снапшот из консоли
Upstash: Console → твоя база → Backups → включи ежедневный snapshot (на бесплатном
тарифе бэкапы ограничены, при апгрейде - полноценный daily backup с retention).
Восстановление тоже из консоли (Restore backup).

## TICK_SECRET

Крон-эндпоинты `/api/monitor-tick`, `/api/pipeline-tick`, `/api/digest-tick` поддерживают
общий секрет: если в окружении задан `TICK_SECRET`, каждый вызов обязан передать его
в заголовке `x-tick-secret` (или в query `?secret=...`), иначе - 401. Сравнение
констант-тайм. Если переменная не задана - эндпоинты остаются публичными (старое
поведение, троттлинг через Redis-лок сохраняется).

Что сделать при включении:

1. Vercel (или Docker-окружение): добавь переменную `TICK_SECRET` с длинной случайной
   строкой (например `openssl rand -hex 24`)
2. GitHub: Settings → Secrets and variables → Actions → New repository secret,
   имя `TICK_SECRET`, то же значение - workflows `monitor-tick`, `pipeline-tick` и
   `digest-tick` уже передают заголовок из `${{ secrets.TICK_SECRET }}`
3. Если секрет в GitHub не задан, workflow шлёт вызов без заголовка - это нормально,
   пока на сервере тоже не задан `TICK_SECRET` (задай синхронно в обоих местах)

CI: `.github/workflows/ci.yml` гоняет `npm test` на каждый push в `main` и на PR.

## Бэкап Supabase (GitHub Actions)

`​.github/workflows/backup-db.yml` ежедневно в 04:10 UTC делает `pg_dump` базы Supabase
Postgres (custom-формат `-Fc`) и сохраняет дамп как артефакт GitHub Actions
`appseal-db-backup-<дата>` с хранением 30 дней. Запуск вручную: Actions → backup db → Run workflow.

Настройка (один раз):

1. Добавь секрет `DATABASE_URL` в репозиторий GitHub (peexthree/appseal → Settings →
   Secrets and variables → Actions → New repository secret). Значение - из Supabase:
   Settings → Database → Connection string → Session pooler (порт 5432), либо тот же
   transaction-URL (порт 6543) - workflow сам подменяет порт на 5432, потому что
   `pg_dump` требует одиночную сессию, а transaction-пулер её не даёт.
2. Пока секрет не задан, workflow пишет warning и завершается без ошибки -
   ежедневный крон не краснеет.

Восстановление: скачай dump-файл из артефакта, затем из папки с ним:

```bash
docker run --rm -v "$PWD:/dump" postgres:17-alpine \
  pg_restore -d "$DATABASE_URL" --no-owner /dump/appseal-<дата>.dump
```

`$DATABASE_URL` - тот же session-пулер URL (порт 5432). Формат `-Fc` восстанавливается
только через `pg_restore`. Чтобы заменить существующие таблицы данными из дампа, добавь
`--clean` (осторожно: он сначала удаляет текущие таблицы).

Retention: pipeline-tick (каждые 30 минут) удаляет rejected-отзывы из таблицы `reviews`
через 14 дней (retention из /legal, раздел 7). Нюанс: дамп, сделанный до удаления,
может содержать такие отзывы - после восстановления они будут удалены автоматически
на ближайшем тике.
