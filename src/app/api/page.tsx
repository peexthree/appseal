import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { ApiView, ApiFooterLinks } from "./api-view";

// static doc page; the body renders inside the client ApiView (useLang +
// appseal-lang event) so the switcher works without giving up the cache
export const revalidate = 3600;

export const metadata: Metadata = {
  title: "AppSeal API: живой класс домена в JSON и бейдж для сайта",
  description:
    "Публичный JSON API AppSeal: GET /api/verify отдаёт актуальную оценку A+-E любого домена из реестра, GET /api/badge рисует бейдж с живым классом. Без ключей и регистрации.",
  alternates: { canonical: "/api" },
};

export default function ApiPage() {
  return (
    <div className="flex min-h-screen flex-col text-slate-100">
      <SiteHeader />
      <ApiView />
      <footer className="mt-auto border-t border-slate-800/70 bg-[#070b13]">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-xs text-slate-500 sm:px-6">
          <span>AppSeal Engine · External Black-Box Security Scanner</span>
          <ApiFooterLinks />
        </div>
      </footer>
    </div>
  );
}
