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
    { media: "(prefers-color-scheme: light)", color: "#F4F4F6" },
  ],
  width: "device-width",
  initialScale: 1,
};

const FONTS =
  "https://fonts.googleapis.com/css2?family=Inter:wght@300..900&family=Sora:wght@500..800&family=JetBrains+Mono:wght@400;600&family=Oswald:wght@300..700&family=Anton&family=Bebas+Neue&family=Montserrat:wght@300..900&family=Playfair+Display:wght@400..900&family=Poppins:wght@300;400;600;800&family=Roboto:wght@300..900&family=Archivo+Black&display=swap";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="stylesheet" href={FONTS} />
        <style>{`:root{--font-sans:"Inter";--font-display:"Sora";--font-mono:"JetBrains Mono"}`}</style>
      </head>
      <body className="min-h-dvh font-sans">{children}</body>
    </html>
  );
}
