import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Tlhamosesha AI — Poster reverse-engineering", template: "%s · Tlhamosesha AI" },
  description:
    "Upload any poster, banner or infographic and Tlhamosesha AI breaks it into text, images, backgrounds, colours and layout — then rebuilds it as an editable design.",
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = {
  themeColor: "#0E0E10",
  width: "device-width",
  initialScale: 1,
};

const FONTS =
  "https://fonts.googleapis.com/css2?family=Inter:wght@300..900&family=Sora:wght@500..800&family=JetBrains+Mono:wght@400;600&family=Oswald:wght@300..700&family=Anton&family=Bebas+Neue&family=Montserrat:wght@300..900&family=Playfair+Display:wght@400..900&family=Poppins:wght@300;400;600;800&family=Roboto:wght@300..900&family=Archivo+Black&display=swap";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="stylesheet" href={FONTS} />
        <style>{`:root{--font-sans:"Inter";--font-display:"Sora";--font-mono:"JetBrains Mono"}`}</style>
      </head>
      <body className="min-h-dvh font-sans">{children}</body>
    </html>
  );
}
