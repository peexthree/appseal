import { ScannerPage } from "@/components/scanner-page";
import { getScan } from "@/lib/scanner/store";
import type { ScanResult } from "@/lib/scanner/types";

export const dynamic = "force-dynamic";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ report?: string }>;
}) {
  const { report } = await searchParams;
  let initial: ScanResult | null = null;
  if (report && /^[a-z0-9-]{6,40}$/i.test(report)) {
    // shared report links (?report=<id>) render the stored scan server-side
    initial = await getScan(report);
  }
  return <ScannerPage initialScan={initial} />;
}
