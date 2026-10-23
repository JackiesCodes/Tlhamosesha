// Text detection and recognition with PaddleOCR's PP-OCRv4 models (Apache-2.0),
// run in the AI worker. A DB detector finds every text line, even over photos,
// and an SVTR recogniser reads each line crop. Recognition is restricted to
// Latin characters, so stylised letters are never read as CJK lookalikes.
import type { Box } from "../types";
import { loadModel, runModel } from "./ml";
import { makeCanvas, release } from "./raster";
import type { OcrLine } from "./text";

const DET_MAX = 1600; // longest side for detection (posters rarely need more)
const DET_MIN = 736; // shortest side, as the model was trained
const REC_H = 48;
const BOX_THRESH = 0.5;
const TEXT_SCORE = 0.5;
const UNCLIP = 1.6;

let keysPromise: Promise<{ chars: string[]; allowed: Uint8Array }> | null = null;
function keys() {
  keysPromise ??= fetch("/models/ppocrv4-rec-keys.json")
    .then((r) => r.json() as Promise<string[]>)
    .then((list) => {
      // Model classes: 0 = CTC blank, 1..n = the list, n+1 = space.
      const chars = ["", ...list, " "];
      const latin = /^[\x20-\x7E -ɏ€£¥₹–—‘’“”•©®™°]$/u;
      const allowed = new Uint8Array(chars.length);
      chars.forEach((c, i) => (allowed[i] = i === 0 || latin.test(c) ? 1 : 0));
      return { chars, allowed };
    });
  return keysPromise;
}

export function loadTextModels(onProgress?: (p: number) => void) {
  let a = 0;
  let b = 0;
  const report = () => onProgress?.((a + b) / 2);
  return Promise.all([
    loadModel("textDet", (p) => ((a = p), report())),
    loadModel("textRec", (p) => ((b = p), report())),
    keys(),
  ]);
}

/** Model input in BGR order, normalised to [-1, 1]. */
function toTensor(px: Uint8ClampedArray, w: number, h: number, padW = w) {
  const n = h * padW;
  const t = new Float32Array(3 * n);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const o = y * padW + x;
      t[o] = px[i + 2] / 127.5 - 1;
      t[n + o] = px[i + 1] / 127.5 - 1;
      t[2 * n + o] = px[i] / 127.5 - 1;
    }
  return t;
}

export async function runPaddleOcr(img: HTMLImageElement, onProgress?: (p: number, note?: string) => void): Promise<OcrLine[]> {
  await loadTextModels((p) => onProgress?.(p * 0.2, "Downloading text model (once)…"));
  const { chars, allowed } = await keys();
  const W = img.naturalWidth;
  const H = img.naturalHeight;

  // ---- detection
  let k = Math.min(1, DET_MAX / Math.max(W, H));
  if (Math.min(W, H) * k < DET_MIN) k = Math.min(DET_MIN / Math.min(W, H), DET_MAX * 1.5 / Math.max(W, H));
  const dw = Math.max(32, Math.round((W * k) / 32) * 32);
  const dh = Math.max(32, Math.round((H * k) / 32) * 32);
  const det = makeCanvas(dw, dh);
  det.ctx.imageSmoothingQuality = "high";
  det.ctx.drawImage(img, 0, 0, dw, dh);
  const out = await runModel("textDet", { x: { data: toTensor(det.ctx.getImageData(0, 0, dw, dh).data, dw, dh), dims: [1, 3, dh, dw] } });
  release(det.canvas);
  const prob = Object.values(out)[0].data;
  const boxes = detBoxes(prob, dw, dh).map((b) => ({
    x: (b.x * W) / dw,
    y: (b.y * H) / dh,
    width: (b.width * W) / dw,
    height: (b.height * H) / dh,
  }));
  onProgress?.(0.4, "Reading text");

  // ---- recognition, one line at a time
  const lines: OcrLine[] = [];
  const crop = makeCanvas(1, 1);
  for (const [i, b] of boxes.entries()) {
    if (b.height > b.width * 1.5) continue; // vertical text: not read
    const w = Math.max(8, Math.ceil((REC_H * b.width) / b.height));
    crop.canvas.width = w;
    crop.canvas.height = REC_H;
    crop.ctx.imageSmoothingQuality = "high";
    crop.ctx.drawImage(img, b.x, b.y, b.width, b.height, 0, 0, w, REC_H);
    const padW = Math.max(320, w);
    const res = await runModel("textRec", { x: { data: toTensor(crop.ctx.getImageData(0, 0, w, REC_H).data, w, REC_H, padW), dims: [1, 3, REC_H, padW] } });
    const { data, dims } = Object.values(res)[0];
    const [, T, C] = dims;
    let text = "";
    let last = 0;
    let conf = 0;
    let kept = 0;
    for (let t = 0; t < T; t++) {
      let best = 0;
      let bp = -1;
      for (let c = 0; c < C; c++) {
        if (!allowed[c]) continue;
        const p = data[t * C + c];
        if (p > bp) {
          bp = p;
          best = c;
        }
      }
      if (best !== 0 && best !== last) {
        text += chars[best];
        conf += bp;
        kept++;
      }
      last = best;
    }
    text = text.replace(/\s+/g, " ").trim();
    const score = kept ? conf / kept : 0;
    onProgress?.(0.4 + (0.6 * (i + 1)) / boxes.length, "Reading text");
    if (!text || score < TEXT_SCORE || !/[\p{L}\p{N}]/u.test(text)) continue;
    lines.push({ text, confidence: Math.round(score * 100), box: tighten(img, b) });
  }
  release(crop.canvas);
  return lines;
}

/** Axis-aligned text boxes from the DB probability map (threshold, components, unclip). */
function detBoxes(prob: Float32Array, w: number, h: number): Box[] {
  const bit = new Uint8Array(w * h);
  for (let i = 0; i < bit.length; i++) bit[i] = prob[i] > 0.3 ? 1 : 0;
  // 2×2 dilation, as PaddleOCR does, so thin gaps inside a word close up.
  for (let y = h - 1; y > 0; y--)
    for (let x = w - 1; x > 0; x--) {
      const i = y * w + x;
      if (bit[i - 1] || bit[i - w] || bit[i - w - 1]) bit[i] = bit[i] || 2;
    }
  const seen = new Uint8Array(w * h);
  const stack: number[] = [];
  const out: Box[] = [];
  for (let s = 0; s < bit.length; s++) {
    if (!bit[s] || seen[s]) continue;
    let x0 = w, y0 = h, x1 = 0, y1 = 0, sum = 0, n = 0;
    stack.push(s);
    seen[s] = 1;
    while (stack.length) {
      const i = stack.pop()!;
      const x = i % w;
      const y = (i / w) | 0;
      sum += prob[i];
      n++;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1])
        if (j >= 0 && bit[j] && !seen[j]) {
          seen[j] = 1;
          stack.push(j);
        }
    }
    const bw = x1 - x0 + 1;
    const bh = y1 - y0 + 1;
    if (Math.min(bw, bh) < 3 || sum / n < BOX_THRESH) continue;
    // The network predicts a shrunk text kernel; grow it back (DB "unclip").
    const d = (bw * bh * UNCLIP) / (2 * (bw + bh));
    const bx0 = Math.max(0, x0 - d);
    const by0 = Math.max(0, y0 - d);
    const bx1 = Math.min(w, x1 + 1 + d);
    const by1 = Math.min(h, y1 + 1 + d);
    if (bx1 - bx0 < 4 || by1 - by0 < 4) continue;
    out.push({ x: bx0, y: by0, width: bx1 - bx0, height: by1 - by0 });
  }
  return out.sort((a, b) => a.y - b.y || a.x - b.x);
}

/**
 * Shrinks a detector box to the letters' ink, which the rest of the pipeline
 * (size, colour, font matching, the background fill) expects. The ink is the
 * colour cluster that differs from the box's border.
 */
function tighten(img: HTMLImageElement, b: Box): Box {
  const W = Math.max(1, Math.round(b.width));
  const H = Math.max(1, Math.round(b.height));
  const s = Math.min(1, 96 / H);
  const w = Math.max(1, Math.round(W * s));
  const h = Math.max(1, Math.round(H * s));
  const { canvas, ctx } = makeCanvas(w, h);
  ctx.drawImage(img, b.x, b.y, b.width, b.height, 0, 0, w, h);
  const d = ctx.getImageData(0, 0, w, h).data;
  release(canvas);
  const ring: number[][] = [];
  for (let x = 0; x < w; x++) ring.push(px(d, x, 0, w), px(d, x, h - 1, w));
  for (let y = 0; y < h; y++) ring.push(px(d, 0, y, w), px(d, w - 1, y, w));
  const med = [0, 1, 2].map((c) => ring.map((p) => p[c]).sort((a, b) => a - b)[ring.length >> 1]);
  const spread = ring.map((p) => dist(p, med)).sort((a, b) => a - b)[Math.floor(ring.length * 0.8)];
  const tol = Math.max(40, spread * 1.5);
  const rows = new Uint16Array(h);
  const cols = new Uint16Array(w);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (dist(px(d, x, y, w), med) > tol) {
        rows[y]++;
        cols[x]++;
      }
  const rowMin = Math.max(1, w * 0.01);
  let y0 = 0;
  while (y0 < h && rows[y0] < rowMin) y0++;
  let y1 = h - 1;
  while (y1 > y0 && rows[y1] < rowMin) y1--;
  let x0 = 0;
  while (x0 < w && !cols[x0]) x0++;
  let x1 = w - 1;
  while (x1 > x0 && !cols[x1]) x1--;
  // Nothing clear (busy background): keep the detector's box.
  if (y1 - y0 < h * 0.3 || x1 - x0 < w * 0.3) return b;
  return { x: b.x + x0 / s, y: b.y + y0 / s, width: (x1 - x0 + 1) / s, height: (y1 - y0 + 1) / s };
}

const px = (d: Uint8ClampedArray, x: number, y: number, w: number) => {
  const i = (y * w + x) * 4;
  return [d[i], d[i + 1], d[i + 2]];
};
const dist = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
