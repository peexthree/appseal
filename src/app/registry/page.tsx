import type { Metadata } from "next";
import { getRegistryEntries, redis, redisConfig } from "@/lib/scanner/store";
import { dedupeRegistry, isDofollow, isReferenceSite } from "@/lib/registry";
import RegistryList from "./registry-list";
import { SiteHeader } from "@/components/site-header";

// ISR: the catalog is a top bot crawl target and a dynamic render on every
// request burns the Fast Origin Transfer quota; 60s staleness is fine for a
// catalog fed by periodic scans. Language note: the page shell renders inside
// the client RegistryList (useLang + appseal-lang event) so the switcher works
// without giving up the ISR cache.
export const revalidate = 60;

export const metadata: Metadata = {
  title: "AppSeal - реестр просканированных приложений",
  description:
    "Публичный каталог vibe-приложений, прошедших техосмотр AppSeal: сотни сайтов с оценками A+-E, поиск по домену, дата скана. Классы A+ и A получают индексируемую ссылку из реестра.",
  alternates: { canonical: "/registry" },
};

export default async function RegistryPage() {
  const raw = await getRegistryEntries();
  // the catalog shows only AI-built projects: reference mega-sites (scanned
  // by demos) stay in storage but never render next to indie apps, legacy
  // www.-duplicates fold into the bare domain, and descriptions of hosts
  // below A are stripped from the payload entirely - the blur alone left the
  // text parseable in the source HTML, the privacy reward must not leak
  const entries = dedupeRegistry(raw)
    .filter((e) => !isReferenceSite(e.host))
    .map((e) => (isDofollow(e) ? e : { ...e, desc: undefined }));

  // living-registry heartbeat: how many auto scans ran in the last 24h
  let tickCount = 0;
  const tcfg = redisConfig();
  if (tcfg) {
    try {
      tickCount = Number(await redis(tcfg, ["GET", "appmot:pipeline:scans24h"])) || 0;
    } catch {
      /* counter is cosmetic */
    }
  }

  return (
    <div className="flex min-h-screen flex-col text-slate-100">
      <SiteHeader />
      <RegistryList entries={entries} tickCount={tickCount} />
    </div>
  );
}
