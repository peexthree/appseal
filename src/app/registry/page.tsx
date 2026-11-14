import type { Metadata } from "next";
import Link from "next/link";
import { ShieldCheck } from "@/components/icons/appseal-icons";
import { getRegistryEntries, redisConfig, redis } from "@/lib/scanner/store";
import { dedupeRegistry, isDofollow, type RegistryEntry } from "@/lib/registry";
import { getTrophyPath, GRADE_META } from "@/lib/scanner/grade";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "AppSeal - реестр просканированных приложений",
  description:
    "Публичный каталог vibe-приложений, прошедших техосмотр AppSeal: шестиуровневая шкала A+-E, дата скана. Классы A+ и A получают индексируемую ссылку из реестра.",
  alternates: { canonical: "/registry" },
};

const GRADE_STYLES: Record<string, string> = {
  "A+": "bg-[#C084FC]/15 text-[#C084FC] border-[#C084FC]/40 shadow-[0_0_12px_rgba(192,132,252,0.25)]",
  A: "bg-[#34D399]/15 text-[#34D399] border-[#34D399]/40",
  B: "bg-[#38BDF8]/15 text-[#38BDF8] border-[#38BDF8]/40",
  C: "bg-[#FBBF24]/15 text-[#FBBF24] border-[#FBBF24]/40",
  D: "bg-[#FB923C]/15 text-[#FB923C] border-[#FB923C]/40",
  E: "bg-[#F87171]/15 text-[#F87171] border-[#F87171]/40",
};

const dateFmt = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", year: "numeric" });

function GradeChip({ grade }: { grade: string }) {
  const cls = GRADE_STYLES[grade] ?? "bg-slate-800 text-slate-300 border-slate-700";
  return (
    <span className={`inline-flex h-7 min-w-8 items-center justify-center rounded-md border px-2 font-display text-sm font-extrabold ${cls}`}>
      {grade}
    </span>
  );
}

export default async function RegistryPage() {
  const raw = await getRegistryEntries();
  // the registry is a showcase of good sites: only top grades are listed
  const entries = dedupeRegistry(raw)
    .filter((e) => e.grade === "A+" || e.grade === "A")
    .slice(0, 120);

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
          Публичные приложения, прошедшие техосмотр AppSeal. Классы A+ и A получают
          индексируемую ссылку из этого каталога - поставьте 3D-трофей или бейдж на сайт и{" "}
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
          <>
            <p className="mt-6 text-sm text-slate-500">
              {entries.length} приложени{entries.length === 1 ? "е" : "я"} · только классы A/A+ · сканы хранятся 7 дней
              {tickCount > 0 && <> · <span className="text-emerald-400">за 24 часа авто-проверок: {tickCount}</span></>}
            </p>
            <ul className="mt-6 divide-y divide-slate-800/70 overflow-hidden rounded-2xl border border-slate-800 bg-[#111827]">
              {entries.map((e: RegistryEntry) => {
                const dofollow = isDofollow(e);
                const trophyPath = getTrophyPath(e.grade);
                const meta = GRADE_META[e.grade as keyof typeof GRADE_META];
                const statusLabel = meta?.label.ru ?? "";

                return (
                  <li key={e.id} className="group flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5 transition hover:bg-slate-850/60">
                    {/* 3D trophy icon */}
                    <div className="relative flex h-11 w-11 shrink-0 items-center justify-center">
                      <img
                        src={trophyPath}
                        alt={`AppSeal ${e.grade}`}
                        width={44}
                        height={44}
                        className="h-11 w-11 object-contain drop-shadow-[0_4px_12px_rgba(0,0,0,0.6)] transition-transform duration-200 group-hover:scale-110"
                      />
                    </div>
                    <GradeChip grade={e.grade} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <a
                          href={`https://${e.host}`}
                          rel={dofollow ? "noopener" : "nofollow noopener"}
                          className="truncate text-sm font-semibold text-slate-100 transition hover:text-sky-400"
                        >
                          {e.host}
                        </a>
                        {statusLabel && (
                          <span className="hidden text-xs text-slate-500 md:inline">
                            · {statusLabel}
                          </span>
                        )}
                      </div>
                      {e.desc && (
                        <p className="mt-0.5 truncate text-xs text-slate-500">{e.desc}</p>
                      )}
                    </div>
                    {dofollow && (
                      <span className={`hidden rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider sm:inline ${
                        e.grade === "A+"
                          ? "border-[#C084FC]/40 text-[#C084FC] bg-[#C084FC]/10"
                          : "border-[#34D399]/30 text-[#34D399] bg-[#34D399]/10"
                      }`}>
                        dofollow
                      </span>
                    )}
                    <span className="font-mono text-xs text-slate-400">{e.score}/100</span>
                    <span className="font-mono text-xs text-slate-500">{dateFmt.format(new Date(e.ts))}</span>
                  </li>
                );
              })}
            </ul>
          </>
        )}

        <p className="mt-8 text-xs leading-relaxed text-slate-600">
          Реестр строится из публичных сканов и показывает только домен, оценку и дату -
          никаких приватных данных из отчётов. Владелец сайта может запросить исключение
          домена из реестра. Классы A+ и A присваиваются автоматически по результатам 121 проверки.
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
