// Background plate reconstruction and decomposition into
// base / gradient / texture / blur / colour overlay / lighting layers.
import { colorDistance, rgbToHsl, toHex, type RGB } from "../color";
import type { BackgroundLayer, Box, GradientValue } from "../types";
import { uid } from "../utils";
import { dilate, inpaint, makeCanvas, rasterToDataUrl, type Raster } from "./raster";

export interface BackgroundResult {
  plate: string; // full-size data URL, foreground removed
  layers: BackgroundLayer[];
  gradients: GradientValue[];
}

export function extractBackground(
  img: HTMLImageElement,
  r: Raster,
  mask: Uint8Array,
  removeBoxes: Box[],
): BackgroundResult {
  const { width: w, height: h } = r;
  const W = img.naturalWidth;
  const H = img.naturalHeight;

  // Unknown = salient pixels + every detected element box.
  const fg = dilate(mask, w, h, 2);
  const s = 1 / r.scale;
  for (const b of removeBoxes) {
    const x0 = Math.max(0, Math.floor(b.x * s) - 1);
    const y0 = Math.max(0, Math.floor(b.y * s) - 1);
    const x1 = Math.min(w - 1, Math.ceil((b.x + b.width) * s) + 1);
    const y1 = Math.min(h - 1, Math.ceil((b.y + b.height) * s) + 1);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) fg[y * w + x] = 1;
  }
  const known = new Uint8Array(w * h);
  for (let i = 0; i < known.length; i++) known[i] = fg[i] ? 0 : 1;
  const filled = inpaint(r, known);

  // Upscale the plate with a soft blur so the low-res fill does not show.
  const small = makeCanvas(w, h);
  small.ctx.putImageData(new ImageData(new Uint8ClampedArray(filled.data), w, h), 0, 0);
  const plateC = makeCanvas(W, H);
  plateC.ctx.imageSmoothingQuality = "high";
  plateC.ctx.filter = `blur(${Math.max(1, Math.round(r.scale * 0.8))}px)`;
  plateC.ctx.drawImage(small.canvas, 0, 0, W, H);
  plateC.ctx.filter = "none";
  // Restore crisp original pixels wherever the background was visible.
  const orig = makeCanvas(W, H);
  orig.ctx.drawImage(img, 0, 0);
  const od = orig.ctx.getImageData(0, 0, W, H);
  const pd = plateC.ctx.getImageData(0, 0, W, H);
  for (let y = 0; y < H; y++) {
    const my = Math.min(h - 1, Math.floor(y * s));
    for (let x = 0; x < W; x++) {
      const mx = Math.min(w - 1, Math.floor(x * s));
      if (known[my * w + mx]) {
        const i = (y * W + x) * 4;
        pd.data[i] = od.data[i];
        pd.data[i + 1] = od.data[i + 1];
        pd.data[i + 2] = od.data[i + 2];
      }
    }
  }
  plateC.ctx.putImageData(pd, 0, 0);
  const plate = plateC.canvas.toDataURL("image/jpeg", 0.92);

  const layers: BackgroundLayer[] = [
    { id: uid("bg"), kind: "base", label: "Main background", image: plate, confidence: 0.9 },
  ];

  // ---- Gradient: compare band colours along 4 axes of the filled plate.
  const gradients: GradientValue[] = [];
  const axes = [
    { angle: 180, name: "top → bottom" },
    { angle: 90, name: "left → right" },
    { angle: 135, name: "diagonal ↘" },
    { angle: 45, name: "diagonal ↗" },
  ];
  let best: { angle: number; name: string; stops: RGB[]; spread: number } | null = null;
  for (const ax of axes) {
    const stops = bandColors(filled, ax.angle, 5);
    const spread = colorDistance(stops[0], stops[stops.length - 1]);
    if (!best || spread > best.spread) best = { ...ax, stops, spread };
  }
  if (best && best.spread > 38) {
    const picks = [best.stops[0], best.stops[2], best.stops[4]];
    const stops = picks.map((c, i) => ({ hex: toHex(c), at: i * 50 }));
    const css = `linear-gradient(${best.angle}deg, ${stops.map((st) => `${st.hex} ${st.at}%`).join(", ")})`;
    const g = makeCanvas(W, H);
    paintLinearGradient(g.ctx, W, H, best.angle, stops);
    layers.push({
      id: uid("bg"),
      kind: "gradient",
      label: `Gradient (${best.name})`,
      image: g.canvas.toDataURL("image/png"),
      css,
      confidence: Math.min(0.95, 0.5 + best.spread / 400),
      meta: { angle: best.angle, stops: stops.length },
    });
    gradients.push({ id: uid("grad"), angle: best.angle, stops, css, region: "Background" });
  }

  // ---- Texture: high-frequency residual of the plate.
  const blurred = makeCanvas(W, H);
  blurred.ctx.filter = `blur(${Math.max(2, Math.round(Math.min(W, H) / 200))}px)`;
  blurred.ctx.drawImage(plateC.canvas, 0, 0);
  const bd = blurred.ctx.getImageData(0, 0, W, H);
  const tex = new ImageData(W, H);
  let energy = 0;
  for (let i = 0; i < tex.data.length; i += 4) {
    const dl =
      (pd.data[i] - bd.data[i]) * 0.299 + (pd.data[i + 1] - bd.data[i + 1]) * 0.587 + (pd.data[i + 2] - bd.data[i + 2]) * 0.114;
    energy += Math.abs(dl);
    const v = 128 + dl * 3;
    tex.data[i] = tex.data[i + 1] = tex.data[i + 2] = v;
    tex.data[i + 3] = 255;
  }
  energy /= W * H;
  const texC = makeCanvas(W, H);
  texC.ctx.putImageData(tex, 0, 0);
  layers.push({
    id: uid("bg"),
    kind: "texture",
    label: energy > 3 ? "Texture / grain" : "Texture (subtle)",
    image: texC.canvas.toDataURL("image/jpeg", 0.85),
    confidence: Math.min(0.9, 0.3 + energy / 12),
    meta: { energy: Math.round(energy * 10) / 10, blend: "overlay" },
  });

  // ---- Blur layer
  const blurC = makeCanvas(W, H);
  blurC.ctx.filter = `blur(${Math.round(Math.min(W, H) / 40)}px)`;
  blurC.ctx.drawImage(plateC.canvas, 0, 0);
  layers.push({
    id: uid("bg"),
    kind: "blur",
    label: "Depth blur",
    image: blurC.canvas.toDataURL("image/jpeg", 0.85),
    confidence: 0.7,
    meta: { radius: Math.round(Math.min(W, H) / 40) },
  });

  // ---- Colour overlay: mean tint of the plate.
  let rr = 0;
  let gg = 0;
  let bb = 0;
  for (let i = 0; i < filled.data.length; i += 4) {
    rr += filled.data[i];
    gg += filled.data[i + 1];
    bb += filled.data[i + 2];
  }
  const n = filled.data.length / 4;
  const mean: RGB = [rr / n, gg / n, bb / n].map(Math.round) as RGB;
  const [, sat] = rgbToHsl(mean);
  const ov = makeCanvas(W, H);
  ov.ctx.fillStyle = toHex(mean);
  ov.ctx.globalAlpha = 0.45;
  ov.ctx.fillRect(0, 0, W, H);
  layers.push({
    id: uid("bg"),
    kind: "overlay",
    label: `Colour overlay ${toHex(mean)}`,
    image: ov.canvas.toDataURL("image/png"),
    confidence: Math.min(0.9, 0.35 + sat / 120),
    meta: { hex: toHex(mean), opacity: 45, blend: "soft-light" },
  });

  // ---- Lighting: normalised luminance of the plate, brightest point noted.
  const light = new Uint8ClampedArray(w * h * 4);
  let lo = 255;
  let hi = 0;
  const lum = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    lum[i] = 0.299 * filled.data[i * 4] + 0.587 * filled.data[i * 4 + 1] + 0.114 * filled.data[i * 4 + 2];
    lo = Math.min(lo, lum[i]);
    hi = Math.max(hi, lum[i]);
  }
  let bx = 0;
  let by = 0;
  let bv = -1;
  for (let i = 0; i < w * h; i++) {
    const v = hi > lo ? ((lum[i] - lo) / (hi - lo)) * 255 : 128;
    light[i * 4] = light[i * 4 + 1] = light[i * 4 + 2] = v;
    light[i * 4 + 3] = 255;
    if (v > bv) {
      bv = v;
      bx = i % w;
      by = (i / w) | 0;
    }
  }
  const lightSmall = rasterToDataUrl({ width: w, height: h, data: light }, "image/png");
  layers.push({
    id: uid("bg"),
    kind: "lighting",
    label: "Lighting map",
    image: lightSmall,
    confidence: Math.min(0.9, 0.3 + (hi - lo) / 300),
    meta: {
      keyLightX: Math.round((bx / w) * 100),
      keyLightY: Math.round((by / h) * 100),
      range: Math.round(hi - lo),
    },
  });

  return { plate, layers, gradients };
}

function bandColors(r: Raster, angle: number, bands: number): RGB[] {
  const rad = (angle * Math.PI) / 180;
  const dx = Math.sin(rad);
  const dy = -Math.cos(rad);
  const { width: w, height: h } = r;
  const proj = (x: number, y: number) => (x - w / 2) * dx + (y - h / 2) * dy;
  const extent = Math.abs(w / 2 * dx) + Math.abs(h / 2 * dy);
  const sums = Array.from({ length: bands }, () => [0, 0, 0, 0]);
  for (let y = 0; y < h; y += 2)
    for (let x = 0; x < w; x += 2) {
      const t = (proj(x, y) + extent) / (2 * extent);
      const b = Math.min(bands - 1, Math.max(0, Math.floor(t * bands)));
      const i = (y * w + x) * 4;
      sums[b][0] += r.data[i];
      sums[b][1] += r.data[i + 1];
      sums[b][2] += r.data[i + 2];
      sums[b][3]++;
    }
  return sums.map((s) => (s[3] ? [s[0] / s[3], s[1] / s[3], s[2] / s[3]].map(Math.round) : [0, 0, 0]) as RGB);
}

export function paintLinearGradient(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  angle: number,
  stops: { hex: string; at: number }[],
) {
  const rad = (angle * Math.PI) / 180;
  const len = Math.abs(W * Math.sin(rad)) + Math.abs(H * Math.cos(rad));
  const cx = W / 2;
  const cy = H / 2;
  const dx = (Math.sin(rad) * len) / 2;
  const dy = (-Math.cos(rad) * len) / 2;
  const g = ctx.createLinearGradient(cx - dx, cy - dy, cx + dx, cy + dy);
  for (const s of stops) g.addColorStop(s.at / 100, s.hex);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}
