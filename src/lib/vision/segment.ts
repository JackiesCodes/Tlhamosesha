// Foreground/background separation and region proposals.
//
// This is the on-device fallback for the YOLO + SAM stage: a background colour
// model is learnt from the image border, combined with edge energy into a
// saliency map, thresholded (Otsu), cleaned with morphology and split into
// connected components. When a vision service or LLM provider is configured
// their detections are merged on top of these proposals.
import { colorDistance, kmeans, type RGB } from "../color";
import type { Box } from "../types";
import { boxCoverage, dilate, erode, luminanceMap, otsu, px, sobel, type Raster } from "./raster";

export interface Region {
  box: Box; // raster px
  area: number; // pixel count
  fill: number; // area / box area
  skin: number; // share of skin-tone pixels
  meanColor: RGB;
  label: number;
}

export interface Segmentation {
  bgColors: RGB[];
  saliency: Float32Array;
  mask: Uint8Array;
  labels: Int32Array;
  regions: Region[];
  edgeDensity: number;
}

export function learnBackground(r: Raster): RGB[] {
  const border: RGB[] = [];
  const ring = Math.max(2, Math.round(Math.min(r.width, r.height) * 0.02));
  for (let y = 0; y < r.height; y++)
    for (let x = 0; x < r.width; x++) {
      if (x >= ring && y >= ring && x < r.width - ring && y < r.height - ring) continue;
      if ((x + y) % 2) continue;
      border.push(px(r, x, y));
    }
  const clusters = kmeans(border, 6, 8);
  const total = clusters.reduce((s, c) => s + c.count, 0) || 1;
  const kept = clusters.filter((c) => c.count / total > 0.06).map((c) => c.center);
  return kept.length ? kept : clusters.slice(0, 1).map((c) => c.center);
}

/** RGB rule (Kovac et al.) intersected with the YCbCr skin cluster. */
export const isSkin = ([r, g, b]: RGB) => {
  if (!(r > 95 && g > 40 && b > 20 && r > g && r > b && r - Math.min(g, b) > 15 && Math.abs(r - g) > 15)) return false;
  const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
  const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
  return cb >= 77 && cb <= 127 && cr >= 133 && cr <= 173;
};

export function segment(r: Raster, sensitivity = 0.5): Segmentation {
  const { width: w, height: h } = r;
  const n = w * h;
  const bgColors = learnBackground(r);
  const lum = luminanceMap(r);
  const edges = sobel(lum, w, h);

  // Colour distance to the nearest background cluster, normalised.
  const dist = new Float32Array(n);
  let maxD = 1e-6;
  for (let i = 0; i < n; i++) {
    const c: RGB = [r.data[i * 4], r.data[i * 4 + 1], r.data[i * 4 + 2]];
    let d = Infinity;
    for (const bg of bgColors) d = Math.min(d, colorDistance(c, bg));
    dist[i] = d;
    if (d > maxD) maxD = d;
  }

  // Local edge energy (box-blurred) helps on gradient / photographic backgrounds.
  const edgeBlur = boxBlur(edges, w, h, 2);
  const saliency = new Float32Array(n);
  let edgeCount = 0;
  for (let i = 0; i < n; i++) {
    const d = Math.min(1, dist[i] / Math.min(maxD, 380));
    saliency[i] = 0.72 * d + 0.28 * Math.min(1, edgeBlur[i] * 3);
    if (edges[i] > 0.18) edgeCount++;
  }

  let t = otsu(saliency);
  t = t * (1.25 - sensitivity * 0.5); // sensitivity 0..1 → looser/tighter
  let mask: Uint8Array = new Uint8Array(n);
  for (let i = 0; i < n; i++) mask[i] = saliency[i] > t ? 1 : 0;

  const closeR = Math.max(1, Math.round(Math.min(w, h) / 140));
  mask = erode(dilate(mask, w, h, closeR + 1), w, h, closeR);

  let { labels, regions } = components(r, mask);

  // Large, loosely-filled regions are usually several subjects joined by a
  // glow or shadow. Re-threshold inside them and split when that separates
  // at least two meaningful parts.
  for (let pass = 0; pass < 2; pass++) {
    const big = regions.filter((g) => (g.box.width * g.box.height) / n > 0.12 && g.fill < 0.75);
    if (!big.length) break;
    let changed = false;
    for (const g of big) {
      const inside: number[] = [];
      for (let i = 0; i < n; i++) if (labels[i] === g.label) inside.push(i);
      const vals = new Float32Array(inside.map((i) => saliency[i]));
      const lt = otsu(vals);
      const sub = new Uint8Array(n);
      for (const i of inside) sub[i] = saliency[i] > lt ? 1 : 0;
      const splitCount = (m: Uint8Array) => components(r, m).regions.filter((p) => p.area > g.area * 0.04).length;
      let next = erode(dilate(sub, w, h, closeR), w, h, closeR);
      if (splitCount(next) < 2) {
        // Try an opening instead: breaks thin bridges (a button touching a shoe sole).
        const own = new Uint8Array(n);
        for (const i of inside) own[i] = 1;
        next = dilate(erode(own, w, h, closeR + 2), w, h, closeR + 2);
        for (let i = 0; i < n; i++) next[i] &= own[i];
        if (splitCount(next) < 2) continue;
      }
      changed = true;
      for (const i of inside) mask[i] = next[i];
    }
    if (!changed) break;
    ({ labels, regions } = components(r, mask));
  }
  return { bgColors, saliency, mask, labels, regions, edgeDensity: edgeCount / n };
}

function boxBlur(src: Float32Array, w: number, h: number, radius: number) {
  const tmp = new Float32Array(src.length);
  const out = new Float32Array(src.length);
  const span = radius * 2 + 1;
  for (let y = 0; y < h; y++) {
    let acc = 0;
    for (let x = -radius; x <= radius; x++) acc += src[y * w + Math.min(w - 1, Math.max(0, x))];
    for (let x = 0; x < w; x++) {
      tmp[y * w + x] = acc / span;
      acc += src[y * w + Math.min(w - 1, x + radius + 1)] - src[y * w + Math.max(0, x - radius)];
    }
  }
  for (let x = 0; x < w; x++) {
    let acc = 0;
    for (let y = -radius; y <= radius; y++) acc += tmp[Math.min(h - 1, Math.max(0, y)) * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = acc / span;
      acc += tmp[Math.min(h - 1, y + radius + 1) * w + x] - tmp[Math.max(0, y - radius) * w + x];
    }
  }
  return out;
}

function components(r: Raster, mask: Uint8Array) {
  const { width: w, height: h } = r;
  const labels = new Int32Array(w * h).fill(-1);
  const regions: Region[] = [];
  const stack: number[] = [];
  const minArea = w * h * 0.0015;
  for (let start = 0; start < w * h; start++) {
    if (!mask[start] || labels[start] !== -1) continue;
    const label = regions.length;
    let x0 = w;
    let y0 = h;
    let x1 = 0;
    let y1 = 0;
    let area = 0;
    let skin = 0;
    let sr = 0;
    let sg = 0;
    let sb = 0;
    stack.push(start);
    labels[start] = label;
    while (stack.length) {
      const i = stack.pop()!;
      const x = i % w;
      const y = (i / w) | 0;
      area++;
      const c: RGB = [r.data[i * 4], r.data[i * 4 + 1], r.data[i * 4 + 2]];
      sr += c[0];
      sg += c[1];
      sb += c[2];
      if (isSkin(c) && x < w - 1 && y < h - 1) {
        // Ignore anti-aliased edge blends, which often fall in the skin range.
        const j = i + 1;
        const k = i + w;
        const flat =
          Math.abs(r.data[j * 4] - c[0]) + Math.abs(r.data[j * 4 + 1] - c[1]) + Math.abs(r.data[j * 4 + 2] - c[2]) < 36 &&
          Math.abs(r.data[k * 4] - c[0]) + Math.abs(r.data[k * 4 + 1] - c[1]) + Math.abs(r.data[k * 4 + 2] - c[2]) < 36;
        if (flat) skin++;
      }
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      const nb = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1];
      for (const j of nb)
        if (j >= 0 && mask[j] && labels[j] === -1) {
          labels[j] = label;
          stack.push(j);
        }
    }
    const box = { x: x0, y: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };
    regions.push({
      box,
      area,
      fill: area / (box.width * box.height),
      skin: skin / area,
      meanColor: [sr / area, sg / area, sb / area].map(Math.round) as RGB,
      label,
    });
  }
  return { labels, regions: regions.filter((g) => g.area >= minArea) };
}

/**
 * Merges fragments into objects: a region mostly inside another's box, or two
 * small pieces that nearly touch (e.g. the letters of a word-mark). Separate
 * subjects whose boxes merely overlap stay apart.
 */
export function mergeNearby(regions: Region[], gap: number, rasterArea = Infinity): Region[] {
  const small = rasterArea * 0.012;
  const list = regions.map((r) => ({ ...r, box: { ...r.box }, labels: [r.label] as number[] }));
  let changed = true;
  while (changed) {
    changed = false;
    outer: for (let i = 0; i < list.length; i++)
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i].box;
        const b = list[j].box;
        const dx = Math.max(0, Math.max(a.x, b.x) - Math.min(a.x + a.width, b.x + b.width));
        const dy = Math.max(0, Math.max(a.y, b.y) - Math.min(a.y + a.height, b.y + b.height));
        const aArea = a.width * a.height;
        const bArea = b.width * b.height;
        const smaller = aArea < bArea ? list[i] : list[j];
        // A solid, reasonably sized shape inside another's box (a button over
        // a product, a badge beside a player) is its own element, not a fragment.
        const standalone = smaller.fill > 0.7 && smaller.box.width * smaller.box.height > rasterArea * 0.006;
        const contained = !standalone && boxCoverage(aArea < bArea ? a : b, aArea < bArea ? b : a) > 0.6;
        const fragments = aArea < small && bArea < small && dx <= gap && dy <= gap;
        if (contained || fragments) {
          const x = Math.min(a.x, b.x);
          const y = Math.min(a.y, b.y);
          const box = {
            x,
            y,
            width: Math.max(a.x + a.width, b.x + b.width) - x,
            height: Math.max(a.y + a.height, b.y + b.height) - y,
          };
          const area = list[i].area + list[j].area;
          list[i] = {
            ...list[i],
            box,
            area,
            fill: area / (box.width * box.height),
            skin: (list[i].skin * list[i].area + list[j].skin * list[j].area) / area,
            meanColor: list[i].meanColor.map(
              (v, k) => Math.round((v * list[i].area + list[j].meanColor[k] * list[j].area) / area),
            ) as RGB,
            labels: [...list[i].labels, ...list[j].labels],
          };
          list.splice(j, 1);
          changed = true;
          break outer;
        }
      }
  }
  return list;
}

export type MergedRegion = ReturnType<typeof mergeNearby>[number];
