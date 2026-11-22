"use client";

import { useEffect } from "react";
import type { Lang } from "@/lib/scanner/types";

/**
 * Server pages render in the pageLang() cookie language, but layout.tsx
 * hardcodes <html lang="ru"> - an EN render (cookie appseal-lang=en) shipped
 * with a ru document language, and every useLang() consumer on the page (the
 * cookie banner, the navbar) resolved back to Russian. This no-visual-output
 * helper syncs the document language and broadcasts the switch so those
 * consumers re-resolve.
 */
export function HtmlLangSync({ lang }: { lang: Lang }) {
  useEffect(() => {
    if (document.documentElement.lang !== lang) {
      document.documentElement.lang = lang;
      window.dispatchEvent(new CustomEvent("appseal-lang"));
    }
  }, [lang]);
  return null;
}
