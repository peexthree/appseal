"use client";

import { Reveal } from "@/components/reveal";

/**
 * Unified section header: eyebrow pill + display title + optional subtitle.
 * Eyebrow strings are resolved by the caller ({ru,en} inline objects).
 */
export function SectionHead({
  eyebrow,
  title,
  sub,
}: {
  eyebrow: string;
  title: string;
  sub?: string;
}) {
  return (
    <Reveal className="mx-auto max-w-2xl text-center">
      <span className="inline-flex items-center rounded-full border border-sky-400/20 bg-sky-400/[0.06] px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-sky-400">
        {eyebrow}
      </span>
      <h2 className="font-display mt-4 text-2xl font-bold tracking-tight text-slate-100 sm:text-3xl">
        {title}
      </h2>
      {sub && <p className="mt-2 text-sm text-slate-500">{sub}</p>}
    </Reveal>
  );
}
