// Low-level raster helpers used by the on-device vision pipeline.
import type { RGB } from "../color";
import type { Box } from "../types";

export interface Raster {
  width: number;
  height: number;
  data: Uint8ClampedArray;
  /** source px per raster px */
  scale: number;
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not decode image"));
    img.src = src;
  });
}

export function makeCanvas(width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  return { canvas, ctx };
}

export function rasterize(img: CanvasImageSource & { width: number; height: number }, maxDim: number): Raster {
  const w0 = (img as HTMLImageElement).naturalWidth || img.width;
  const h0 = (img as HTMLImageElement).naturalHeight || img.height;
  const scale = Math.max(1, Math.max(w0, h0) / maxDim);
  const w = Math.round(w0 / scale);
  const h = Math.round(h0 / scale);
  const { ctx } = makeCanvas(w, h);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, w, h);
  return { width: w, height: h, data: ctx.getImageData(0, 0, w, h).data, scale };
}

export function rasterToDataUrl(r: { width: number; height: number; data: Uint8ClampedArray }, type = "image/png", quality = 0.92) {
  const { canvas, ctx } = makeCanvas(r.width, r.height);
  ctx.putImageData(new ImageData(new Uint8ClampedArray(r.data), r.width, r.height), 0, 0);
  return canvas.toDataURL(type, quality);
}

export const px = (r: Raster, x: number, y: number): RGB => {
  const i = (y * r.width + x) * 4;
  return [r.data[i], r.data[i + 1], r.data[i + 2]];
};

export function sampleColors(r: Raster, step = 2, box?: Box): RGB[] {
  const out: RGB[] = [];
  const x0 = box ? Math.max(0, Math.floor(box.x)) : 0;
  const y0 = box ? Math.max(0, Math.floor(box.y)) : 0;
  const x1 = box ? Math.min(r.width, Math.ceil(box.x + box.width)) : r.width;
  const y1 = box ? Math.min(r.height, Math.ceil(box.y + box.height)) : r.height;
  for (let y = y0; y < y1; y += step)
    for (let x = x0; x < x1; x += step) {
      const i = (y * r.width + x) * 4;
      if (r.data[i + 3] < 128) continue;
      out.push([r.data[i], r.data[i + 1], r.data[i + 2]]);
    }
  return out;
}

export function luminanceMap(r: Raster) {
  const out = new Float32Array(r.width * r.height);
  for (let i = 0, j = 0; i < out.length; i++, j += 4)
    out[i] = 0.299 * r.data[j] + 0.587 * r.data[j + 1] + 0.114 * r.data[j + 2];
  return out;
}

/** Sobel gradient magnitude, normalised to 0..1. */
export function sobel(lum: Float32Array, w: number, h: number) {
  const out = new Float32Array(w * h);
  let max = 1e-6;
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const gx =
        -lum[i - w - 1] - 2 * lum[i - 1] - lum[i + w - 1] + lum[i - w + 1] + 2 * lum[i + 1] + lum[i + w + 1];
      const gy =
        -lum[i - w - 1] - 2 * lum[i - w] - lum[i - w + 1] + lum[i + w - 1] + 2 * lum[i + w] + lum[i + w + 1];
      const m = Math.hypot(gx, gy);
      out[i] = m;
      if (m > max) max = m;
    }
  for (let i = 0; i < out.length; i++) out[i] /= max;
  return out;
}

/** Binary morphology on a 0/1 mask with a square kernel. */
export function dilate(mask: Uint8Array, w: number, h: number, radius: number) {
  if (radius <= 0) return mask;
  const tmp = new Uint8Array(mask.length);
  const out = new Uint8Array(mask.length);
  for (let y = 0; y < h; y++) {
    let run = -1e9;
    for (let x = 0; x < w; x++) {
      if (mask[y * w + x]) run = x;
      if (x - run <= radius) tmp[y * w + x] = 1;
    }
    run = 1e9;
    for (let x = w - 1; x >= 0; x--) {
      if (mask[y * w + x]) run = x;
      if (run - x <= radius) tmp[y * w + x] = 1;
    }
  }
  for (let x = 0; x < w; x++) {
    let run = -1e9;
    for (let y = 0; y < h; y++) {
      if (tmp[y * w + x]) run = y;
      if (y - run <= radius) out[y * w + x] = 1;
    }
    run = 1e9;
    for (let y = h - 1; y >= 0; y--) {
      if (tmp[y * w + x]) run = y;
      if (run - y <= radius) out[y * w + x] = 1;
    }
  }
  return out;
}

export function erode(mask: Uint8Array, w: number, h: number, radius: number) {
  const inv = new Uint8Array(mask.length);
  for (let i = 0; i < mask.length; i++) inv[i] = mask[i] ? 0 : 1;
  const d = dilate(inv, w, h, radius);
  for (let i = 0; i < d.length; i++) d[i] = d[i] ? 0 : 1;
  return d;
}

export function otsu(values: Float32Array, bins = 64) {
  const hist = new Float64Array(bins);
  for (const v of values) hist[Math.min(bins - 1, Math.floor(v * bins))]++;
  const total = values.length;
  let sum = 0;
  for (let i = 0; i < bins; i++) sum += i * hist[i];
  let sumB = 0;
  let wB = 0;
  let best = 0;
  let threshold = 0.5;
  for (let i = 0; i < bins; i++) {
    wB += hist[i];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += i * hist[i];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) ** 2;
    if (between > best) {
      best = between;
      threshold = (i + 0.5) / bins;
    }
  }
  return threshold;
}

/** Fills pixels where known[i] === 0 by diffusing neighbouring known colours (push–pull). */
export function inpaint(r: Raster, known: Uint8Array): Raster {
  const { width: w, height: h } = r;
  const data = new Float32Array(w * h * 3);
  const k = new Uint8Array(known);
  for (let i = 0; i < w * h; i++) {
    data[i * 3] = r.data[i * 4];
    data[i * 3 + 1] = r.data[i * 4 + 1];
    data[i * 3 + 2] = r.data[i * 4 + 2];
  }
  let remaining = k.reduce((s, v) => s + (v ? 0 : 1), 0);
  if (remaining === w * h) {
    // nothing known — fall back to the global mean
    k.fill(1);
    remaining = 0;
  }
  let guard = 0;
  while (remaining > 0 && guard++ < Math.max(w, h)) {
    const next = new Uint8Array(k);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (k[i]) continue;
        let n = 0;
        let rr = 0;
        let gg = 0;
        let bb = 0;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
            const j = ny * w + nx;
            if (!k[j]) continue;
            n++;
            rr += data[j * 3];
            gg += data[j * 3 + 1];
            bb += data[j * 3 + 2];
          }
        if (n) {
          data[i * 3] = rr / n;
          data[i * 3 + 1] = gg / n;
          data[i * 3 + 2] = bb / n;
          next[i] = 1;
          remaining--;
        }
      }
    k.set(next);
  }
  // A few smoothing passes over the filled region so the fill is not streaky.
  for (let pass = 0; pass < 6; pass++)
    for (let y = 1; y < h - 1; y++)
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        if (known[i]) continue;
        for (let c = 0; c < 3; c++)
          data[i * 3 + c] =
            (data[(i - 1) * 3 + c] + data[(i + 1) * 3 + c] + data[(i - w) * 3 + c] + data[(i + w) * 3 + c]) / 4;
      }
  const out = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    out[i * 4] = data[i * 3];
    out[i * 4 + 1] = data[i * 3 + 1];
    out[i * 4 + 2] = data[i * 3 + 2];
    out[i * 4 + 3] = 255;
  }
  return { width: w, height: h, data: out, scale: r.scale };
}

export function boxIoU(a: Box, b: Box) {
  const x0 = Math.max(a.x, b.x);
  const y0 = Math.max(a.y, b.y);
  const x1 = Math.min(a.x + a.width, b.x + b.width);
  const y1 = Math.min(a.y + a.height, b.y + b.height);
  const inter = Math.max(0, x1 - x0) * Math.max(0, y1 - y0);
  const union = a.width * a.height + b.width * b.height - inter;
  return union > 0 ? inter / union : 0;
}

/** Fraction of `a` covered by `b`. */
export function boxCoverage(a: Box, b: Box) {
  const x0 = Math.max(a.x, b.x);
  const y0 = Math.max(a.y, b.y);
  const x1 = Math.min(a.x + a.width, b.x + b.width);
  const y1 = Math.min(a.y + a.height, b.y + b.height);
  const inter = Math.max(0, x1 - x0) * Math.max(0, y1 - y0);
  return a.width * a.height > 0 ? inter / (a.width * a.height) : 0;
}

export const scaleBox = (b: Box, s: number): Box => ({
  x: b.x * s,
  y: b.y * s,
  width: b.width * s,
  height: b.height * s,
});

export const padBox = (b: Box, p: number, w: number, h: number): Box => {
  const x = Math.max(0, b.x - p);
  const y = Math.max(0, b.y - p);
  return { x, y, width: Math.min(w, b.x + b.width + p) - x, height: Math.min(h, b.y + b.height + p) - y };
};

export const roundBox = (b: Box): Box => ({
  x: Math.round(b.x),
  y: Math.round(b.y),
  width: Math.round(b.width),
  height: Math.round(b.height),
});

/** Yields to the event loop so progress UI can paint between heavy steps. */
export const nextFrame = () => new Promise<void>((r) => setTimeout(r, 0));
