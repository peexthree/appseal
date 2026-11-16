import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { notFound } from "next/navigation";
import { FIX_GUIDES, HEADER_WHY, fixGuideBySlug } from "@/lib/fixes-content";
import { CopyCode } from "../copy-code";

export const revalidate = 3600;
export const dynamicParams = false;

export function generateStaticParams() {
  return FIX_GUIDES.map((g) => ({ slug: g.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const guide = fixGuideBySlug(slug);
  if (!guide) return {};
  return {
    title: `Заголовки безопасности для ${guide.label} - готовый ${guide.file} | AppSeal`,
    description: guide.description,
    alternates: { canonical: `/fixes/${guide.slug}` },
  };
}

export default async function FixGuidePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const guide = fixGuideBySlug(slug);
  if (!guide) notFound();

  return (
    <div className="flex min-h-screen flex-col bg-[#090d16] text-slate-100">
      <SiteHeader />

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6">
        <nav className="text-xs text-slate-500">
          <Link href="/fixes" className="transition hover:text-slate-300">Центр исправлений</Link>
          <span className="mx-1.5">/</span>
          <span className="text-slate-400">{guide.label}</span>
        </nav>
        <h1 className="mt-3 font-display text-2xl font-extrabold leading-tight sm:text-3xl">
          Защитные заголовки для {guide.label}
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-slate-400">
          Создайте или дополните файл <span className="font-mono text-sm font-bold text-sky-400">{guide.file}</span>{" "}
          ({guide.place}) и задеплойте. Заголовки те же, что AppSeal использует в продакшене - конфиг
          сам проходит техосмотр на класс A+.
        </p>

        <div className="mt-6 rounded-2xl border border-slate-800 bg-[#111827] p-5">
          <div className="flex items-center justify-between gap-3">
            <span className="font-mono text-xs font-bold text-slate-400">{guide.file}</span>
            <CopyCode code={guide.code} />
          </div>
          <pre className="mt-3 overflow-x-auto rounded-xl border border-slate-800 bg-[#090d16] p-4 font-mono text-[11px] leading-relaxed text-slate-300">
            {guide.code}
          </pre>
          <p className="mt-3 text-xs leading-relaxed text-slate-500">{guide.note}</p>
        </div>

        <section className="mt-10">
          <h2 className="font-display text-xl font-extrabold">Что закрывает этот конфиг</h2>
          <ul className="mt-4 space-y-2.5">
            {HEADER_WHY.map((h) => (
              <li key={h.name} className="rounded-xl border border-slate-800 bg-[#111827] px-4 py-3">
                <span className="font-mono text-xs font-bold text-sky-400">{h.name}</span>
                <span className="mt-0.5 block text-sm text-slate-300">{h.why}</span>
              </li>
            ))}
          </ul>
        </section>

        <div className="mt-10 rounded-2xl border border-sky-500/30 bg-[#0d1220] p-6">
          <p className="text-sm text-slate-300">
            Задеплоили? Перепроверьте сайт - класс на карточке AppSeal обновится сам после нового скана.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link
              href="/"
              className="rounded-md bg-sky-400 px-5 py-2.5 text-sm font-bold text-[#090d16] transition hover:bg-sky-300"
            >
              Запустить техосмотр
            </Link>
            <Link
              href="/fixes"
              className="rounded-md border border-slate-700 px-5 py-2.5 text-sm font-bold text-slate-300 transition hover:border-slate-500 hover:text-slate-100"
            >
              Другой хостинг
            </Link>
          </div>
        </div>
      </main>

      <footer className="mt-auto border-t border-slate-800/70 bg-[#070b13]">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-xs text-slate-500 sm:px-6">
          <span>AppSeal Engine · External Black-Box Security Scanner</span>
          <span className="inline-flex items-center gap-3">
            <Link href="/stats" className="transition hover:text-slate-400">статистика</Link>
            <Link href="/fixes" className="transition hover:text-slate-400">все гайды</Link>
          </span>
        </div>
      </footer>
    </div>
  );
}
