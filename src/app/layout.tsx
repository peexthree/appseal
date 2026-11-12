import type { Metadata } from "next";
import { Inter, Manrope, JetBrains_Mono } from "next/font/google";
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
  title: "AppMOT — техосмотр для приложений, собранных с ИИ",
  description:
    "AppMOT сканирует живое приложение на утечки секретов, открытые базы, дырявые админки и признаки заброшенности. Оценка A–D и бейдж доверия за минуту.",
  keywords: ["appmot", "vibe coding", "security scanner", "trust badge", "техосмотр приложений"],
  authors: [{ name: "AppMOT" }],
  openGraph: {
    title: "AppMOT — the MOT test for AI-built apps",
    description:
      "Scan your AI-built app for leaked secrets, open databases, exposed admin panels and abandonment. A–D grade in a minute.",
    type: "website",
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
      </body>
    </html>
  );
}
