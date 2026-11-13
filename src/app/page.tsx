import type { Metadata } from "next";
import { ScannerPage } from "@/components/scanner-page";
import { getScan, publicView } from "@/lib/scanner/store";
import type { ScanResult } from "@/lib/scanner/types";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ report?: string; key?: string }>;
}): Promise<Metadata> {
  const { report } = await searchParams;
  if (report && /^[a-z0-9-]{6,40}$/i.test(report)) {
    const scan = await getScan(report);
    if (scan) {
      const title = `AppSeal: ${scan.host} — Класс ${scan.grade} (${scan.score}/100)`;
      const description = `Результаты техосмотра безопасности сайта ${scan.host}: 24 проверки гигиены, класс ${scan.grade}, ${scan.score} баллов из 100.`;
      const ogUrl = `/api/og?id=${scan.id}`;
      return {
        title,
        description,
        openGraph: {
          title,
          description,
          type: "website",
          images: [
            {
              url: ogUrl,
              width: 1200,
              height: 630,
              alt: `AppSeal ${scan.grade} — ${scan.host}`,
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
  }

  return {
    title: "AppSeal — техосмотр для приложений, собранных с ИИ",
    description:
      "AppSeal сканирует живое приложение на утечки секретов, открытые базы, дырявые админки и признаки заброшенности. Оценка A+–E и бейдж доверия за минуту.",
  };
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ report?: string; key?: string }>;
}) {
  const { report, key } = await searchParams;
  let initial: ScanResult | null = null;
  let reportKey: string | undefined;
  if (report && /^[a-z0-9-]{6,40}$/i.test(report)) {
    // shared report links (?report=<id>) render the stored scan server-side;
    // full findings require the initiator's report key, otherwise the public
    // verification view only
    const scan = await getScan(report);
    if (scan?.status === "done") {
      if (scan.rkey && key && scan.rkey === key) {
        reportKey = key;
      } else {
        initial = publicView(scan);
      }
    } else if (scan) {
      initial = { ...scan, rkey: undefined };
    }
  }
  return <ScannerPage initialScan={initial} initialReportKey={reportKey} />;
}
