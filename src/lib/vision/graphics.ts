// Flat graphics (logos, icons, badges, stickers) on any background, photos
// included. Graphics are built from patches of nearly uniform colour with
// crisp edges; photographic texture and out-of-focus blobs change colour
// gradually, so their edges are soft. Patches are found by flood fill, kept
// when their outline is a hard step, and joined into objects.
import { colorDistance, type RGB } from "../color";
import type { Box } from "../types";
import { makeCanvas, release } from "./raster";

const MAX_DIM = 720;

export interface GraphicsMap {
  /** Analysis raster size and its scale to image pixels. */
  w: number;
  h: number;
  scale: number;
  /** 1 where a kept graphic patch is. */
  mask: Uint8Array;
  /** Joined graphic objects, in image pixels. */
  boxes: { box: Box; area: number; fill: number; meanColor: RGB }[];
}

/**
 * @param skip image-pixel boxes to ignore (text lines)
 * @param fg   optional foreground test in 0..1 image coordinates (the AI matte)
 */
export function findGraphics(img: CanvasImageSource & { width: number; height: number }, imgW: number, imgH: number, skip: Box[], fg?: (u: number, v: number) => boolean): GraphicsMap {
  const s = Math.min(1, MAX_DIM / Math.max(imgW, imgH));
  const w = Math.max(1, Math.round(imgW * s));
  const h = Math.max(1, Math.round(imgH * s));
  const { canvas, ctx } = makeCanvas(w, h);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, w, h);
  const d = ctx.getImageData(0, 0, w, h).data;
  release(canvas);
  const n = w * h;
  const col = (i: number): RGB => [d[i * 4], d[i * 4 + 1], d[i * 4 + 2]];

  // Pixels never part of a graphic: text lines, the matte's subject, the frame edge.
  const blocked = new Uint8Array(n);
  for (const b of skip) {
    const pad = b.height * 0.15;
    for (let y = Math.max(0, Math.floor((b.y - pad) * s)); y < Math.min(h, Math.ceil((b.y + b.height + pad) * s)); y++)
      for (let x = Math.max(0, Math.floor((b.x - pad) * s)); x < Math.min(w, Math.ceil((b.x + b.width + pad) * s)); x++) blocked[y * w + x] = 1;
  }
  if (fg) for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (fg((x + 0.5) / w, (y + 0.5) / h)) blocked[y * w + x] = 1;

  // ---- uniform patches
  const label = new Int32Array(n).fill(-1);
  const patches: { area: number; x0: number; y0: number; x1: number; y1: number; sum: number[]; crisp: number; edge: number; touches: boolean }[] = [];
  const stack: number[] = [];
  const minArea = Math.max(12, n * 0.00008);
  const maxArea = n * 0.06;
  for (let st = 0; st < n; st++) {
    if (label[st] !== -1 || blocked[st]) continue;
    const id = patches.length;
    const seed = col(st);
    const p = { area: 0, x0: w, y0: h, x1: 0, y1: 0, sum: [0, 0, 0], crisp: 0, edge: 0, touches: false };
    stack.push(st);
    label[st] = id;
    while (stack.length) {
      const i = stack.pop()!;
      const x = i % w;
      const y = (i / w) | 0;
      const c = col(i);
      p.area++;
      p.sum[0] += c[0];
      p.sum[1] += c[1];
      p.sum[2] += c[2];
      if (x < p.x0) p.x0 = x;
      if (x > p.x1) p.x1 = x;
      if (y < p.y0) p.y0 = y;
      if (y > p.y1) p.y1 = y;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) p.touches = true;
      if (p.area > maxArea) continue; // too big to be a graphic; finish labelling cheaply
      for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1]) {
        if (j < 0 || label[j] !== -1 || blocked[j]) continue;
        const cj = col(j);
        if (colorDistance(cj, c) < 12 && colorDistance(cj, seed) < 30) {
          label[j] = id;
          stack.push(j);
        }
      }
    }
    patches.push(p);
  }

  // ---- crisp outlines: across the boundary, colour must jump within two pixels.
  for (let y = 2; y < h - 2; y++)
    for (let x = 2; x < w - 2; x++) {
      const i = y * w + x;
      const id = label[i];
      if (id < 0) continue;
      const p = patches[id];
      if (p.area < minArea || p.area > maxArea) continue;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const j = i + dx + dy * w;
        if (label[j] === id) continue;
        p.edge++;
        // Two steps out, past any anti-aliased pixel.
        const k = i + 2 * dx + 2 * dy * w;
        const inner = col(i);
        if (colorDistance(col(k), inner) > 45 && colorDistance(col(j), inner) > 15) p.crisp++;
        break;
      }
    }
  const keep = patches.map(
    (p) =>
      p.area >= minArea &&
      p.area <= maxArea &&
      !p.touches &&
      p.edge > 0 &&
      p.crisp / p.edge > 0.55 &&
      // Thin slivers are edges of something else, not shapes.
      Math.min(p.x1 - p.x0, p.y1 - p.y0) >= 3,
  );
  const mask = new Uint8Array(n);
  for (let i = 0; i < n; i++) if (label[i] >= 0 && keep[label[i]]) mask[i] = 1;

  // ---- join touching / nested patches into objects
  const groups: { x0: number; y0: number; x1: number; y1: number; area: number; sum: number[] }[] = [];
  for (const [id, p] of patches.entries()) {
    if (!keep[id]) continue;
    groups.push({ x0: p.x0, y0: p.y0, x1: p.x1, y1: p.y1, area: p.area, sum: [...p.sum] });
  }
  const gap = 2;
  let merged = true;
  while (merged) {
    merged = false;
    for (let a = 0; a < groups.length && !merged; a++)
      for (let b = a + 1; b < groups.length; b++) {
        const A = groups[a];
        const B = groups[b];
        if (A.x0 - gap > B.x1 || B.x0 - gap > A.x1 || A.y0 - gap > B.y1 || B.y0 - gap > A.y1) continue;
        A.x0 = Math.min(A.x0, B.x0);
        A.y0 = Math.min(A.y0, B.y0);
        A.x1 = Math.max(A.x1, B.x1);
        A.y1 = Math.max(A.y1, B.y1);
        A.area += B.area;
        A.sum = A.sum.map((v, k) => v + B.sum[k]);
        groups.splice(b, 1);
        merged = true;
        break;
      }
  }
  const boxes = groups
    .map((g) => {
      const bw = g.x1 - g.x0 + 1;
      const bh = g.y1 - g.y0 + 1;
      return {
        box: { x: g.x0 / s, y: g.y0 / s, width: bw / s, height: bh / s },
        area: g.area / (s * s),
        fill: g.area / (bw * bh),
        meanColor: g.sum.map((v) => Math.round(v / g.area)) as RGB,
        rel: (bw * bh) / n,
        aspect: bh / bw,
      };
    })
    // A graphic is a reasonably solid, not-too-elongated shape of some size.
    .filter((g) => g.rel > 0.0012 && g.rel < 0.08 && g.fill > 0.3 && g.aspect > 0.25 && g.aspect < 4)
    .map(({ rel: _r, aspect: _a, ...g }) => g);
  return { w, h, scale: 1 / s, mask, boxes };
}
