import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { getRegistryEntries } from "@/lib/scanner/store";
import { buildDigest } from "@/lib/digest";
import { DigestView, DigestFooterLinks } from "./digest-view";

// SEO-ish weekly digest: static with a long TTL; the body renders inside the
// client DigestView (useLang + appseal-lang event) so the switcher works
// without giving up the static cache
export const revalidate = 3600;

export const metadata: Metadata = {
  title: "AppSeal - дайджест недели: кто поднял безопасность",
  description:
    "Недельный дайджест техосмотра: проекты, поднявшие класс за 7 дней, новички клуба A/A+ и объём проверок. Обновляется автоматически из живого реестра.",
  alternates: { canonical: "/digest" },
};

export default async function DigestPage() {
  const entries = await getRegistryEntries();
  const d = buildDigest(entries);

  return (
    <div className="flex min-h-screen flex-col text-slate-100">
      <SiteHeader />
      <DigestView d={d} />
      <footer className="mt-auto border-t border-slate-800/70 bg-[#070b13]">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-xs text-slate-500 sm:px-6">
          <span>AppSeal Engine · External Black-Box Security Scanner</span>
          <DigestFooterLinks />
        </div>
      </footer>
    </div>
  );
}
