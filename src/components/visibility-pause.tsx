"use client";

import { useEffect } from "react";

/**
 * Freeze the page while the tab is hidden: toggles the html.appseal-idle
 * class (CSS pauses the decorative keyframe loops) and pauses/resumes the
 * background videos. A client component rather than an inline script - the
 * landing runs a nonce CSP with no 'unsafe-inline', so a raw inline script
 * would be blocked exactly where the loops cost the most.
 */
export function VisibilityPause() {
  useEffect(() => {
    const onVisibility = () => {
      document.documentElement.classList.toggle("appseal-idle", document.hidden);
      document.querySelectorAll("video").forEach((v) => {
        if (document.hidden) {
          if (!v.paused) v.pause();
        } else {
          const r = v.getBoundingClientRect();
          if (r.bottom > 0 && r.top < window.innerHeight && !v.ended) v.play().catch(() => {});
        }
      });
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);
  return null;
}
