import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { FixesView, FixesFooterLinks } from "./fixes-view";

// SEO landing pages: static with a long TTL. Language note: the body renders
// inside the client FixesView (useLang + appseal-lang event) so the switcher
// works without giving up the static cache
export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Как закрыть заголовки безопасности: конфиги для Vercel, Netlify, Cloudflare, nginx - AppSeal",
  description:
    "Готовые конфиги защитных заголовков (CSP, HSTS, COOP, X-Frame-Options) для Vercel, Next.js, Cloudflare Pages, Netlify, GitHub Pages и nginx - копипаст и деплой. Проверка сайта бесплатная.",
  alternates: { canonical: "/fixes" },
};

export default function FixesHubPage() {
  return (
    <div className="flex min-h-screen flex-col text-slate-100">
      <SiteHeader />
      <FixesView />
      <footer className="mt-auto border-t border-slate-800/70 bg-[#070b13]">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-xs text-slate-500 sm:px-6">
          <span>AppSeal Engine · External Black-Box Security Scanner</span>
          <FixesFooterLinks />
        </div>
      </footer>
    </div>
  );
}
