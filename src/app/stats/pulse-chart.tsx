"use client";

import { useState } from "react";
import type { Lang } from "@/lib/scanner/types";

type Range = "24h" | "7d" | "all";

const D = {
  title: { ru: "Пульс проверок", en: "Scan pulse" },
  r24: { ru: "24 часа", en: "24 hours" },
  r7d: { ru: "7 дней", en: "7 days" },
  rAll: { ru: "Всё время", en: "All time" },
  lead: { ru: "Ручные проверки и авто-обход вместе - ", en: "Manual checks plus the auto-crawler - " },
  in24: { ru: " за сутки (часы UTC)", en: " in 24 h (UTC hours)" },
  in7d: { ru: " за неделю (дни UTC)", en: " in 7 days (UTC days)" },
  inAll: { ru: " сканов всего; столбики - детализация за 30 дней", en: " scans total; the bars break the last 30 days down" },
  totalAll: { ru: "Всего сканов: ", en: "Total scans: " },
  h24: { ru: "-24ч", en: "-24h" },
  h12: { ru: "-12ч", en: "-12h" },
  now: { ru: "сейчас", en: "now" },
  allNote: {
    ru: "каждый скан, попавший в реестр, двигает этот счётчик",
    en: "every scan that lands in the registry moves this counter",
  },
} as const;

const d = (lang: Lang, k: keyof typeof D) => D[k][lang];

/**
 * Scan pulse with a period switcher: 24 hourly buckets, 7 daily buckets or
 * the full history as 30 daily buckets (the counter itself has no per-scan
 * log - the daily buckets are the deepest history Redis keeps). Client-side
 * only for the switcher state; the bars themselves are plain divs.
 */
export function PulseChart({
  hours,
  days,
  days30,
  total,
  lang,
}: {
  hours: number[];
  days: number[];
  days30: number[];
  total: number;
  lang: Lang;
}) {
  const [range, setRange] = useState<Range>("24h");
  const dayFmt = new Intl.DateTimeFormat(lang === "en" ? "en-US" : "ru-RU", { day: "numeric", month: "short", timeZone: "UTC" });
  const now = Date.now();

  const bars = range === "24h" ? hours : range === "7d" ? days : days30;
  const max = Math.max(...bars, 1);
  // the all-time lead stays the monotonic counter (matches the hero card),
  // not the bucket sum: day buckets only exist since the counters launched
  const sum = range === "all" ? total : bars.reduce((s, n) => s + n, 0);

  const ranges: { key: Range; label: string }[] = [
    { key: "24h", label: d(lang, "r24") },
    { key: "7d", label: d(lang, "r7d") },
    { key: "all", label: d(lang, "rAll") },
  ];

  return (
    <section className="mt-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-xl font-extrabold">{d(lang, "title")}</h2>
        <div className="flex rounded-lg border border-slate-800 bg-[#090d16] p-0.5">
          {ranges.map((r) => (
            <button
              key={r.key}
              type="button"
              onClick={() => setRange(r.key)}
              aria-pressed={range === r.key}
              className={`rounded-md px-3 py-1 text-xs font-bold transition ${
                range === r.key ? "bg-sky-400 text-[#090d16]" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>
      <p className="mt-1 text-sm text-slate-500">
        {d(lang, "lead")}
        <span className="font-bold text-emerald-400">{sum}</span>
        {range === "24h" ? d(lang, "in24") : range === "7d" ? d(lang, "in7d") : d(lang, "inAll")}
      </p>
      <div className={`mt-4 flex items-end gap-1.5 ${range === "all" ? "h-16" : "h-24"}`}>
        {bars.map((n, i) => {
          const hourLabel =
            range === "24h"
              ? `${(new Date(now).getUTCHours() - (bars.length - 1 - i) + 48) % 24}:00 UTC`
              : "";
          const daysBack = bars.length - 1 - i;
          return (
            <div key={i} className="flex flex-1 flex-col justify-end" style={{ height: "100%" }}>
              <div
                className="flex-1 rounded-t bg-gradient-to-t from-sky-400/30 to-sky-400/80"
                style={{ height: `${Math.max((n * 100) / max, n ? 4 : 2)}%` }}
                title={
                  range === "24h"
                    ? `${hourLabel}: ${n}`
                    : `${dayFmt.format(new Date(now - daysBack * 86400000))}: ${n}`
                }
              />
            </div>
          );
        })}
      </div>
      <div className="mt-1.5 flex justify-between font-mono text-[9px] text-slate-600">
        {range === "24h" ? (
          <>
            <span>{d(lang, "h24")}</span>
            <span>{d(lang, "h12")}</span>
            <span>{d(lang, "now")}</span>
          </>
        ) : range === "7d" ? (
          <>
            <span>{dayFmt.format(new Date(now - 6 * 86400000))}</span>
            <span>{dayFmt.format(new Date(now - 3 * 86400000))}</span>
            <span>{dayFmt.format(new Date(now))}</span>
          </>
        ) : (
          <>
            <span>{dayFmt.format(new Date(now - 29 * 86400000))}</span>
            <span>{d(lang, "allNote")}</span>
            <span>{dayFmt.format(new Date(now))}</span>
          </>
        )}
      </div>
    </section>
  );
}
