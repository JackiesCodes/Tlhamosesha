import { ImageResponse } from "next/og";
import { BRAND } from "@/lib/brand";
import { MARK_PATH, MARK_VIEWBOX } from "@/lib/brand-mark";

export const alt = `${BRAND.name} — ${BRAND.tagline}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Social share card in the brand's black-on-white style (no external assets).
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", background: "#FFFFFF", color: "#0A0A0A", padding: "0 90px", gap: 70 }}>
        <svg width="360" height="360" viewBox={MARK_VIEWBOX}>
          <path d={MARK_PATH} fill="#0A0A0A" />
        </svg>
        <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
          <div style={{ fontSize: 96, fontWeight: 700, letterSpacing: -3 }}>{BRAND.name}</div>
          <div style={{ fontSize: 34, color: "#52525B", marginTop: 4 }}>{BRAND.tagline}</div>
          <div style={{ display: "flex", fontSize: 40, lineHeight: 1.2, marginTop: 44 }}>Take any poster apart. Rebuild it as editable layers.</div>
        </div>
      </div>
    ),
    size,
  );
}
