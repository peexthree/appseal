"use client";

import { useState } from "react";

/** Copy-to-clipboard button under the config blocks on /fixes guides. */
export function CopyCode({ code, label = "Скопировать конфиг" }: { code: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(code);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          /* clipboard unavailable */
        }
      }}
      className={`rounded-md border px-3 py-1.5 text-xs font-bold transition ${
        copied
          ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-400"
          : "border-sky-500/40 bg-sky-500/10 text-sky-400 hover:bg-sky-500/20 hover:text-sky-300"
      }`}
    >
      {copied ? "Скопировано ✓" : label}
    </button>
  );
}
