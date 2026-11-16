import type { Metadata } from "next";
import Link from "next/link";
import { CI_YAML } from "@/lib/ci-yaml";
import { CopyCode } from "../fixes/copy-code";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "AppSeal в CI: GitHub Action с грейд-гейтом и бейджем для README",
  description:
    "Готовый GitHub Action: каждый пуш проходит техосмотр AppSeal, сборка падает при классе ниже B, бейдж с живым классом ставится в README. Настройка за 3 минуты.",
  alternates: { canonical: "/ci" },
};

export default function CiPage() {
  const badgeMd = `[![AppSeal Security Verified](https://appseal.online/api/badge?host=your-domain.com)](https://appseal.online/verified/your-domain.com)`;

  return (
    <div className="flex min-h-screen flex-col bg-[#090d16] text-slate-100">
      <header className="sticky top-0 z-40 border-b border-slate-800/70 bg-[#090d16]/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5" aria-label="AppSeal home">
            <img
              src="/ico.png"
              alt="AppSeal"
              width={28}
              height={28}
              className="h-7 w-7 object-contain drop-shadow-[0_2px_8px_rgba(56,189,248,0.4)] transition-transform hover:scale-105"
            />
            <span className="font-display text-lg font-extrabold tracking-tight">AppSeal</span>
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/fixes" className="text-sm font-semibold text-slate-300 transition hover:text-sky-400">
              Гайды
            </Link>
            <Link
              href="/"
              className="rounded-md bg-sky-400 px-4 py-1.5 text-sm font-bold text-[#090d16] transition hover:bg-sky-300"
            >
              Проверить свой
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-sky-400">AppSeal для CI</p>
        <h1 className="mt-3 font-display text-3xl font-extrabold leading-tight sm:text-4xl">
          Техосмотр в каждом пуше
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-400">
          Внешний чёрный ящик сканирует ваш деплой после каждого пуша: 125 проверок, класс A+-E.
          Сборка падает, если класс ниже B - регрессии безопасности ловятся до ревью. Настройка - три
          шага, без установки агентов.
        </p>

        <section className="mt-8">
          <h2 className="font-display text-xl font-extrabold">Шаг 1. Секреты репозитория</h2>
          <div className="mt-3 overflow-hidden rounded-2xl border border-slate-800 bg-[#111827]">
            <div className="flex items-center gap-4 border-b border-slate-800/60 px-5 py-3 text-sm">
              <span className="w-56 shrink-0 font-mono text-xs font-bold text-sky-400">APPSEAL_TARGET_URL</span>
              <span className="flex-1 text-xs text-slate-400">обязательно - адрес деплоя для скана, например https://myapp.vercel.app</span>
            </div>
            <div className="flex items-center gap-4 px-5 py-3 text-sm">
              <span className="w-56 shrink-0 font-mono text-xs font-bold text-sky-400">APPSEAL_ADMIN_KEY</span>
              <span className="flex-1 text-xs text-slate-400">опционально - снимает дневной лимит бесплатных сканов (кнопка выдаётся в отчёте владельцу)</span>
            </div>
          </div>
        </section>

        <section className="mt-8">
          <h2 className="font-display text-xl font-extrabold">Шаг 2. Workflow</h2>
          <p className="mt-2 text-sm text-slate-400">
            Создайте <span className="font-mono text-xs text-slate-300">.github/workflows/appseal.yml</span>:
          </p>
          <div className="mt-3 rounded-2xl border border-slate-800 bg-[#111827] p-5">
            <div className="flex items-center justify-between gap-3">
              <span className="font-mono text-xs font-bold text-slate-400">appseal.yml</span>
              <CopyCode code={CI_YAML} label="Скопировать workflow" />
            </div>
            <pre className="mt-3 overflow-x-auto rounded-xl border border-slate-800 bg-[#090d16] p-4 font-mono text-[11px] leading-relaxed text-slate-300">
              {CI_YAML}
            </pre>
          </div>
        </section>

        <section className="mt-8">
          <h2 className="font-display text-xl font-extrabold">Шаг 3. Бейдж в README</h2>
          <p className="mt-2 text-sm text-slate-400">
            Бейдж привязан к домену и всегда показывает актуальный класс - он обновляется сам после
            каждого скана, в том числе из CI:
          </p>
          <div className="mt-3 rounded-2xl border border-slate-800 bg-[#111827] p-5">
            <div className="flex items-center justify-between gap-3">
              <span className="font-mono text-xs font-bold text-slate-400">README.md</span>
              <CopyCode code={badgeMd} label="Скопировать бейдж" />
            </div>
            <pre className="mt-3 overflow-x-auto rounded-xl border border-slate-800 bg-[#090d16] p-4 font-mono text-[11px] leading-relaxed text-slate-300">
              {badgeMd}
            </pre>
          </div>
        </section>

        <div className="mt-10 rounded-2xl border border-sky-500/30 bg-[#0d1220] p-6">
          <p className="text-sm text-slate-300">
            Класс просел в CI? Самые частые провалы - заголовки. Чинятся одним конфигом:{" "}
            <Link href="/fixes" className="font-bold text-sky-400 hover:underline">
              готовые конфиги под ваш хостинг →
            </Link>
          </p>
        </div>
      </main>

      <footer className="mt-auto border-t border-slate-800/70 bg-[#070b13]">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-xs text-slate-500 sm:px-6">
          <span>AppSeal Engine · External Black-Box Security Scanner</span>
          <span className="inline-flex items-center gap-3">
            <Link href="/fixes" className="transition hover:text-slate-400">гайды</Link>
            <Link href="/stats" className="transition hover:text-slate-400">статистика</Link>
          </span>
        </div>
      </footer>
    </div>
  );
}
