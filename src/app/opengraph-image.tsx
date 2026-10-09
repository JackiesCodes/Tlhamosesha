import { ImageResponse } from "next/og";
import { MARK_PATH, TILE_VIEWBOX } from "@/lib/brand-mark";
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
          <svg width="96" height="96" viewBox={TILE_VIEWBOX}>
            <rect x="46.5" y="-7.5" width="340" height="340" rx="76" fill="#18181B" />
            <path d={MARK_PATH} fill="#FAFAFA" />
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
