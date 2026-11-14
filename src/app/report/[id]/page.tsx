import type { Metadata } from "next";
import { ScannerPage } from "@/components/scanner-page";
import { JsonLd } from "@/components/json-ld";
import { getScan, publicView } from "@/lib/scanner/store";
import type { ScanResult } from "@/lib/scanner/types";

// ISR: shared report links sit in the sitemap and get crawled repeatedly by
// bots; a cached render serves them from the CDN instead of re-rendering on
// the function origin (Fast Origin Transfer quota). 60s staleness is
// invisible - a scan is immutable once done.
export const revalidate = 60;

// Next 16: dynamic segments render on demand with no caching unless opted
// in; an empty generateStaticParams turns unknown ids into render-once,
// edge-cached ISR pages (blocking fallback)
export const dynamicParams = true;
export async function generateStaticParams() {
  return [];
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const scan = /^[a-z0-9-]{6,40}$/i.test(id) ? await getScan(id) : null;
  if (scan && scan.status === "done") {
    const title = `AppSeal: ${scan.host} - Класс ${scan.grade} (${scan.score}/100)`;
    const description = `Результаты техосмотра безопасности сайта ${scan.host}: 121 проверка гигиены, класс ${scan.grade}, ${scan.score} баллов из 100.`;
    const ogUrl = `/api/og?id=${scan.id}`;
    return {
      title,
      description,
      alternates: { canonical: `/report/${id}` },
      openGraph: {
        title,
        description,
        type: "website",
        images: [
          {
            url: ogUrl,
            width: 1200,
            height: 630,
            alt: `AppSeal ${scan.grade} - ${scan.host}`,
          },
        ],
      },
      twitter: {
        card: "summary_large_image",
        title,
        description,
        images: [ogUrl],
      },
    };
  }

  return {
    title: "AppSeal - техосмотр для приложений, собранных с ИИ",
    description:
      "AppSeal сканирует живое приложение на утечки секретов, открытые базы, дырявые админки и признаки заброшенности. Оценка A+-E и бейдж доверия за минуту.",
    alternates: { canonical: "/" },
  };
}

export default async function ReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  let initial: ScanResult | null = null;
  if (/^[a-z0-9-]{6,40}$/i.test(id)) {
    const scan = await getScan(id);
    if (scan) {
      // full findings stay private to the initiator (rkey model); shared
      // links render the public verification view, the initiator keeps the
      // full report through the in-session report key
      initial =
        scan.status === "done"
          ? publicView(scan)
          : { ...scan, rkey: undefined };
    }
  }
  return (
    <>
      <JsonLd />
      <ScannerPage initialScan={initial} />
    </>
  );
}
