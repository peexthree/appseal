import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { getRegistryEntries } from "@/lib/scanner/store";
import { canonicalHost, dedupeRegistry, isDofollow, type RegistryEntry } from "@/lib/registry";
import { getTrophyPath, GRADE_META } from "@/lib/scanner/grade";

// the profile reads the live registry and refreshes as new scans land
export const revalidate = 300;
export const dynamicParams = true;
export async function generateStaticParams() {
  return [];
}

const HOST_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i;

const dateFmt = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

async function loadHostHistory(rawHost: string): Promise<RegistryEntry[]> {
  if (!HOST_RE.test(rawHost) || rawHost.length > 100) return [];
  const host = canonicalHost(rawHost);
  const all = await getRegistryEntries();
  return all
    .filter((e) => canonicalHost(e.host) === host)
    .sort((a, b) => a.ts - b.ts);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ host: string }>;
}): Promise<Metadata> {
  const { host: rawHost } = await params;
  const host = canonicalHost(rawHost);
  const history = await loadHostHistory(rawHost);
  const latest = history.length ? history[history.length - 1] : null;
  // A/A+ profiles are indexable proof pages (brand searches); sub-A ones stay
  // out of the index - the registry blurs them for the same reason
  const robots = latest && isDofollow(latest) ? undefined : { robots: { index: false, follow: false } };
  if (!latest) {
    return {
      title: `AppSeal - ${host} ещё не просканирован`,
      description: `Сайт ${host} пока не проходил техосмотр AppSeal. Запустите бесплатную проверку и получите оценку A+-E за минуту.`,
      alternates: { canonical: `/verified/${host}` },
      ...robots,
    };
  }
  const meta = GRADE_META[latest.grade as keyof typeof GRADE_META];
  return {
    title: `AppSeal: ${host} - Класс ${latest.grade} (${latest.score}/100)`,
    description: `Публичный профиль безопасности домена ${host}: класс ${latest.grade} (${meta?.label.ru ?? ""}), история проверок AppSeal. ${history.length} проверок с ${dateFmt.format(new Date(history[0].ts))} года.`,
    alternates: { canonical: `/verified/${host}` },
    // live OG trophy: social previews show the current grade of the domain
    openGraph: { images: [`/api/og?host=${encodeURIComponent(host)}`] },
    twitter: { card: "summary_large_image", images: [`/api/og?host=${encodeURIComponent(host)}`] },
    ...robots,
  };
}

export default async function VerifiedPage({
  params,
}: {
  params: Promise<{ host: string }>;
}) {
  const { host: rawHost } = await params;
  const host = canonicalHost(rawHost);
  const history = await loadHostHistory(rawHost);
  const latest = history.length ? history[history.length - 1] : null;
  const dofollow = latest ? isDofollow(latest) : false;
  const gm = latest ? GRADE_META[latest.grade as keyof typeof GRADE_META] : null;

  return (
    <div className="flex min-h-screen flex-col bg-[#090d16] text-slate-100">
      <SiteHeader />

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-12 sm:px-6">
        {latest && gm ? (
          <>
            <div className="flex items-center gap-2">
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-sky-400">
                Публичный профиль безопасности
              </p>
              {dofollow && (
                <span className="rounded border border-[#34D399]/30 bg-[#34D399]/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#34D399]">
                  dofollow
                </span>
              )}
            </div>
            <div className="mt-4 flex flex-col items-start gap-6 rounded-2xl border border-slate-800 bg-[#111827] p-6 sm:flex-row sm:items-center sm:p-8">
              <img
                src={getTrophyPath(latest.grade)}
                alt={`AppSeal ${latest.grade}`}
                width={112}
                height={112}
                className="h-28 w-28 shrink-0 object-contain drop-shadow-[0_8px_24px_rgba(0,0,0,0.7)]"
              />
              <div className="min-w-0 flex-1">
                <h1 className="font-display truncate text-2xl font-extrabold text-slate-50 sm:text-3xl">
                  {host}
                </h1>
                <p className="mt-1.5 font-bold" style={{ color: gm.color }}>
                  Класс {latest.grade} · {latest.score}/100 · {gm.label.ru}
                </p>
                <p className="mt-2 text-xs leading-relaxed text-slate-400">
                  {gm.description.ru}
                </p>
                <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
                  Оценка присваивается автоматически внешним движком AppSeal по 125 проверкам
                  безопасности. Проверка была безрезультатной?{" "}
                  <Link href="/legal" className="underline decoration-slate-600 hover:text-slate-300">
                    Владелец может запросить исключение
                  </Link>
                  .
                </p>
              </div>
            </div>

            {history.length >= 2 ? (
              <div className="mt-8 rounded-2xl border border-slate-800 bg-[#111827] p-5">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Динамика балла</p>
                <div className="mt-3 flex h-24 items-end gap-1.5">
                  {history.map((e) => {
                    const em = GRADE_META[e.grade as keyof typeof GRADE_META];
                    return (
                      <div
                        key={e.id}
                        className="flex-1 rounded-t transition-all hover:opacity-80"
                        style={{
                          height: `${Math.max(e.score, 3)}%`,
                          backgroundColor: em?.color ?? "#64748B",
                          opacity: 0.75,
                        }}
                        title={`${dateFmt.format(new Date(e.ts))}: ${e.grade} · ${e.score}/100`}
                      />
                    );
                  })}
                </div>
                <div className="mt-1.5 flex justify-between font-mono text-[9px] text-slate-600">
                  <span>{dateFmt.format(new Date(history[0].ts))}</span>
                  <span>{dateFmt.format(new Date(latest.ts))}</span>
                </div>
              </div>
            ) : null}

            <div className="mt-6 rounded-2xl border border-sky-500/30 bg-[#0d1220] p-5">
              <p className="text-sm text-slate-300">
                Хотите поднять класс? Самые частые провалы - защитные заголовки, чинятся одним конфигом:{" "}
                <Link href="/fixes" className="font-bold text-sky-400 hover:underline">
                  готовые конфиги под ваш хостинг →
                </Link>{" "}
                Или посмотрите, как домен выглядит на фоне другого:{" "}
                <Link href={`/versus?a=${encodeURIComponent(host)}`} className="font-bold text-sky-400 hover:underline">
                  сравнить сайты →
                </Link>
              </p>
            </div>

            <h2 className="font-display mt-10 text-xl font-extrabold">История проверок</h2>
            <ul className="mt-4 divide-y divide-slate-800/70 overflow-hidden rounded-2xl border border-slate-800 bg-[#111827]">
              {history.map((e) => {
                const em = GRADE_META[e.grade as keyof typeof GRADE_META];
                const first = e.id === history[0].id;
                const last = e.id === latest.id;
                return (
                  <li key={e.id} className="flex items-center gap-4 px-5 py-3.5">
                    <img
                      src={getTrophyPath(e.grade)}
                      alt={`AppSeal ${e.grade}`}
                      width={36}
                      height={36}
                      className="h-9 w-9 object-contain"
                    />
                    <span
                      className="inline-flex h-7 min-w-8 items-center justify-center rounded-md border px-2 font-display text-sm font-extrabold"
                      style={{ color: em?.color, borderColor: `${em?.color}66`, backgroundColor: `${em?.color}1a` }}
                    >
                      {e.grade}
                    </span>
                    <span className="font-mono text-sm font-bold text-slate-200">{e.score}/100</span>
                    <span className="flex-1 text-sm text-slate-400">{dateFmt.format(new Date(e.ts))}</span>
                    <Link
                      href={`/report/${e.id}`}
                      className="text-xs font-semibold text-sky-400 transition hover:text-sky-300"
                    >
                      {first ? "Первичный скан →" : last ? "Подтвердить подлинность →" : "Верифицировать →"}
                    </Link>
                  </li>
                );
              })}
            </ul>

            <p className="mt-6 text-xs leading-relaxed text-slate-500">
              Профиль показывает только класс, балл и дату - перечень находок всегда остаётся у
              инициатора скана. Подробности модели:{" "}
              <Link href="/legal" className="underline decoration-slate-600 hover:text-slate-300">правила и приватность</Link>
              {" "}· живые цифры по всем проектам:{" "}
              <Link href="/stats" className="underline decoration-slate-600 hover:text-slate-300">статистика</Link>.
            </p>
          </>
        ) : (
          <div className="mt-6 rounded-2xl border border-slate-800 bg-[#111827] p-10 text-center">
            <h1 className="font-display text-2xl font-extrabold text-slate-50">{host}</h1>
            <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-slate-400">
              Этот сайт ещё не проходил техосмотр AppSeal. Проверка бесплатная: внешний движок
              оценит безопасность и выдаст класс A+-E за минуту.
            </p>
            <Link
              href={`/?domain=${encodeURIComponent(host)}`}
              className="mt-5 inline-block rounded-md bg-sky-400 px-5 py-2.5 text-sm font-bold text-[#090d16] transition hover:bg-sky-300"
            >
              Проверить этот сайт
            </Link>
          </div>
        )}
      </main>

      <footer className="mt-auto border-t border-slate-800/70 bg-[#070b13]">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-xs text-slate-500 sm:px-6">
          <span>AppSeal Engine · External Black-Box Security Scanner</span>
          <span className="inline-flex items-center gap-1.5">
            профиль домена · <Link href="/registry" className="transition hover:text-slate-400">реестр</Link>
          </span>
        </div>
      </footer>
    </div>
  );
}
