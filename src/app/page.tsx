import type { Metadata } from "next";
import { ScannerPage } from "@/components/scanner-page";
import { JsonLd } from "@/components/json-ld";

// ISR rather than build-time static: Vercel stamps prerendered pages with
// `access-control-allow-origin: *`, which our own CORS check then flags on
// the homepage (-8 -> grade A). ISR pages (same serving path as /report and
// /registry) are served without that header. 1h revalidation keeps the
// function-origin render cost negligible.
export const revalidate = 3600;

// report links moved to /report/<id> with ISR - see next.config redirects
export const metadata: Metadata = {
  title: "AppSeal - техосмотр для приложений, собранных с ИИ",
  description:
    "AppSeal сканирует живое приложение на утечки секретов, открытые базы, дырявые админки и признаки заброшенности. Оценка A+-E и бейдж доверия за минуту.",
  alternates: { canonical: "/" },
};

export default function Home() {
  return (
    <>
      <JsonLd />
      <ScannerPage initialScan={null} />
    </>
  );
}
