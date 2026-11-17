"use client";

import { useEffect, useState } from "react";
import type { Lang } from "@/lib/scanner/types";

/**
 * Language for client views on the inner pages: seeds from the same
 * appseal-lang cookie/localStorage the navbar switcher writes, then follows
 * the appseal-lang event for instant switches without a server roundtrip.
 */
export function useLang(): Lang {
  const [lang, setLang] = useState<Lang>("ru");
  useEffect(() => {
    const read = (): Lang => {
      const m = document.cookie.match(/(?:^|; )appseal-lang=(ru|en)/);
      if (m) return m[1] as Lang;
      try {
        const saved = localStorage.getItem("appseal-lang");
        if (saved === "ru" || saved === "en") return saved;
      } catch {
        /* private mode */
      }
      return "ru";
    };
    setLang(read());
    const on = (e: Event) => setLang((e as CustomEvent<Lang>).detail);
    window.addEventListener("appseal-lang", on);
    return () => window.removeEventListener("appseal-lang", on);
  }, []);
  return lang;
}
