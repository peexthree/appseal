import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { getRegistryEntries } from "@/lib/scanner/store";
import { canonicalHost, dedupeRegistry, isReferenceSite } from "@/lib/registry";
import { getTrophyPath, GRADE_META } from "@/lib/scanner/grade";
import { pageLang } from "@/lib/lang-server";
import { VersusForm, VersusShare } from "./versus-form";

// reads the live registry; versus URLs carry query params so the page is
// server-rendered per request
export const dynamic = "force-dynamic";

const HOST_RE = /^[a-z0-9.-]+\.[a-z]{2,}$/;

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ a?: string; b?: string }>;
}): Promise<Metadata> {
  const { a, b } = await searchParams;
  if (a && b) {
    // one page per pair would flood the index: result URLs stay out of robots
    return {
      title: "AppSeal VS - сравнение безопасности двух сайтов",
      robots: { index: false, follow: true },
    };
  }
  return {
    title: "AppSeal VS - сравни безопасность двух сайтов",
    description:
      "Кто безопаснее: твой проект или сосед по деплою? Сравнение двух доменов по живому техосмотру AppSeal - 125 проверок, класс A+-E. Результат открывается ссылкой.",
    alternates: { canonical: "/versus" },
  };
}

interface Side {
  host: string;
  grade: string;
  score: number;
  ts: number;
}

async function loadSide(raw: string | undefined): Promise<Side | null | "unknown"> {
  if (!raw) return null;
  const host = canonicalHost(raw.replace(/^https?:\/\//, "").replace(/\/.*$/, ""));
  if (!host || host.length > 253 || !Boolean(host.match(HOST_RE))) return null;
  if (isReferenceSite(host)) return null;
  const all = dedupeRegistry(await getRegistryEntries());
  const entry = all.find((e) => e.host === host);
  return entry
    ? { host: entry.host, grade: entry.grade, score: entry.score, ts: entry.ts }
    : "unknown";
}

const D = {
  grade: { ru: "Класс", en: "Grade" },
  checked: { ru: "проверен ", en: "checked " },
  profileCta: { ru: "Профиль домена →", en: "Domain profile →" },
  h1: { ru: "Чей деплой безопаснее?", en: "Whose deploy is more secure?" },
  intro: {
    ru: "Введите два домена - сравним их живые классы техосмотра (125 проверок: секреты, заголовки, админки, живость, ИИ-гигиена). Сравнение можно отправить в чат готовой ссылкой.",
    en: "Enter two domains - we compare their live checkup grades (125 checks: secrets, headers, admin panels, liveness, AI hygiene). The comparison is shareable as a ready-made link.",
  },
  badFormat: {
    ru: "Проверьте формат адресов: только домен, без https и путей.",
    en: "Check the address format: bare domains only, no https or paths.",
  },
  unknownA: {
    ru: "Один из сайтов ещё не проходил техосмотр. Проверка бесплатная - запустите её на ",
    en: "One of the sites hasn't been through the checkup yet. The scan is free - run it on the ",
  },
  homeWord: { ru: "главной", en: "home page" },
  unknownB: {
    ru: " и возвращайтесь: класс появится здесь автоматически.",
    en: " and come back: the grade will appear here automatically.",
  },
  verdictWinA: { ru: " набирает больше на ", en: " wins by " },
  verdictWinB: { ru: " баллов из 100", en: " points out of 100" },
  draw: {
    ru: "Ничья - оба проекта набирают поровну. Такое бывает редко: 125 проверок строгие.",
    en: "It's a tie - both projects score exactly the same. That's rare: the 125 checks are strict.",
  },
  privacyA: {
    ru: "Сравнение показывает публичные классы и баллы. Детальные находки каждого скана остаются приватными у инициатора - ",
    en: "The comparison shows public grades and scores only. Detailed findings of every scan stay private to the initiator - ",
  },
  privacyWord: { ru: "модель приватности", en: "the privacy model" },
  privacyB: { ru: ".", en: "." },
  fStats: { ru: "статистика", en: "stats" },
  fFixes: { ru: "гайды по исправлению", en: "fix guides" },
} as const;

const dateFmt = {
  ru: new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }),
  en: new Intl.DateTimeFormat("en-US", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }),
};

function SideCard({ side, lang }: { side: Side; lang: "ru" | "en" }) {
  const gm = GRADE_META[side.grade as keyof typeof GRADE_META] ?? GRADE_META.E;
  return (
    <div className="appseal-glass-card flex-1 rounded-2xl p-6">
      <div className="flex items-center gap-4">
        <img src={getTrophyPath(side.grade)} alt={`AppSeal ${side.grade}`} width={64} height={64} className="h-16 w-16 object-contain" />
        <div className="min-w-0">
          <div className="truncate font-display text-lg font-extrabold text-slate-100">{side.host}</div>
          <div className="font-bold" style={{ color: gm.color }}>
            {D.grade[lang]} {side.grade} · {side.score}/100
          </div>
          <div className="text-[11px] text-slate-500">{D.checked[lang]}{dateFmt[lang].format(new Date(side.ts))}</div>
        </div>
      </div>
      <div className="appseal-track mt-4 h-3 overflow-hidden rounded-full">
        <div
          className="h-full rounded-full"
          style={{ width: `${(side.score / Math.max(100, 1)) * 100}%`, backgroundColor: gm.color }}
        />
      </div>
      <Link
        href={`/verified/${encodeURIComponent(side.host)}`}
        className="mt-4 inline-block text-xs font-semibold text-sky-400 transition hover:text-sky-300"
      >
        {D.profileCta[lang]}
      </Link>
    </div>
  );
}

export default async function VersusPage({
  searchParams,
}: {
  searchParams: Promise<{ a?: string; b?: string }>;
}) {
  const lang = await pageLang();
  const t = (k: keyof typeof D) => D[k][lang];
  const { a: rawA, b: rawB } = await searchParams;
  const a = await loadSide(rawA);
  const b = await loadSide(rawB);
  const ready = a && b && a !== "unknown" && b !== "unknown";
  const sides = ready ? ([a, b] as Side[]).sort((x, y) => y.score - x.score) : null;
  const winner = sides && sides[0].score !== sides[1].score ? sides[0] : null;

  const verdict = !ready
    ? null
    : winner
      ? `${winner.host}${t("verdictWinA")}${Math.abs(sides![0].score - sides![1].score)}${t("verdictWinB")}`
      : t("draw");

  return (
    <div className="flex min-h-screen flex-col text-slate-100">
      <SiteHeader lang={lang} />

      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10 sm:px-6">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-sky-400">AppSeal VS</p>
        <h1 className="mt-3 font-display text-3xl font-extrabold leading-tight sm:text-4xl">
          {t("h1")}
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-400">
          {t("intro")}
        </p>

        <VersusForm a={rawA ?? ""} b={rawB ?? ""} lang={lang} />

        {rawA && rawB && (a === null || b === null) ? (
          <p className="mt-6 rounded-xl border border-amber-400/30 bg-amber-400/5 p-4 text-sm text-amber-300">
            {t("badFormat")}
          </p>
        ) : null}

        {(a === "unknown" || b === "unknown") && (
          <div className="mt-6 rounded-xl appseal-glass-card p-5 text-sm text-slate-300">
            {t("unknownA")}
            <Link href="/" className="font-bold text-sky-400 hover:underline">{t("homeWord")}</Link>
            {t("unknownB")}
          </div>
        )}

        {sides && (
          <>
            <div className="mt-8 flex flex-col gap-4 sm:flex-row">
              <SideCard side={sides[0]} lang={lang} />
              <SideCard side={sides[1]} lang={lang} />
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <p className="font-display text-lg font-extrabold text-slate-100">{verdict}</p>
              <VersusShare lang={lang} />
            </div>
            <p className="mt-4 text-xs leading-relaxed text-slate-500">
              {t("privacyA")}
              <Link href="/legal" className="underline decoration-slate-600 hover:text-slate-300">{t("privacyWord")}</Link>
              {t("privacyB")}
            </p>
          </>
        )}
      </main>

      <footer className="mt-auto border-t border-slate-800/70 bg-[#070b13]">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-xs text-slate-500 sm:px-6">
          <span>AppSeal Engine · External Black-Box Security Scanner</span>
          <span className="inline-flex items-center gap-3">
            <Link href="/stats" className="transition hover:text-slate-400">{t("fStats")}</Link>
            <Link href="/fixes" className="transition hover:text-slate-400">{t("fFixes")}</Link>
          </span>
        </div>
      </footer>
    </div>
  );
}
