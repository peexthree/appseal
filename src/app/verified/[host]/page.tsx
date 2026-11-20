import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { getLatestHostEntry } from "@/lib/scanner/store";
import { canonicalHost, isDofollow, type RegistryEntry } from "@/lib/registry";
import { hostScanHistory } from "@/lib/db";
import { GRADE_META } from "@/lib/scanner/grade";
import { HostView } from "./host-view";

// the profile reads the live registry and refreshes as new scans land.
// Language note: the body renders inside the client HostView (useLang +
// appseal-lang event) so the ISR cache and SEO stay intact
export const revalidate = 300;
export const dynamicParams = true;
export async function generateStaticParams() {
  return [];
}

const HOST_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i;

const dateFmt = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});

// russian plural forms: 1 проверка / 2-4 проверки / 5+ проверок (11-14 -> проверок)
function ruPlural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
  return many;
}

async function loadHostHistory(rawHost: string): Promise<RegistryEntry[]> {
  if (!HOST_RE.test(rawHost) || rawHost.length > 100) return [];
  const host = canonicalHost(rawHost);
  // durable archive first: the full per-host history, including scans that
  // already fell out of the registry window; one O(1) hostlatest lookup
  // covers the live edge (a fresh scan not yet mirrored to PG)
  const dbRows = await hostScanHistory(host);
  if (dbRows !== null) {
    const rows: RegistryEntry[] = dbRows.map((r) => ({
      host,
      grade: r.grade,
      score: r.score,
      ts: r.ts,
      id: r.id,
    }));
    const live = await getLatestHostEntry(host);
    if (live && !rows.some((r) => r.id === live.id)) rows.push(live);
    return rows.sort((a, b) => a.ts - b.ts);
  }
  // no database: the live-rank mirror still resolves the latest scan
  const latest = await getLatestHostEntry(host);
  return latest ? [latest] : [];
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
  const firstScan = new Date(history[0].ts);
  return {
    title: `AppSeal: ${host} - Класс ${latest.grade} (${latest.score}/100)`,
    description: `Публичный профиль безопасности домена ${host}: класс ${latest.grade} (${meta?.label.ru ?? ""}), история проверок AppSeal. ${history.length} ${ruPlural(history.length, "проверка", "проверки", "проверок")} с ${dateFmt.format(firstScan)} ${firstScan.getUTCFullYear()} года.`,
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

  return (
    <div className="flex min-h-screen flex-col text-slate-100">
      <SiteHeader />
      <HostView host={host} history={history} latest={latest} />
    </div>
  );
}
