import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { CiView, CiFooterLinks } from "./ci-view";

// static doc page; the body renders inside the client CiView (useLang +
// appseal-lang event) so the switcher works without giving up the cache
export const revalidate = 3600;

export const metadata: Metadata = {
  title: "AppSeal в CI: GitHub Action с грейд-гейтом и бейджем для README",
  description:
    "Готовый GitHub Action: каждый пуш проходит техосмотр AppSeal, сборка падает при классе ниже B, бейдж с живым классом ставится в README. Настройка за 3 минуты.",
  alternates: { canonical: "/ci" },
};

export default function CiPage() {
  return (
    <div className="flex min-h-screen flex-col text-slate-100">
      <SiteHeader />
      <CiView />
      <footer className="mt-auto border-t border-slate-800/70 bg-[#070b13]">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-xs text-slate-500 sm:px-6">
          <span>AppSeal Engine · External Black-Box Security Scanner</span>
          <CiFooterLinks />
        </div>
      </footer>
    </div>
  );
}
