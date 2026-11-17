import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { notFound } from "next/navigation";
import { FIX_GUIDES, fixGuideBySlug } from "@/lib/fixes-content";
import { FixGuideView, GuideFooterLinks } from "../guide-view";

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
    <div className="flex min-h-screen flex-col text-slate-100">
      <SiteHeader />
      <FixGuideView guide={guide} />
      <footer className="mt-auto border-t border-slate-800/70 bg-[#070b13]">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-xs text-slate-500 sm:px-6">
          <span>AppSeal Engine · External Black-Box Security Scanner</span>
          <GuideFooterLinks />
        </div>
      </footer>
    </div>
  );
}
