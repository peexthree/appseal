import type { Metadata } from "next";
import RegistryList from "./registry-list";
import { SiteHeader } from "@/components/site-header";
import { HtmlLangSync } from "@/components/html-lang-sync";
import { getRegistryEntriesCached, readChecksLast24h } from "@/lib/scanner/store";
import {
  dedupeRegistry,
  filterRegistryEntries,
  isDofollow,
  isReferenceSite,
  isRegistryChipKey,
  platformBucketOf,
  type RegistryChipKey,
} from "@/lib/registry";
import { pageLang } from "@/lib/lang-server";

// URL-driven filters/pagination/search: with the 16k+-host registry the whole
// catalog no longer fits a client payload, so the server slices one page per
// request (ISR had to go - searchParams make the route dynamic anyway).
// Language note: the shell renders via pageLang (cookie), the switcher
// reloads the page and the next render picks the new language up.
export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function pickParam(sp: Record<string, string | string[] | undefined>, key: string): string | undefined {
  const v = sp[key];
  return Array.isArray(v) ? v[0] : v;
}

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  const sp = await searchParams;
  const deep =
    (Number(pickParam(sp, "page")) || 1) > 1 ||
    Boolean(pickParam(sp, "q")) ||
    Boolean(pickParam(sp, "platform"));
  const base: Metadata = {
    title: "AppSeal - реестр просканированных приложений",
    description:
      "Публичный каталог vibe-приложений, прошедших техосмотр AppSeal: тысячи сайтов с оценками A+-E, поиск по домену, дата скана. Классы A+ и A получают индексируемую ссылку из реестра.",
    alternates: { canonical: "/registry" },
  };
  // paginated/filtered facets are a crawl trap: index only the clean page
  if (deep) {
    return { ...base, robots: { index: false, follow: true } };
  }
  return base;
}

export default async function RegistryPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const lang = await pageLang();
  const chipParam = pickParam(sp, "platform");
  const chip: RegistryChipKey = isRegistryChipKey(chipParam) ? chipParam : "all";
  const q = (pickParam(sp, "q") ?? "").slice(0, 100);

  const raw = await getRegistryEntriesCached();
  // the catalog shows only AI-built projects: reference mega-sites (scanned
  // by demos) stay in storage but never render next to indie apps, legacy
  // www.-duplicates fold into the bare domain
  const catalog = dedupeRegistry(raw).filter((e) => !isReferenceSite(e.host));

  const chipCounts: Record<RegistryChipKey, number> = {
    all: catalog.length,
    top: catalog.filter((e) => isDofollow(e)).length,
    custom: 0,
    lovable: 0,
    github: 0,
    vercel: 0,
    other: 0,
  };
  for (const e of catalog) chipCounts[platformBucketOf(e)] += 1;

  const PAGE_SIZE = 24;
  // descriptions of hosts below A are stripped from the payload entirely -
  // the blur alone left the text parseable in the source HTML, the privacy
  // reward must not leak
  const filtered = filterRegistryEntries(catalog, { chip, q }).map((e) =>
    isDofollow(e) ? e : { ...e, desc: undefined },
  );
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const page = Math.min(Math.max(1, Number(pickParam(sp, "page")) || 1), pages);
  const rows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // living-registry heartbeat: honest "checks in the last 24 hours" from the
  // hourly activity buckets (the old pipeline-tick counter saw only its own
  // submissions, not the batch runs)
  const tickCount = await readChecksLast24h();

  return (
    <div className="flex min-h-screen flex-col text-slate-100">
      <HtmlLangSync lang={lang} />
      <SiteHeader lang={lang} />
      <RegistryList
        lang={lang}
        rows={rows}
        total={filtered.length}
        pages={pages}
        page={page}
        chip={chip}
        q={q}
        chipCounts={chipCounts}
        tickCount={tickCount}
      />
    </div>
  );
}
