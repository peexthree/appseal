"use client";

import { useState } from "react";

type Range = "24h" | "7d" | "all";

/**
 * Scan pulse with a period switcher: 24 hourly buckets, 7 daily buckets or
 * the all-time counter. Client-side only for the switcher state; the bars
 * themselves are plain divs.
 */
export function PulseChart({ hours, days, total }: { hours: number[]; days: number[]; total: number }) {
  const [range, setRange] = useState<Range>("24h");
  const dayFmt = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", timeZone: "UTC" });
  const now = Date.now();

  const bars =
    range === "24h"
      ? hours
      : range === "7d"
        ? days
        : [total];
  const max = Math.max(...bars, 1);
  const sum = bars.reduce((s, n) => s + n, 0);

  const ranges: { key: Range; label: string }[] = [
    { key: "24h", label: "24 часа" },
    { key: "7d", label: "7 дней" },
    { key: "all", label: "Всё время" },
  ];

  return (
    <section className="mt-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-xl font-extrabold">Пульс проверок</h2>
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
        Ручные проверки и авто-обход вместе -{" "}
        <span className="font-bold text-emerald-400">{sum}</span>
        {range === "24h" ? " за сутки (часы UTC)" : range === "7d" ? " за неделю (дни UTC)" : " сканов всего, с 16 ноября 2026"}
      </p>
      <div className={`mt-4 flex items-end gap-1.5 ${range === "all" ? "h-16" : "h-24"}`}>
        {bars.map((n, i) => {
          const hourLabel =
            range === "24h"
              ? `${(new Date(now).getUTCHours() - (bars.length - 1 - i) + 48) % 24}:00 UTC`
              : "";
          return (
            <div key={i} className="flex flex-1 flex-col justify-end" style={{ height: "100%" }}>
              <div
                className="flex-1 rounded-t bg-gradient-to-t from-sky-400/30 to-sky-400/80"
                style={{ height: `${Math.max((n * 100) / max, n ? 4 : 2)}%` }}
                title={
                  range === "24h"
                    ? `${hourLabel}: ${n}`
                    : range === "7d"
                      ? `${dayFmt.format(new Date(now - (7 - 1 - i) * 86400000))}: ${n}`
                      : `Всего сканов: ${n}`
                }
              />
            </div>
          );
        })}
      </div>
      <div className="mt-1.5 flex justify-between font-mono text-[9px] text-slate-600">
        {range === "24h" ? (
          <>
            <span>-24ч</span>
            <span>-12ч</span>
            <span>сейчас</span>
          </>
        ) : range === "7d" ? (
          <>
            <span>{dayFmt.format(new Date(now - 6 * 86400000))}</span>
            <span>{dayFmt.format(new Date(now - 3 * 86400000))}</span>
            <span>{dayFmt.format(new Date(now))}</span>
          </>
        ) : (
          <span>каждый скан, попавший в реестр, двигает этот счётчик</span>
        )}
      </div>
    </section>
  );
}
