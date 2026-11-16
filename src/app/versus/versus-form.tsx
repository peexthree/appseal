"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** Two-input form on /versus: pushes /versus?a=..&b=.. for a shareable URL. */
export function VersusForm({ a = "", b = "" }: { a?: string; b?: string }) {
  const router = useRouter();
  const [ha, setHa] = useState(a);
  const [hb, setHb] = useState(b);
  const [busy, setBusy] = useState(false);

  const clean = (v: string) =>
    v
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .replace(/\/.*$/, "");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const x = clean(ha);
        const y = clean(hb);
        if (!x || !y) return;
        setBusy(true);
        router.push(`/versus?a=${encodeURIComponent(x)}&b=${encodeURIComponent(y)}`);
      }}
      className="mt-8 rounded-2xl border border-slate-800 bg-[#111827] p-5 sm:p-6"
    >
      <div className="grid items-center gap-3 sm:grid-cols-[1fr_auto_1fr]">
        <input
          value={ha}
          onChange={(e) => setHa(e.target.value)}
          placeholder="мойпроект.dev"
          aria-label="Первый сайт"
          className="w-full rounded-xl border border-slate-800 bg-white/[0.04] px-4 py-2.5 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-sky-400/60"
        />
        <span className="text-center font-display text-lg font-extrabold text-slate-500">VS</span>
        <input
          value={hb}
          onChange={(e) => setHb(e.target.value)}
          placeholder="чужой-деплой.vercel.app"
          aria-label="Второй сайт"
          className="w-full rounded-xl border border-slate-800 bg-white/[0.04] px-4 py-2.5 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-sky-400/60"
        />
      </div>
      <button
        type="submit"
        disabled={busy}
        className="mt-4 w-full rounded-xl bg-sky-400 px-5 py-2.5 text-sm font-bold text-[#090d16] transition hover:bg-sky-300 disabled:opacity-60"
      >
        Сравнить безопасность
      </button>
      <p className="mt-2 text-center text-[11px] text-slate-500">
        Оба сайта должны пройти бесплатный техосмотр - результат открывается ссылкой, которую можно кинуть в чат.
      </p>
    </form>
  );
}

/** Copy-share button for a ready versus link. */
export function VersusShare() {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(window.location.href);
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
      {copied ? "Ссылка скопирована ✓" : "Скопировать ссылку"}
    </button>
  );
}
