import { ImageResponse } from "next/og";
import { BRAND } from "@/lib/brand";

export const alt = `${BRAND.name} — ${BRAND.tagline}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Social share card, rendered at build time (no external assets).
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: "#0E0E10", padding: 80, color: "#FAFAFA" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <svg width="96" height="96" viewBox="0 0 64 64">
            <rect width="64" height="64" rx="16" fill="#18181B" />
            <rect x="14" y="14" width="8" height="36" rx="1.5" fill="#3B82F6" />
            <path d="M27 14h7a18 18 0 0 1 0 36h-7v-8h7a10 10 0 0 0 0-20h-7z" fill="#3B82F6" />
          </svg>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 56, fontWeight: 700 }}>{BRAND.name}</div>
            <div style={{ fontSize: 28, color: "#A1A1AA" }}>{BRAND.tagline}</div>
          </div>
        </div>
        <div style={{ display: "flex", fontSize: 64, fontWeight: 700, lineHeight: 1.1, maxWidth: 980 }}>Turn any poster back into editable layers.</div>
        <div style={{ display: "flex", gap: 16, fontSize: 24, color: "#A1A1AA" }}>
          {["Text", "Images", "Logos", "Background", "Colours", "Layout"].map((t) => (
            <div key={t} style={{ display: "flex", border: "2px solid #2A2A30", borderRadius: 10, padding: "8px 16px" }}>
              {t}
            </div>
          ))}
        </div>
      </div>
    ),
    size,
  );
}
