import type { Metadata } from "next";
import { Inter, Manrope, JetBrains_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/react";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const inter = Inter({
  variable: "--font-body",
  subsets: ["latin", "cyrillic"],
});
const manrope = Manrope({
  variable: "--font-display",
  subsets: ["latin", "cyrillic"],
});
const jet = JetBrains_Mono({
  variable: "--font-code",
  subsets: ["latin", "cyrillic"],
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "https://appseal.online"),
  title: "AppSeal - техосмотр для приложений, собранных с ИИ",
  description:
    "AppSeal сканирует живое приложение на утечки секретов, открытые базы, дырявые админки и признаки заброшенности. Оценка A+-E и бейдж доверия за минуту.",
  keywords: ["appseal", "vibe coding", "security scanner", "trust badge", "техосмотр приложений"],
  authors: [{ name: "AppSeal" }],
  icons: {
    icon: [
      { url: "/ico.svg", type: "image/svg+xml" },
      { url: "/favicon.ico", sizes: "any" },
      { url: "/ico.png", sizes: "512x512", type: "image/png" },
    ],
    shortcut: "/ico.svg",
    apple: [
      { url: "/apple.png", sizes: "180x180", type: "image/png" },
    ],
  },
  manifest: "/site.webmanifest",
  openGraph: {
    title: "AppSeal - the trust seal for AI-built apps",
    description:
      "Scan your AI-built app for leaked secrets, open databases, exposed admin panels and abandonment. A+-E grade in a minute.",
    type: "website",
    images: ["/OG.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "AppSeal - the trust seal for AI-built apps",
    description:
      "Scan your AI-built app for leaked secrets, open databases, exposed admin panels and abandonment. A+-E grade in a minute.",
    images: ["/OG.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" className="dark" suppressHydrationWarning>
      <body
        className={`${inter.variable} ${manrope.variable} ${jet.variable} antialiased`}
      >
        {children}
        <Toaster />
        <Analytics />
      </body>
    </html>
  );
}
