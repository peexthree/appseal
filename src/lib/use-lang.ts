"use client";

import { useSyncExternalStore } from "react";
import type { Lang } from "@/lib/scanner/types";

/**
 * Language for client views on the inner pages: seeds from the same
 * appseal-lang cookie/localStorage the navbar switcher writes, then follows
 * the appseal-lang event for instant switches without a server roundtrip.
 * useSyncExternalStore instead of a sync setState in an effect: no cascading
 * renders, and the SSR snapshot ("ru") keeps hydration stable.
 */
function subscribeLang(onChange: () => void): () => void {
  window.addEventListener("appseal-lang", onChange);
  return () => window.removeEventListener("appseal-lang", onChange);
}

function getLangSnapshot(): Lang {
  const m = document.cookie.match(/(?:^|; )appseal-lang=(ru|en)/);
  if (m) return m[1] as Lang;
  try {
    const saved = localStorage.getItem("appseal-lang");
    if (saved === "ru" || saved === "en") return saved;
  } catch {
    /* private mode */
  }
  return "ru";
}

function getLangServerSnapshot(): Lang {
  return "ru";
}

export function useLang(): Lang {
  return useSyncExternalStore(subscribeLang, getLangSnapshot, getLangServerSnapshot);
}
