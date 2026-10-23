import type { Metadata, Viewport } from "next";
import "./globals.css";
import { BRAND, fullTitle } from "@/lib/brand";
import { SITE_URL } from "@/lib/site";
import { THEME_SCRIPT } from "@/lib/theme-script";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: fullTitle, template: `%s · ${BRAND.name}` },
  description: BRAND.description,
  applicationName: BRAND.name,
  icons: { icon: "/icon.svg" },
  openGraph: { type: "website", siteName: BRAND.name, title: fullTitle, description: BRAND.description, url: "/" },
  twitter: { card: "summary_large_image", title: fullTitle, description: BRAND.description },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0E0E10" },
    { media: "(prefers-color-scheme: light)", color: "#FAFAFA" },
  ],
  width: "device-width",
  initialScale: 1,
};


export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="light" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        {/* Self-hosted fonts (scripts/copy-font-assets.mjs): the UI fonts and the poster font library. */}
        <link rel="stylesheet" href="/fonts/fonts.css" />
        <style>{`:root{--font-sans:"Inter";--font-display:"Space Grotesk";--font-mono:"JetBrains Mono"}`}</style>
      </head>
      <body className="min-h-dvh font-sans">{children}</body>
    </html>
  );
}
