import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Suspense } from "react";
import { MotionProvider } from "@/components/studio/MotionProvider";
import { NavigationScrollManager } from "@/components/navigation/NavigationScrollManager";
import { CyberCursor } from "@/components/ui/CyberCursor";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Ayush Roy | Product & Full-Stack Systems Engineer",
  description: "Ayush Roy builds backend architectures, full-stack systems, realtime APIs, applied ML workflows, and evidence-backed engineering.",
  keywords: [
    "Ayush Roy",
    "yorayriniwnl",
    "Backend Software Engineer",
    "Full-Stack Engineer",
    "Python",
    "TypeScript",
    "PostgreSQL",
    "Redis",
    "Realtime Systems",
    "CandidateX"
  ],
  authors: [{ name: "Ayush Roy", url: "https://yorayriniwnl.in" }],
  metadataBase: new URL("https://yorayriniwnl.in"),
  openGraph: {
    title: "Ayush Roy · Product & Full-Stack Engineer",
    description: "I build backend-heavy product systems with Python, TypeScript, PostgreSQL, Redis, realtime APIs, and applied machine learning.",
    url: "https://yorayriniwnl.in",
    siteName: "YOR / Ayush Roy",
    type: "website",
  },
  other: {
    "darkreader-lock": "true",
    "color-scheme": "dark",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`dark ${inter.variable} ${jetbrainsMono.variable}`} suppressHydrationWarning>
      <body className="antialiased min-h-screen text-slate-100 font-[family-name:var(--font-sans)] bg-[#08070c]" suppressHydrationWarning>
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:rounded-lg focus:bg-[#78579e] focus:text-white focus:text-xs focus:font-semibold"
        >
          Skip to main content
        </a>
        <CyberCursor />
        <div className="studio-atmosphere" aria-hidden="true" />
        <Suspense fallback={null}>
          <NavigationScrollManager />
        </Suspense>
        <MotionProvider>
          <div id="main-content" className="relative z-10">
            {children}
          </div>
        </MotionProvider>
      </body>
    </html>
  );
}
