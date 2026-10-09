import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#18181B" }}>
        <svg width="180" height="180" viewBox="0 0 64 64">
          <rect x="14" y="14" width="8" height="36" rx="1.5" fill="#3B82F6" />
          <path d="M27 14h7a18 18 0 0 1 0 36h-7v-8h7a10 10 0 0 0 0-20h-7z" fill="#3B82F6" />
        </svg>
      </div>
    ),
    size,
  );
}
