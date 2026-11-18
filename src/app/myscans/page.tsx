import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { Send, ShieldAlert } from "@/components/icons/appseal-icons";
import { pageLang } from "@/lib/lang-server";
import { verifyChatToken } from "@/lib/myscans-token";
import { getChatPassHosts, getChatRedeemedHosts, listPaidPasses } from "@/lib/passes";
import { getLatestHostEntry } from "@/lib/scanner/store";
import type { Lang } from "@/lib/scanner/types";

// the page verifies a per-chat signed link token and reads live Redis data,
// so every request renders fresh
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const lang = await pageLang();
  return lang === "en"
    ? {
        title: "My domains - AppSeal",
        description:
          "The web cabinet that opens via a link from the Telegram bot: your scanned domains, their grades, latest check dates and pass terms. No sign-up - the link lives 24 hours.",
        alternates: { canonical: "/myscans" },
      }
    : {
        title: "Мои домены - AppSeal",
        description:
          "Веб-кабинет, который открывается по ссылке из Telegram-бота: ваши отсканированные домены, их классы, даты последних проверок и сроки пропусков. Без регистрации - ссылка живёт 24 часа.",
        alternates: { canonical: "/myscans" },
      };
}

const BOT_URL = "https://t.me/AppSeal_Monitor_Bot";

const D = {
  eyebrow: { ru: "Веб-кабинет", en: "Web cabinet" },
  title: { ru: "Мои домены", en: "My domains" },
  // honest mechanics note: no web accounts exist, access rides on the bot link
  hint: {
    ru: "Кабинет открыт по ссылке из бота - без регистрации. Ссылка живёт 24 часа.",
    en: "This cabinet opens via a link from the bot - no sign-up. The link lives for 24 hours.",
  },
  scoreLabel: { ru: "балл", en: "score" },
  lastScan: { ru: "последняя проверка", en: "last scan" },
  passUntil: { ru: "пасс до", en: "pass until" },
  noScan: {
    ru: "Свежего скана нет - проверьте домен ещё раз",
    en: "No fresh scan yet - run a new check on the domain",
  },
  emptyText: {
    ru: "Здесь появятся ваши домены - отсканируйте первый или купите пасс.",
    en: "Your domains will appear here - scan the first one or buy a pass.",
  },
  emptyScan: { ru: "Открыть сканер", en: "Open the scanner" },
  emptyBot: { ru: "Открыть бота", en: "Open the bot" },
  badTitle: { ru: "Ссылка просрочена или недействительна", en: "The link has expired or is invalid" },
  badText: {
    ru: "Попросите новую ссылку в боте командой /myscans",
    en: "Ask the bot for a fresh link with the /myscans command",
  },
  badBtn: { ru: "Открыть бота в Telegram", en: "Open the bot in Telegram" },
  footTag: { ru: "Веб-кабинет", en: "Web cabinet" },
  fHome: { ru: "главная", en: "home" },
  fStats: { ru: "статистика", en: "stats" },
  fLegal: { ru: "правила", en: "legal" },
} as const;

/** grade chip, same translucent style as the public registry */
const GRADE_CHIP: Record<string, string> = {
  "A+": "bg-[#C084FC]/15 text-[#C084FC] border-[#C084FC]/40",
  A: "bg-[#34D399]/15 text-[#34D399] border-[#34D399]/40",
  B: "bg-[#38BDF8]/15 text-[#38BDF8] border-[#38BDF8]/40",
  C: "bg-[#FBBF24]/15 text-[#FBBF24] border-[#FBBF24]/40",
  D: "bg-[#FB923C]/15 text-[#FB923C] border-[#FB923C]/40",
  E: "bg-[#F87171]/15 text-[#F87171] border-[#F87171]/40",
};

interface HostCard {
  host: string;
  grade: string | null;
  score: number | null;
  ts: number | null;
  /** active pass expiry bound to this chat (ISO string), null when none */
  until: string | null;
}

/** Domains visible to this chat + the newest registry data for each: hosts
 *  bound to a pass, hosts redeemed from a pack in this chat and paid passes
 *  bound to the chat (single purchases bind through the bot payment check).
 *  Every lookup is best-effort: a dead Redis yields empty sets and null
 *  entries, the page renders honest empty states instead of erroring. */
async function loadCabinet(chatId: string): Promise<HostCard[]> {
  const [passHosts, redeemedHosts, paidPasses] = await Promise.all([
    getChatPassHosts(chatId),
    getChatRedeemedHosts(chatId),
    listPaidPasses(),
  ]);
  const chatPaidHosts = paidPasses.filter((p) => p.chatId === chatId).map((p) => p.host);
  // the "pass until" line rides only on still-active passes - an expired
  // date would read as a live entitlement
  const untilByHost = new Map<string, string>();
  for (const p of paidPasses) {
    if (p.chatId === chatId && new Date(p.until).getTime() > Date.now()) {
      untilByHost.set(p.host, p.until);
    }
  }
  const hosts = [...new Set([...passHosts, ...redeemedHosts, ...chatPaidHosts])];
  return Promise.all(
    hosts.map(async (host) => {
      const entry = await getLatestHostEntry(host);
      return {
        host,
        grade: entry?.grade ?? null,
        score: entry?.score ?? null,
        ts: entry?.ts ?? null,
        until: untilByHost.get(host) ?? null,
      };
    }),
  );
}

export default async function MyScansPage({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const lang: Lang = await pageLang();
  const sp = await searchParams;
  // the only way in: a signed link the bot handed out; no token, a stale one
  // (24h TTL) or a bad signature all land on the same honest page
  const chatId = typeof sp.t === "string" ? verifyChatToken(sp.t) : null;
  const t = (k: keyof typeof D) => D[k][lang];
  // dates are formatted server-side with the page locale (the /reviews
  // pattern): no timezone flash, consistent with the rest of the site
  const locale = lang === "en" ? "en-US" : "ru-RU";
  const fmtDate = (iso: string | number) =>
    new Date(iso).toLocaleString(locale, { day: "numeric", month: "long", year: "numeric" });

  const cards = chatId ? await loadCabinet(chatId) : [];

  return (
    <div className="flex min-h-screen flex-col text-slate-100">
      <SiteHeader lang={lang} />

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6 sm:py-14">
        {!chatId ? (
          <section className="appseal-glass-card mx-auto mt-6 max-w-lg rounded-2xl p-8 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-400">
              <ShieldAlert className="h-6 w-6" />
            </div>
            <h1 className="font-display mt-4 text-xl font-extrabold text-slate-100 sm:text-2xl">
              {t("badTitle")}
            </h1>
            <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-slate-400">
              {t("badText")}
            </p>
            <a
              href={BOT_URL}
              target="_blank"
              rel="noopener"
              className="mt-5 inline-flex items-center gap-2 rounded-xl bg-sky-400 px-5 py-2.5 text-sm font-bold text-[#090d16] transition hover:bg-sky-300"
            >
              <Send className="h-4 w-4" />
              {t("badBtn")}
            </a>
          </section>
        ) : (
          <>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-sky-400">{t("eyebrow")}</p>
            <h1 className="font-display mt-3 text-3xl font-extrabold leading-tight sm:text-4xl">
              {t("title")}
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-400">{t("hint")}</p>

            {cards.length > 0 ? (
              <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {cards.map((c) => (
                  <div key={c.host} className="appseal-glass-card flex flex-col rounded-2xl p-5">
                    <div className="flex items-center justify-between gap-3">
                      <Link
                        href={`/verified/${c.host}`}
                        className="min-w-0 truncate font-mono text-sm font-bold text-slate-100 transition hover:text-sky-400"
                      >
                        {c.host}
                      </Link>
                      {c.grade && (
                        <span
                          className={`inline-flex h-7 min-w-8 shrink-0 items-center justify-center rounded-md border px-2 font-display text-sm font-extrabold ${
                            GRADE_CHIP[c.grade] ?? "bg-slate-800 text-slate-300 border-slate-700"
                          }`}
                        >
                          {c.grade}
                        </span>
                      )}
                    </div>
                    <dl className="mt-3 space-y-1.5 text-[13px]">
                      {c.score !== null && (
                        <div className="flex items-baseline justify-between gap-3">
                          <dt className="text-slate-500">{t("scoreLabel")}</dt>
                          <dd className="font-mono font-semibold text-slate-200">{c.score}/100</dd>
                        </div>
                      )}
                      {c.ts !== null && (
                        <div className="flex items-baseline justify-between gap-3">
                          <dt className="text-slate-500">{t("lastScan")}</dt>
                          <dd className="text-slate-300">{fmtDate(c.ts)}</dd>
                        </div>
                      )}
                      {c.until && (
                        <div className="flex items-baseline justify-between gap-3">
                          <dt className="text-slate-500">{t("passUntil")}</dt>
                          <dd className="text-slate-300">{fmtDate(c.until)}</dd>
                        </div>
                      )}
                    </dl>
                    {c.ts === null && <p className="mt-2 text-[11px] text-slate-500">{t("noScan")}</p>}
                  </div>
                ))}
              </div>
            ) : (
              <div className="appseal-glass-card mt-8 rounded-2xl p-8 text-center">
                <p className="text-sm leading-relaxed text-slate-400">{t("emptyText")}</p>
                <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
                  <Link
                    href="/"
                    className="inline-flex items-center gap-2 rounded-xl bg-sky-400 px-5 py-2.5 text-sm font-bold text-[#090d16] transition hover:bg-sky-300"
                  >
                    {t("emptyScan")}
                  </Link>
                  <a
                    href={BOT_URL}
                    target="_blank"
                    rel="noopener"
                    className="inline-flex items-center gap-2 rounded-xl border border-slate-700 px-5 py-2.5 text-sm font-bold text-slate-200 transition hover:border-slate-500 hover:text-slate-100"
                  >
                    {t("emptyBot")}
                  </a>
                </div>
              </div>
            )}
          </>
        )}
      </main>

      <footer className="mt-auto border-t border-slate-800/70 bg-[#070b13]">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-4 px-4 py-8 text-center sm:flex-row sm:px-6 sm:text-left">
          <div className="space-y-1">
            <p className="text-xs text-slate-500">
              © {new Date().getFullYear()} AppSeal · {t("footTag")}
            </p>
            <p className="font-mono text-[10px] text-slate-700">
              <Link href="/" className="transition hover:text-slate-500">{t("fHome")}</Link> · <Link href="/stats" className="transition hover:text-slate-500">{t("fStats")}</Link> · <Link href="/legal" className="transition hover:text-slate-500">{t("fLegal")}</Link>
            </p>
          </div>
          <div className="shrink-0 transition-transform hover:scale-[1.02]">
            <a
              href="/verified/appseal.online"
              target="_blank"
              rel="noopener"
              title="AppSeal Security Verified - live grade"
              className="inline-block"
            >
              <img
                src="/api/badge?host=appseal.online"
                alt="AppSeal Verified"
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
