import { cookies } from "next/headers";
import type { Lang } from "@/lib/scanner/types";

/**
 * Inner pages render in the appseal-lang cookie language written by the
 * navbar switcher (ru default). Server counterpart of useLang().
 */
export async function pageLang(): Promise<Lang> {
  try {
    const store = await cookies();
    return store.get("appseal-lang")?.value === "en" ? "en" : "ru";
  } catch {
    return "ru";
  }
}
