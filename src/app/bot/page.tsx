import type { Metadata } from "next";
import Link from "next/link";
import { ShieldCheck, Lock, Activity, KeyRound } from "@/components/icons/appseal-icons";

export const metadata: Metadata = {
  title: "AppSeal Scanner Bot — Политика сканирования и Opt-out",
  description:
    "Информация о краулере AppSeal-Scanner: частота запросов, пассивный режим проверки безопасности и правила исключения через robots.txt.",
};

export default function BotPage() {
  return (
    <div className="flex min-h-screen flex-col bg-[#090d16] text-slate-100">
      <header className="sticky top-0 z-40 border-b border-slate-800/70 bg-[#090d16]/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5" aria-label="AppSeal home">
            <img
              src="/ico.svg"
              alt="AppSeal"
              width={28}
              height={28}
              className="h-7 w-7 object-contain drop-shadow-[0_2px_8px_rgba(56,189,248,0.4)] transition-transform hover:scale-105"
            />
            <span className="font-display text-lg font-extrabold tracking-tight">AppSeal</span>
          </Link>
          <div className="flex items-center gap-3">
            <Link
              href="/registry"
              className="text-xs font-semibold text-slate-400 hover:text-slate-200 transition"
            >
              Реестр
            </Link>
            <Link
              href="/"
              className="rounded-md bg-sky-400 px-3.5 py-1.5 text-xs font-bold text-[#090d16] transition hover:bg-sky-300"
            >
              Сканер
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-12 sm:px-6 sm:py-16">
        <div className="rounded-2xl border border-slate-800 bg-[#111827] p-6 sm:p-10">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-500/15 text-sky-400 border border-sky-500/30">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-widest text-sky-400">
                Crawler & Security Policy
              </p>
              <h1 className="font-display text-2xl font-extrabold text-slate-50 sm:text-3xl">
                AppSeal-Scanner
              </h1>
            </div>
          </div>

          <div className="mt-6 rounded-lg border border-slate-800 bg-[#090d16] p-4 font-mono text-xs text-sky-300">
            User-Agent: <span className="text-emerald-400">AppSeal-Scanner/0.3 (+https://appseal.online/bot)</span>
          </div>

          <div className="mt-8 space-y-6 text-sm leading-relaxed text-slate-300">
            <section>
              <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
                <Activity className="h-4 w-4 text-sky-400" />
                Что это за робот?
              </h2>
              <p className="mt-2 text-slate-300">
                <strong className="text-slate-100">AppSeal-Scanner</strong> — это автоматизированный сканер внешней гигиены веб-приложений. 
                Он запускается разработчиками или владельцами ресурсов для аудита базовой конфигурации безопасности перед релизом (наличие HTTPS, заголовки защиты, отсутствие открытых служебных файлов, утечек ключей и битых страниц).
              </p>
            </section>

            <section className="pt-2">
              <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
                <Lock className="h-4 w-4 text-sky-400" />
                Принципы пассивного аудита
              </h2>
              <ul className="mt-3 list-inside list-disc space-y-2 text-slate-300 pl-1">
                <li>
                  <strong className="text-slate-100">Исключительно пассивный black-box анализ:</strong> сканер делает только стандартные HTTP <code className="rounded bg-slate-800 px-1.5 py-0.5 text-xs text-slate-200">GET</code>, <code className="rounded bg-slate-800 px-1.5 py-0.5 text-xs text-slate-200">HEAD</code> и <code className="rounded bg-slate-800 px-1.5 py-0.5 text-xs text-slate-200">OPTIONS</code> запросы.
                </li>
                <li>
                  <strong className="text-slate-100">Никаких деструктивных действий:</strong> сканер не производит попыток авторизации, брутфорса, SQL-инъекций, отправки форм или перегрузки каналов связи (DoS).
                </li>
                <li>
                  <strong className="text-slate-100">Ограничение частоты (Rate Limiting):</strong> краулер выполняет параллельно не более 4 лёгких потоков (GET/HEAD/OPTIONS). Полный цикл v0.4 состоит из ~100 точечных запросов и завершается за 20-40 секунд.
                </li>
                <li>
                  <strong className="text-slate-100">Маскирование секретов (Privacy & 152-ФЗ):</strong> сканер никогда не сохраняет и не отображает содержимое обнаруженных файлов конфигурации или приватных ключей. Любые найденные токены принудительно маскируются звездочками.
                </li>
              </ul>
            </section>

            <section className="pt-4 border-t border-slate-800">
              <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
                <KeyRound className="h-4 w-4 text-sky-400" />
                Мгновенный запрет сканирования (Opt-out)
              </h2>
              <p className="mt-2 text-slate-300">
                Сканер AppSeal строго следует правилам <code className="rounded bg-slate-800 px-1.5 py-0.5 text-xs text-slate-200">robots.txt</code>. 
                Перед началом любой проверки робот запрашивает <code className="rounded bg-slate-800 px-1.5 py-0.5 text-xs text-slate-200">/robots.txt</code>. 
                Если вы хотите запретить сканирование вашего ресурса, добавьте директиву:
              </p>
              <div className="mt-3 rounded-lg border border-slate-800 bg-[#090d16] p-4 font-mono text-xs text-slate-200">
                User-agent: AppSeal-Scanner<br />
                Disallow: /
              </div>
              <p className="mt-2 text-xs text-slate-400">
                При обнаружении этого правила в <code className="text-slate-300">robots.txt</code> скан немедленно останавливается с уведомлением пользователю о запрете со стороны администратора.
              </p>
            </section>
          </div>
        </div>
      </main>

      <footer className="mt-auto border-t border-slate-800/70 bg-[#070b13]">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-4 px-4 py-8 text-center sm:flex-row sm:px-6 sm:text-left">
          <div className="space-y-1">
            <p className="text-xs text-slate-500">
              © {new Date().getFullYear()} AppSeal · Crawler & Scanner Documentation
            </p>
            <p className="font-mono text-[10px] text-slate-700">
              <Link href="/" className="transition hover:text-slate-500">главная</Link> · <Link href="/registry" className="transition hover:text-slate-500">реестр</Link> · <Link href="/legal" className="transition hover:text-slate-500">правила</Link>
            </p>
          </div>
          <div className="shrink-0 transition-transform hover:scale-[1.02]">
            <a
              href="/?report=mweys4fr-0d7b05c638"
              target="_blank"
              rel="noopener"
              title="AppSeal Security Verified: Grade A+ (100/100)"
              className="inline-block"
            >
              <img
                src="/api/badge?id=mweys4fr-0d7b05c638"
                alt="AppSeal Verified: Grade A+"
                width={228}
                height={44}
                className="h-[44px] w-[228px] drop-shadow-[0_4px_16px_rgba(192,132,252,0.18)]"
              />
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
