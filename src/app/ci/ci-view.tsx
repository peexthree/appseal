"use client";

import Link from "next/link";
import { CopyCode } from "../fixes/copy-code";
import { useLang } from "@/lib/use-lang";

/**
 * CI workflow with the Pro API token: POST /api/scan under a Bearer token,
 * poll /api/scan/{id}, then the grade gate fails the build below class B.
 * Kept local to this page (the report tab renders /lib/ci-yaml.ts, same
 * token + polling scheme, different gate step).
 */
const CI_YAML = `name: AppSeal scan

on: [push, workflow_dispatch]

jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - name: AppSeal scan
        id: appseal
        env:
          APPSEAL_TOKEN: \${{ secrets.APPSEAL_TOKEN }} # Pro Pass: issued by the /token bot command
        run: |
          ID=$(curl -fsS -X POST https://appseal.online/api/scan \\
            -H 'content-type: application/json' \\
            -H "authorization: Bearer $APPSEAL_TOKEN" \\
            -d '{"url":"\${{ secrets.APPSEAL_TARGET_URL }}"}' | jq -r '.id')
          # poll for the finished scan instead of a blind sleep: a scan that
          # takes 46s used to fail the build, a 5s scan used to wait 45s
          STATUS="pending"
          for i in $(seq 1 30); do
            R=$(curl -fsS https://appseal.online/api/scan/$ID)
            STATUS=$(echo "$R" | jq -r '.status')
            [ "$STATUS" = "done" ] && break
            [ "$STATUS" = "error" ] && break
            sleep 5
          done
          [ "$STATUS" = "done" ] || { echo "scan did not finish: $STATUS"; exit 1; }
          echo "grade=$(echo "$R" | jq -r '.grade')" >> "$GITHUB_OUTPUT"
          echo "score=$(echo "$R" | jq -r '.score')" >> "$GITHUB_OUTPUT"

      - name: Grade gate (fail below B)
        env:
          GRADE: \${{ steps.appseal.outputs.grade }}
          SCORE: \${{ steps.appseal.outputs.score }}
        run: |
          echo "AppSeal grade: $GRADE ($SCORE/100)"
          case "$GRADE" in
            A*|B) echo "OK" ;;
            *) echo "grade below B - failing the build"; exit 1 ;;
          esac
`;

const D = {
  eyebrow: { ru: "AppSeal для CI", en: "AppSeal for CI" },
  h1: { ru: "Техосмотр в каждом пуше", en: "A checkup on every push" },
  intro: {
    ru: "Внешний чёрный ящик сканирует ваш деплой после каждого пуша: 125 проверок, класс A+-E. Сборка падает, если класс ниже B - регрессии безопасности ловятся до ревью. Настройка - три шага, без установки агентов.",
    en: "An external black-box scans your deploy after every push: 125 checks, A+-E grade. The build fails if the grade drops below B - security regressions get caught before review. Three setup steps, no agents to install.",
  },
  step1: { ru: "Шаг 1. Секреты репозитория", en: "Step 1. Repository secrets" },
  s1a: {
    ru: "обязательно - адрес деплоя для скана, например https://myapp.vercel.app",
    en: "required - the deploy URL to scan, e.g. https://myapp.vercel.app",
  },
  s1b: {
    ru: "токен: команда /token в Telegram-боте (входит в Pro Pass) - снимает дневной лимит /api/scan",
    en: "token: the /token command in the Telegram bot (included in Pro Pass) - lifts the /api/scan daily limit",
  },
  step2: { ru: "Шаг 2. Workflow", en: "Step 2. Workflow" },
  s2a: {
    ru: "Создайте ",
    en: "Create ",
  },
  s2b: { ru: ":", en: ":" },
  copyWorkflow: { ru: "Скопировать workflow", en: "Copy workflow" },
  step3: { ru: "Шаг 3. Бейдж в README", en: "Step 3. Badge in README" },
  s3: {
    ru: "Бейдж привязан к домену и всегда показывает актуальный класс - он обновляется сам после каждого скана, в том числе из CI:",
    en: "The badge is bound to the domain and always shows the current grade - it refreshes itself after every scan, including from CI:",
  },
  copyBadge: { ru: "Скопировать бейдж", en: "Copy badge" },
  cta: {
    ru: "Класс просел в CI? Самые частые провалы - заголовки. Чинятся одним конфигом: ",
    en: "Grade dropped in CI? The most common gaps are headers. Fixable with one config: ",
  },
  ctaLink: { ru: "готовые конфиги под ваш хостинг →", en: "ready-made configs for your hosting →" },
  fFixes: { ru: "гайды", en: "guides" },
  fStats: { ru: "статистика", en: "stats" },
} as const;

export function CiView() {
  const lang = useLang();
  const t = (k: keyof typeof D) => D[k][lang];
  const badgeMd = `[![AppSeal Security Verified](https://appseal.online/api/badge?host=your-domain.com)](https://appseal.online/verified/your-domain.com)`;

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-sky-400">{t("eyebrow")}</p>
      <h1 className="mt-3 font-display text-3xl font-extrabold leading-tight sm:text-4xl">
        {t("h1")}
      </h1>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-400">
        {t("intro")}
      </p>

      <section className="mt-8">
        <h2 className="font-display text-xl font-extrabold">{t("step1")}</h2>
        <div className="mt-3 overflow-hidden rounded-2xl appseal-glass-card">
          <div className="flex items-center gap-4 border-b border-slate-800/60 px-5 py-3 text-sm">
            <span className="w-56 shrink-0 font-mono text-xs font-bold text-sky-400">APPSEAL_TARGET_URL</span>
            <span className="flex-1 text-xs text-slate-400">{t("s1a")}</span>
          </div>
          <div className="flex items-center gap-4 border-b border-slate-800/60 px-5 py-3 text-sm">
            <span className="w-56 shrink-0 font-mono text-xs font-bold text-sky-400">APPSEAL_TOKEN</span>
            <span className="flex-1 text-xs text-slate-400">{t("s1b")}</span>
          </div>
        </div>
      </section>

      <section className="mt-8">
        <h2 className="font-display text-xl font-extrabold">{t("step2")}</h2>
        <p className="mt-2 text-sm text-slate-400">
          {t("s2a")}
          <span className="font-mono text-xs text-slate-300">.github/workflows/appseal.yml</span>
          {t("s2b")}
        </p>
        <div className="mt-3 rounded-2xl appseal-glass-card p-5">
          <div className="flex items-center justify-between gap-3">
            <span className="font-mono text-xs font-bold text-slate-400">appseal.yml</span>
            <CopyCode code={CI_YAML} label={t("copyWorkflow")} />
          </div>
          <pre className="mt-3 overflow-x-auto rounded-xl border border-slate-800 bg-[#090d16] p-4 font-mono text-[11px] leading-relaxed text-slate-300">
            {CI_YAML}
          </pre>
        </div>
      </section>

      <section className="mt-8">
        <h2 className="font-display text-xl font-extrabold">{t("step3")}</h2>
        <p className="mt-2 text-sm text-slate-400">
          {t("s3")}
        </p>
        <div className="mt-3 rounded-2xl appseal-glass-card p-5">
          <div className="flex items-center justify-between gap-3">
            <span className="font-mono text-xs font-bold text-slate-400">README.md</span>
            <CopyCode code={badgeMd} label={t("copyBadge")} />
          </div>
          <pre className="mt-3 overflow-x-auto rounded-xl border border-slate-800 bg-[#090d16] p-4 font-mono text-[11px] leading-relaxed text-slate-300">
            {badgeMd}
          </pre>
        </div>
      </section>

      <div className="appseal-glass-card mt-10 rounded-2xl border-sky-500/30 p-6">
        <p className="text-sm text-slate-300">
          {t("cta")}
          <Link href="/fixes" className="font-bold text-sky-400 hover:underline">
            {t("ctaLink")}
          </Link>
        </p>
      </div>
    </main>
  );
}

export function CiFooterLinks() {
  const lang = useLang();
  const t = (k: keyof typeof D) => D[k][lang];
  return (
    <span className="inline-flex flex-wrap items-center gap-3">
      <Link href="/fixes" className="transition hover:text-slate-400">{t("fFixes")}</Link>
      <Link href="/stats" className="transition hover:text-slate-400">{t("fStats")}</Link>
      <Link href="/api" className="transition hover:text-slate-400">api</Link>
    </span>
  );
}
