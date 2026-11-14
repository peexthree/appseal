import type { Metadata } from "next";
import { ScannerPage } from "@/components/scanner-page";
import { JsonLd } from "@/components/json-ld";

// fully static: the landing is the most crawled URL and every dynamic render
// pushes the whole HTML through the function -> edge pipe (Fast Origin
// Transfer quota); report links moved to /report/<id> with ISR instead
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
