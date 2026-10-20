import { ImageResponse } from "next/og";
import { MARK_PATH, TILE_VIEWBOX } from "@/lib/brand-mark";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// Black mark on white, matching the brand artwork.
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#FFFFFF" }}>
        <svg width="180" height="180" viewBox={TILE_VIEWBOX}>
          <path d={MARK_PATH} fill="#0A0A0A" />
        </svg>
      </div>
    ),
    size,
  );
}
