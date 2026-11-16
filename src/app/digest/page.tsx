import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { getRegistryEntries } from "@/lib/scanner/store";
import { buildDigest } from "@/lib/digest";
import { getTrophyPath, GRADE_META } from "@/lib/scanner/grade";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "AppSeal - дайджест недели: кто поднял безопасность",
  description:
    "Недельный дайджест техосмотра: проекты, поднявшие класс за 7 дней, новички клуба A/A+ и объём проверок. Обновляется автоматически из живого реестра.",
  alternates: { canonical: "/digest" },
};

const dateFmt = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

export default async function DigestPage() {
  const entries = await getRegistryEntries();
  const d = buildDigest(entries);

  return (
    <div className="flex min-h-screen flex-col bg-[#090d16] text-slate-100">
      <SiteHeader />

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-sky-400">Недельный дайджест</p>
        <h1 className="mt-3 font-display text-3xl font-extrabold leading-tight sm:text-4xl">
          Кто поднял безопасность за 7 дней
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-slate-400">
          Считается автоматически из живого реестра: проекты, чей класс вырос между сканами недели,
          и сайты, вошедшие в клуб A/A+ с первого скана. Обновляется каждый час.
        </p>

        <div className="mt-6 rounded-2xl border border-slate-800 bg-[#111827] p-5">
          <div className="font-display text-3xl font-extrabold text-sky-400">{d.weekScans}</div>
          <div className="mt-1 text-xs text-slate-500">проверок за последние 7 дней</div>
        </div>

        <section className="mt-10">
          <h2 className="font-display text-xl font-extrabold">🟢 Подняли класс</h2>
          {d.namedImprovers.length === 0 && d.anonymousImproved === 0 ? (
            <p className="mt-3 text-sm text-slate-500">
              На этой неделе пока никто не вырос. Почините заголовки по{" "}
              <Link href="/fixes" className="text-sky-400 hover:underline">гайдам</Link> - и перепройдите скан: ваш
              проект может оказаться здесь первым.
            </p>
          ) : (
            <ul className="mt-4 space-y-2.5">
              {d.namedImprovers.map((i) => {
                const em = GRADE_META[i.to as keyof typeof GRADE_META];
                return (
                  <li key={i.host} className="flex items-center gap-4 rounded-xl border border-slate-800 bg-[#111827] px-4 py-3">
                    <img src={getTrophyPath(i.to)} alt={`AppSeal ${i.to}`} width={36} height={36} className="h-9 w-9 object-contain" />
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/verified/${encodeURIComponent(i.host)}`}
                        className="truncate text-sm font-semibold text-slate-100 transition hover:text-sky-400"
                      >
                        {i.host}
                      </Link>
                      <div className="text-xs text-slate-500">{dateFmt.format(new Date(i.ts))}</div>
                    </div>
                    <span className="font-mono text-xs text-slate-400">
                      {i.from} → <span style={{ color: em?.color }} className="font-bold">{i.to}</span>
                    </span>
                    <span className="font-mono text-xs text-slate-500">{i.score}/100</span>
                  </li>
                );
              })}
              {d.anonymousImproved > 0 ? (
                <li className="rounded-xl border border-slate-800 bg-[#111827] px-4 py-3 text-sm text-slate-400">
                  + ещё {d.anonymousImproved} проект(ов) улучшили класс -{" "}
                  <Link href="/registry" className="text-sky-400 hover:underline">имена открываются вместе с классом A</Link>
                </li>
              ) : null}
            </ul>
          )}
        </section>

        <section className="mt-10">
          <h2 className="font-display text-xl font-extrabold">🆕 Вошли в клуб A/A+ с первого скана</h2>
          {d.newA.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">Пока никто. 125 проверок строгие - но это чинится.</p>
          ) : (
            <ul className="mt-4 space-y-2.5">
              {d.newA.map((n) => {
                const em = GRADE_META[n.grade as keyof typeof GRADE_META];
                return (
                  <li key={n.host} className="flex items-center gap-4 rounded-xl border border-slate-800 bg-[#111827] px-4 py-3">
                    <img src={getTrophyPath(n.grade)} alt={`AppSeal ${n.grade}`} width={36} height={36} className="h-9 w-9 object-contain" />
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/verified/${encodeURIComponent(n.host)}`}
                        className="truncate text-sm font-semibold text-slate-100 transition hover:text-sky-400"
                      >
                        {n.host}
                      </Link>
                      <div className="text-xs text-slate-500">{dateFmt.format(new Date(n.ts))}</div>
                    </div>
                    <span className="font-bold" style={{ color: em?.color }}>{n.grade}</span>
                    <span className="font-mono text-xs text-slate-500">{n.score}/100</span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <div className="mt-10 rounded-2xl border border-sky-500/30 bg-[#0d1220] p-6">
          <p className="text-sm text-slate-300">
            Каждую неделю этот дайджест уходит в Telegram-канал. Хотите получить свой класс до следующего
            выпуска? Скан бесплатный.
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
          <span className="inline-flex flex-wrap items-center gap-3">
            <Link href="/stats" className="transition hover:text-slate-400">статистика</Link>
            <Link href="/registry" className="transition hover:text-slate-400">реестр</Link>
            <Link href="/fixes" className="transition hover:text-slate-400">гайды</Link>
            <Link href="/versus" className="transition hover:text-slate-400">versus</Link>
          </span>
        </div>
      </footer>
    </div>
  );
}
