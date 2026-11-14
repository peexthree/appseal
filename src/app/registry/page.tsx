import type { Metadata } from "next";
import Link from "next/link";
import { getRegistryEntries, redisConfig, redis } from "@/lib/scanner/store";
import { dedupeRegistry, isDofollow, isReferenceSite } from "@/lib/registry";
import RegistryList from "./registry-list";

// ISR: the catalog is a top bot crawl target and a dynamic render on every
// request burns the Fast Origin Transfer quota; 60s staleness is fine for a
// catalog fed by periodic scans
export const revalidate = 60;

export const metadata: Metadata = {
  title: "AppSeal - реестр просканированных приложений",
  description:
    "Публичный каталог vibe-приложений, прошедших техосмотр AppSeal: сотни сайтов с оценками A+-E, поиск по домену, дата скана. Классы A+ и A получают индексируемую ссылку из реестра.",
  alternates: { canonical: "/registry" },
};

export default async function RegistryPage() {
  const raw = await getRegistryEntries();
  // the catalog shows only AI-built projects: reference mega-sites (scanned
  // by demos) stay in storage but never render next to indie apps, legacy
  // www.-duplicates fold into the bare domain, and descriptions of hosts
  // below A are stripped from the payload entirely - the blur alone left the
  // text parseable in the source HTML, the privacy reward must not leak
  const entries = dedupeRegistry(raw)
    .filter((e) => !isReferenceSite(e.host))
    .map((e) => (isDofollow(e) ? e : { ...e, desc: undefined }));

  // living-registry heartbeat: how many auto scans ran in the last 24h
  let tickCount = 0;
  const tcfg = redisConfig();
  if (tcfg) {
    try {
      tickCount = Number(await redis(tcfg, ["GET", "appmot:pipeline:scans24h"])) || 0;
    } catch {
      /* counter is cosmetic */
    }
  }

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
          <Link
            href="/"
            className="rounded-md bg-sky-400 px-4 py-1.5 text-sm font-bold text-[#090d16] transition hover:bg-sky-300"
          >
            Просканировать свой
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-12 sm:px-6">
        <h1 className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
          Реестр техосмотра
        </h1>
        <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-slate-400">
          Публичные приложения, прошедшие техосмотр AppSeal, - все классы от A+ до E.
          Классы A+ и A получают индексируемую ссылку и открытое описание, у остальных
          ссылка и описание скрыты -{" "}
          <Link href="/" className="text-sky-400 underline decoration-dotted underline-offset-4 hover:text-sky-300">
            просканируйте свой проект
          </Link>{" "}
          бесплатно.
        </p>

        {entries.length === 0 ? (
          <div className="mt-10 rounded-2xl border border-slate-800 bg-[#111827] p-10 text-center">
            <p className="text-slate-400">Реестр пока пуст. Первый A+ или A - за вами.</p>
            <Link
              href="/"
              className="mt-4 inline-block rounded-md bg-sky-400 px-5 py-2 text-sm font-bold text-[#090d16] transition hover:bg-sky-300"
            >
              Просканировать свой проект
            </Link>
          </div>
        ) : (
          <RegistryList entries={entries} tickCount={tickCount} />
        )}

        <p className="mt-8 text-xs leading-relaxed text-slate-600">
          Реестр строится из публичных сканов и показывает оценку и дату - никаких
          приватных данных из отчётов. Ссылка на сайт и его описание открыты только у
          классов A/A+: каталог рекламирует приложения, заработавшие бейдж, а авторы
          остальных находят свой домен поиском и видят свой грейд. Владелец сайта может
          запросить исключение домена из реестра. Классы A+ и A присваиваются
          автоматически по результатам 121 проверки.
        </p>
      </main>

      <footer className="mt-auto border-t border-slate-800/70 bg-[#070b13]">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-4 px-4 py-8 text-center sm:flex-row sm:px-6 sm:text-left">
          <div className="space-y-1">
            <p className="text-xs text-slate-500">
              © {new Date().getFullYear()} AppSeal · независимый слой доверия для приложений, собранных с ИИ
            </p>
            <p className="font-mono text-[10px] text-slate-700">
              <a href="/" className="transition hover:text-slate-500">главная</a> · <a href="/bot" className="transition hover:text-slate-500">робот</a> · <a href="/legal" className="transition hover:text-slate-500">правила</a>
            </p>
          </div>
          <div className="shrink-0 transition-transform hover:scale-[1.02]">
            <a
              href="/report/mweys4fr-0d7b05c638"
              target="_blank"
              rel="noopener"
              title="AppSeal Security Verified: Grade A+ (97/100)"
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
