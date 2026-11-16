import type { Metadata } from "next";
import Link from "next/link";
import { FIX_GUIDES, HEADER_WHY } from "@/lib/fixes-content";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Как закрыть заголовки безопасности: конфиги для Vercel, Netlify, Cloudflare, nginx - AppSeal",
  description:
    "Готовые конфиги защитных заголовков (CSP, HSTS, COOP, X-Frame-Options) для Vercel, Next.js, Cloudflare Pages, Netlify, GitHub Pages и nginx - копипаст и деплой. Проверка сайта бесплатная.",
  alternates: { canonical: "/fixes" },
};

export default function FixesHubPage() {
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
            <Link href="/stats" className="text-sm font-semibold text-slate-300 transition hover:text-sky-400">
              Статистика
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

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-sky-400">Центр исправлений</p>
        <h1 className="mt-3 font-display text-3xl font-extrabold leading-tight sm:text-4xl">
          Готовые конфиги защитных заголовков под ваш хостинг
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-400">
          Массовый техосмотр AppSeal показал: <span className="font-bold text-slate-200">9 из 10 AI-собранных
          сайтов не имеют базовых защитных заголовков</span> - при этом исправление занимает один файл
          и пять минут. Выберите платформу, скопируйте конфиг, задеплойте - и перепроверьте сайт.
        </p>

        <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {FIX_GUIDES.map((g) => (
            <Link
              key={g.slug}
              href={`/fixes/${g.slug}`}
              className="appseal-card group rounded-2xl border border-slate-800 bg-[#111827] p-5 transition hover:border-sky-400/40"
            >
              <div className="font-display text-lg font-extrabold text-slate-100 group-hover:text-sky-400">
                {g.label}
              </div>
              <div className="mt-1 font-mono text-xs text-sky-400/80">{g.file}</div>
              <div className="mt-3 text-xs leading-relaxed text-slate-500">
                CSP · HSTS · COOP · XFO · Permissions-Policy - одним блоком.
              </div>
              <div className="mt-3 text-xs font-bold text-sky-400">Открыть гайд →</div>
            </Link>
          ))}
        </div>

        <section className="mt-12">
          <h2 className="font-display text-xl font-extrabold">Что именно закрывают эти заголовки</h2>
          <div className="mt-4 overflow-hidden rounded-2xl border border-slate-800 bg-[#111827]">
            {HEADER_WHY.map((h, i) => (
              <div
                key={h.name}
                className={`flex flex-col gap-1 px-5 py-4 sm:flex-row sm:items-center sm:gap-4 ${
                  i < HEADER_WHY.length - 1 ? "border-b border-slate-800/60" : ""
                }`}
              >
                <span className="w-64 shrink-0 font-mono text-xs font-bold text-sky-400">{h.name}</span>
                <span className="flex-1 text-sm text-slate-300">{h.why}</span>
                <span className="w-56 shrink-0 text-xs text-slate-500">{h.miss}</span>
              </div>
            ))}
          </div>
        </section>

        <div className="mt-10 rounded-2xl border border-sky-500/30 bg-[#0d1220] p-6">
          <p className="text-sm text-slate-300">
            Настроили? Проверьте результат: внешний движок AppSeal прогоняет 125 проверок и ставит класс
            A+-E за минуту - бесплатно.
          </p>
          <Link
            href="/"
            className="mt-4 inline-block rounded-md bg-sky-400 px-5 py-2.5 text-sm font-bold text-[#090d16] transition hover:bg-sky-300"
          >
            Запустить техосмотр
          </Link>
        </div>
      </main>

      <footer className="mt-auto border-t border-slate-800/70 bg-[#070b13]">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-xs text-slate-500 sm:px-6">
          <span>AppSeal Engine · External Black-Box Security Scanner</span>
          <span className="inline-flex items-center gap-3">
            <Link href="/stats" className="transition hover:text-slate-400">статистика</Link>
            <Link href="/registry" className="transition hover:text-slate-400">реестр</Link>
          </span>
        </div>
      </footer>
    </div>
  );
}
