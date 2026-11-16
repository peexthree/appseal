import type { ReactNode } from "react";



/**
 * Left-aligned section heading for tool pages (/stats, /api, /fixes/*):
 * short neon tick + silver-gradient display title + optional subtitle.
 * The centered SectionHead stays for landing beats.
 */
export function SectionTitle({
  children,
  sub,
  as: Tag = "h2",
}: {
  children: ReactNode;
  sub?: ReactNode;
  as?: "h1" | "h2" | "h3";
}) {
  return (
    <div>
      <span aria-hidden className="appseal-title-tick block" />
      <Tag className="appseal-title font-display mt-3 text-xl font-extrabold tracking-tight sm:text-2xl">
        {children}
      </Tag>
      {sub && <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-slate-500">{sub}</p>}
    </div>
  );
}
