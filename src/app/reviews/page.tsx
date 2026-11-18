import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { pageLang } from "@/lib/lang-server";
import { listApprovedReviews } from "@/lib/db/index";
import { ReviewsView, type ReviewCard } from "./reviews-view";

// the page reads the appseal-lang cookie and the reviews table (new approvals
// must show up on the next visit), so it renders dynamically per request
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const lang = await pageLang();
  return lang === "en"
    ? {
        title: "AppSeal - Reviews",
        description:
          "What app owners say after their AppSeal inspection. Every review is published after a short manual check - no invented quotes, the showcase grows review by review.",
        alternates: { canonical: "/reviews" },
      }
    : {
        title: "Отзывы - AppSeal",
        description:
          "Что говорят владельцы приложений после техосмотра AppSeal. Каждый отзыв публикуется после короткой ручной проверки - никаких выдуманных цитат, витрина растёт отзыв за отзывом.",
        alternates: { canonical: "/reviews" },
      };
}

const D = {
  footTag: { ru: "Отзывы пользователей", en: "User reviews" },
  fHome: { ru: "главная", en: "home" },
  fStats: { ru: "статистика", en: "stats" },
  fLegal: { ru: "правила", en: "legal" },
} as const;

export default async function ReviewsPage() {
  const lang = await pageLang();
  const t = (k: keyof typeof D) => D[k][lang];
  const rows = await listApprovedReviews(50);
  // dates are formatted on the server with the page locale: no hydration
  // mismatch (server vs client timezone) and no empty flash before hydration
  const reviews: ReviewCard[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    rating: Math.max(1, Math.min(5, r.rating)),
    host: r.host,
    body: r.body,
    date: new Date(r.createdAt).toLocaleString(lang === "en" ? "en-US" : "ru-RU", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }),
  }));

  return (
    <div className="flex min-h-screen flex-col text-slate-100">
      <SiteHeader lang={lang} />

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6 sm:py-14">
        <ReviewsView reviews={reviews} lang={lang} />
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
