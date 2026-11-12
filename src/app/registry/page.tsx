import type { Metadata } from "next";
import Link from "next/link";
import { ShieldCheck } from "@/components/icons/appseal-icons";
import { getRegistryEntries } from "@/lib/scanner/store";
import { dedupeRegistry, isDofollow, type RegistryEntry } from "@/lib/registry";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "AppSeal - реестр просканированных приложений",
  description:
    "Публичный каталог vibe-приложений, прошедших техосмотр AppSeal: оценка A-D, дата скана. Класс A получает индексируемую ссылку из реестра.",
};

const GRADE_STYLES: Record<string, string> = {
  A: "bg-emerald-400/15 text-emerald-400 border-emerald-400/40",
  B: "bg-lime-500/15 text-lime-400 border-lime-500/40",
  C: "bg-amber-500/15 text-amber-400 border-amber-500/40",
  D: "bg-red-500/15 text-red-400 border-red-500/40",
};

const dateFmt = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", year: "numeric" });

function GradeChip({ grade }: { grade: string }) {
  const cls = GRADE_STYLES[grade] ?? "bg-slate-800 text-slate-300 border-slate-700";
  return (
    <span className={`inline-flex h-7 min-w-7 items-center justify-center rounded-md border px-1.5 font-display text-sm font-extrabold ${cls}`}>
      {grade}
    </span>
  );
}

export default async function RegistryPage() {
  const raw = await getRegistryEntries();
  const entries = dedupeRegistry(raw).slice(0, 120);
  const aCount = entries.filter((e) => e.grade === "A").length;

  return (
    <div className="flex min-h-screen flex-col bg-[#090d16] text-slate-100">
      <header className="sticky top-0 z-40 border-b border-slate-800/70 bg-[#090d16]/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2" aria-label="AppSeal home">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-sky-400 text-[#090d16]">
              <ShieldCheck className="h-4.5 w-4.5" strokeWidth={2.4} />
            </span>
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
          Публичные приложения, прошедшие техосмотр AppSeal. Класс A получает
          индексируемую ссылку из этого каталога - поставьте бейдж на сайт и{" "}
          <Link href="/" className="text-sky-400 underline decoration-dotted underline-offset-4 hover:text-sky-300">
            просканируйте свой проект
          </Link>{" "}
          бесплатно.
        </p>

        {entries.length === 0 ? (
          <div className="mt-10 rounded-2xl border border-slate-800 bg-[#111827] p-10 text-center">
            <p className="text-slate-400">Реестр пока пуст. Первый A - за вами.</p>
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
              {entries.length} приложени{entries.length === 1 ? "е" : "я"} · {aCount} с классом A · сканы хранятся 7 дней, реестр обновляется при каждом новом скане
            </p>
            <ul className="mt-6 divide-y divide-slate-800/70 overflow-hidden rounded-2xl border border-slate-800 bg-[#111827]">
              {entries.map((e: RegistryEntry) => {
                const dofollow = isDofollow(e);
                return (
                  <li key={e.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-4">
                    <GradeChip grade={e.grade} />
                    <a
                      href={`https://${e.host}`}
                      rel={dofollow ? "noopener" : "nofollow noopener"}
                      className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-100 hover:text-sky-400"
                    >
                      {e.host}
                    </a>
                    {dofollow && (
                      <span className="hidden rounded border border-emerald-400/30 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-400 sm:inline">
                        dofollow
                      </span>
                    )}
                    <span className="font-mono text-xs text-slate-500">{e.score}/100</span>
                    <span className="font-mono text-xs text-slate-600">{dateFmt.format(new Date(e.ts))}</span>
                  </li>
                );
              })}
            </ul>
          </>
        )}

        <p className="mt-8 text-xs leading-relaxed text-slate-600">
          Реестр строится из публичных сканов и показывает только домен, оценку и дату -
          никаких приватных данных из отчётов. Владелец сайта может запросить исключение
          домена из реестра. Grade A присваивается автоматически по результатам 16 проверок.
        </p>
      </main>

      <footer className="mt-auto border-t border-slate-800/70 bg-[#070b13]">
        <div className="mx-auto px-4 py-6 text-center text-xs text-slate-500 sm:px-6">
          © {new Date().getFullYear()} AppSeal · независимый слой доверия для приложений, собранных с ИИ
        </div>
      </footer>
    </div>
  );
}
