import type { Metadata } from "next";
import { ScannerPage } from "@/components/scanner-page";
import { JsonLd } from "@/components/json-ld";

// ISR with a short revalidate, not build-time static: Vercel's static layer
// stamps every prerendered file with `access-control-allow-origin: *`, and
// the seeded ISR entry inherits that header until the first revalidation
// replaces it with a function render (fresh renders have no such header).
// Our own CORS check probes the homepage, so a long-lived seed would keep
// the site at grade A (-8). 2 min keeps the seeded window negligible.
export const revalidate = 120;

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
