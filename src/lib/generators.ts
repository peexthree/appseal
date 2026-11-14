/**
 * One-click trust-file generators for the report: llms.txt (the AI-discovery
 * standard the engine checks in the trust category) and .well-known/security.txt
 * (RFC 9116, checked in the secrets category). The engine already parsed the
 * site, so most of the file can be prefilled - what cannot be derived from a
 * black-box scan (contact email, page list) stays as an explicit TODO line:
 * the output must be honest about being a template, not a finished file.
 */

import type { ScanResult } from "./scanner/types.ts";

export interface GeneratedFile {
  /** file path as it will live on the user's site */
  path: string;
  content: string;
  /** what the user still has to fill in by hand */
  todo: string[];
}

export function buildLlmsTxt(scan: ScanResult): GeneratedFile {
  const host = scan.host;
  const siteUrl = `https://${host.replace(/^www\./, "")}/`;
  const sitemapHit = scan.results.find((r) => r.id === "seo_sitemap");
  const hasSitemap = sitemapHit?.status === "pass";
  const todo = ["Одна строка о проекте после «>»", "Ссылки на реальные страницы (About, Docs, Blog)"];
  const content = [
    `# ${host.replace(/^www\./, "")}`,
    "",
    "> [TODO: опишите проект одной фразой - что это и для кого. Эта строка читается ИИ-ассистентами]",
    "",
    "## Pages",
    `- [Home](${siteUrl})`,
    ...(hasSitemap ? ["- [Sitemap](" + siteUrl + "sitemap.xml)"] : []),
    "",
    "## Contact",
    "- [TODO: https://" + host.replace(/^www\./, "") + "/about или mailto:you@example.com]",
    "",
    "## Policy",
    "- AI crawlers: см. /robots.txt (User-agent группы GPTBot, ClaudeBot и др.)",
  ].join("\n");
  return { path: "/llms.txt", content, todo };
}

export function buildSecurityTxt(scan: ScanResult): GeneratedFile {
  const host = scan.host.replace(/^www\./, "");
  const expires = new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const todo = ["Реальный контакт безопасности (email или ссылка на форму)"];
  const content = [
    "# RFC 9116 security.txt",
    "",
    "Contact: mailto:[TODO: security@" + host + "]",
    `Expires: ${expires}`,
    "Preferred-Languages: ru, en",
    `Canonical: https://${host}/.well-known/security.txt`,
    "",
    "# Политика раскрытия уязвимостей:",
    "# [TODO: ссылка на страницу, где описано, как вы принимаете и обрабатываете отчёты]",
  ].join("\n");
  return { path: "/.well-known/security.txt", content, todo };
}
