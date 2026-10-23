// On-device AI models, self-hosted and run in a worker (public/ml-worker.mjs):
//  - ISNet (DIS, Apache-2.0): salient-object matte for cut-outs.
//  - MI-GAN (Picsart, MIT): inpainting for the background plate.
//  - PP-OCRv4 detection + recognition (PaddleOCR, Apache-2.0): text (paddle.ts).
// Everything degrades to the classical pipeline when the models can't load.
import { makeCanvas, release } from "./raster";

export const MODELS = {
  matte: { url: "/models/isnet-general-q8.onnx", size: 1024, mb: 47 },
  inpaint: { url: "/models/migan-fp16.onnx", size: 512, mb: 13 },
  textDet: { url: "/models/ppocrv4-det.onnx", size: 0, mb: 5 },
  textRec: { url: "/models/ppocrv4-rec.onnx", size: 0, mb: 11 },
} as const;
export type ModelName = keyof typeof MODELS;

interface Tensor {
  data: Float32Array;
  dims: number[];
}

let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void; onProgress?: (p: number) => void }>();
const ready = new Map<ModelName, Promise<string>>();
let disabled = false;

function getWorker() {
  if (worker) return worker;
  worker = new Worker("/ml-worker.mjs", { type: "module" });
  worker.onmessage = ({ data }) => {
    const p = pending.get(data.id);
    if (!p) return;
    if (data.type === "progress") return p.onProgress?.(data.total ? data.loaded / data.total : 0);
    pending.delete(data.id);
    if (data.type === "error") p.reject(new Error(data.message));
    else p.resolve(data.type === "ready" ? data.backend : data.outputs);
  };
  worker.onerror = (e) => {
    for (const p of pending.values()) p.reject(new Error(e.message || "AI worker failed"));
    pending.clear();
    worker = null;
    ready.clear();
  };
  return worker;
}

function call<T>(msg: Record<string, unknown>, transfer: Transferable[] = [], onProgress?: (p: number) => void): Promise<T> {
  const id = ++seq;
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve: resolve as (v: unknown) => void, reject, onProgress });
    getWorker().postMessage({ ...msg, id }, transfer);
  });
}

/** True when this browser can run the models at all. */
export function mlSupported() {
  return !disabled && typeof Worker !== "undefined" && typeof WebAssembly === "object";
}

/** Loads (downloading once, then from cache) a model; resolves to the backend in use. */
export function loadModel(name: ModelName, onProgress?: (p: number) => void): Promise<string> {
  let p = ready.get(name);
  if (!p) {
    p = call<string>({ type: "load", model: name, url: MODELS[name].url }, [], onProgress);
    p.catch(() => ready.delete(name));
    ready.set(name, p);
  }
  return p;
}

export async function runModel(name: ModelName, feeds: Record<string, Tensor>, outputs?: string[]) {
  await loadModel(name);
  const transfer = Object.values(feeds).map((t) => t.data.buffer);
  return call<Record<string, Tensor>>({ type: "run", model: name, feeds, outputs }, transfer);
}

/** Disables the models for the rest of the session (after a failure). */
export function disableMl() {
  disabled = true;
  worker?.terminate();
  worker = null;
  ready.clear();
}

// ---------------------------------------------------------------- matte

/** Soft foreground matte (0..1) at the model's size, stretched over the whole image. */
export interface Matte {
  w: number;
  h: number;
  data: Float32Array;
}

export async function matte(img: CanvasImageSource): Promise<Matte> {
  const S = MODELS.matte.size;
  const { canvas, ctx } = makeCanvas(S, S);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, S, S);
  const px = ctx.getImageData(0, 0, S, S).data;
  release(canvas);
  const n = S * S;
  const input = new Float32Array(3 * n);
  const mean = [0.485, 0.456, 0.406];
  for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) input[c * n + i] = px[i * 4 + c] / 255 - mean[c];
  const out = await runModel("matte", { input_image: { data: input, dims: [1, 3, S, S] } }, ["output_image"]);
  const y = out.output_image.data;
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < n; i++) {
    if (y[i] < lo) lo = y[i];
    if (y[i] > hi) hi = y[i];
  }
  const span = hi - lo || 1;
  const data = new Float32Array(n);
  for (let i = 0; i < n; i++) data[i] = (y[i] - lo) / span;
  return { w: S, h: S, data };
}

/** Matte value at fractional image position (u, v in 0..1), bilinear. */
export function matteAt(m: Matte, u: number, v: number) {
  const x = Math.min(m.w - 1, Math.max(0, u * m.w - 0.5));
  const y = Math.min(m.h - 1, Math.max(0, v * m.h - 0.5));
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(m.w - 1, x0 + 1);
  const y1 = Math.min(m.h - 1, y0 + 1);
  const fx = x - x0;
  const fy = y - y0;
  const d = m.data;
  return (
    (d[y0 * m.w + x0] * (1 - fx) + d[y0 * m.w + x1] * fx) * (1 - fy) + (d[y1 * m.w + x0] * (1 - fx) + d[y1 * m.w + x1] * fx) * fy
  );
}

/** The matte resampled to w×h. */
export function matteGrid(m: Matte, w: number, h: number): Float32Array {
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) out[y * w + x] = matteAt(m, (x + 0.5) / w, (y + 0.5) / h);
  return out;
}

// ---------------------------------------------------------------- inpainting

/**
 * Fills the pixels flagged in `hole` (W×H, 1 = fill) on the canvas in place.
 * Holes are grouped, and each group is filled through square windows a few
 * times the hole's thickness, so thin text lines keep near-full resolution
 * while large cut-out areas still get enough context.
 */
export async function inpaint(ctx: CanvasRenderingContext2D, hole: Uint8Array, onProgress?: (p: number) => void) {
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  const S = MODELS.inpaint.size;
  const windows = holeWindows(hole, W, H, S);
  const net = makeCanvas(S, S);
  for (const [k, win] of windows.entries()) {
    const { x, y, s } = win;
    // Skip windows whose hole was already filled by an earlier one.
    let any = false;
    for (let yy = y; yy < y + s && !any; yy += 2) for (let xx = x; xx < x + s; xx += 2) if (hole[yy * W + xx]) { any = true; break; }
    if (!any) continue;
    net.ctx.clearRect(0, 0, S, S);
    net.ctx.imageSmoothingQuality = "high";
    net.ctx.drawImage(ctx.canvas, x, y, s, s, 0, 0, S, S);
    const px = net.ctx.getImageData(0, 0, S, S).data;
    const n = S * S;
    const input = new Float32Array(4 * n);
    const k2 = s / S;
    const m = new Uint8Array(n);
    for (let j = 0; j < S; j++)
      for (let i = 0; i < S; i++) {
        // A network pixel is a hole if any source pixel under it is.
        const sx0 = x + Math.floor(i * k2);
        const sy0 = y + Math.floor(j * k2);
        const sx1 = Math.min(x + s - 1, x + Math.ceil((i + 1) * k2) - 1);
        const sy1 = Math.min(y + s - 1, y + Math.ceil((j + 1) * k2) - 1);
        let h = 0;
        for (let sy = sy0; sy <= sy1 && !h; sy++) for (let sx = sx0; sx <= sx1; sx++) if (hole[sy * W + sx]) { h = 1; break; }
        m[j * S + i] = h;
      }
    for (let p = 0; p < n; p++) {
      const keep = 1 - m[p];
      input[p] = 0.5 - m[p];
      for (let c = 0; c < 3; c++) input[(c + 1) * n + p] = (px[p * 4 + c] / 127.5 - 1) * keep;
    }
    const out = await runModel("inpaint", { input: { data: input, dims: [1, 4, S, S] } });
    const y3 = out.output.data;
    const res = new ImageData(S, S);
    for (let p = 0; p < n; p++) {
      for (let c = 0; c < 3; c++) res.data[p * 4 + c] = (y3[c * n + p] + 1) * 127.5;
      res.data[p * 4 + 3] = 255;
    }
    net.ctx.putImageData(res, 0, 0);
    // Scale the fill back to the window and copy only hole pixels.
    const back = makeCanvas(s, s);
    back.ctx.imageSmoothingQuality = "high";
    back.ctx.drawImage(net.canvas, 0, 0, s, s);
    const fill = back.ctx.getImageData(0, 0, s, s).data;
    const cur = ctx.getImageData(x, y, s, s);
    for (let yy = 0; yy < s; yy++)
      for (let xx = 0; xx < s; xx++) {
        const g = (y + yy) * W + x + xx;
        if (!hole[g]) continue;
        const i = (yy * s + xx) * 4;
        cur.data[i] = fill[i];
        cur.data[i + 1] = fill[i + 1];
        cur.data[i + 2] = fill[i + 2];
        hole[g] = 0;
      }
    ctx.putImageData(cur, x, y);
    release(back.canvas);
    onProgress?.((k + 1) / windows.length);
  }
  release(net.canvas);
}

/** Square windows covering every hole group. */
function holeWindows(hole: Uint8Array, W: number, H: number, S: number) {
  // Group holes on a coarse grid; nearby letters of one line join up.
  const f = Math.max(1, Math.ceil(Math.max(W, H) / 400));
  const gw = Math.ceil(W / f);
  const gh = Math.ceil(H / f);
  const grid = new Uint8Array(gw * gh);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (hole[y * W + x]) grid[((y / f) | 0) * gw + ((x / f) | 0)] = 1;
  const gap = 3;
  const grown = new Uint8Array(gw * gh);
  for (let y = 0; y < gh; y++)
    for (let x = 0; x < gw; x++) {
      if (!grid[y * gw + x]) continue;
      for (let dy = -gap; dy <= gap; dy++)
        for (let dx = -gap; dx <= gap; dx++) {
          const yy = y + dy;
          const xx = x + dx;
          if (yy >= 0 && yy < gh && xx >= 0 && xx < gw) grown[yy * gw + xx] = 1;
        }
    }
  const seen = new Uint8Array(gw * gh);
  const boxes: { x0: number; y0: number; x1: number; y1: number }[] = [];
  const stack: number[] = [];
  for (let st = 0; st < gw * gh; st++) {
    if (!grid[st] || seen[st]) continue;
    let x0 = gw, y0 = gh, x1 = 0, y1 = 0;
    stack.push(st);
    seen[st] = 1;
    while (stack.length) {
      const i = stack.pop()!;
      const x = i % gw;
      const y = (i / gw) | 0;
      if (grid[i]) {
        x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
      }
      for (const j of [x > 0 ? i - 1 : -1, x < gw - 1 ? i + 1 : -1, y > 0 ? i - gw : -1, y < gh - 1 ? i + gw : -1])
        if (j >= 0 && grown[j] && !seen[j]) {
          seen[j] = 1;
          stack.push(j);
        }
    }
    boxes.push({ x0: x0 * f, y0: y0 * f, x1: Math.min(W, (x1 + 1) * f), y1: Math.min(H, (y1 + 1) * f) });
  }
  const minDim = Math.min(W, H);
  const out: { x: number; y: number; s: number }[] = [];
  for (const b of boxes) {
    const bw = b.x1 - b.x0;
    const bh = b.y1 - b.y0;
    // Context of about one hole-thickness on each side, never below the
    // network's own size (no upscaling) and never past the image.
    const s = Math.min(minDim, Math.max(Math.min(S, minDim), Math.round(Math.min(bw, bh) * 2.6)));
    const core = Math.max(1, Math.round(s * 0.6));
    const along = bw >= bh ? "x" : "y";
    const L = along === "x" ? bw : bh;
    const count = L + (s - core) <= s ? 1 : Math.ceil(L / core);
    for (let i = 0; i < count; i++) {
      const c = count === 1 ? (along === "x" ? b.x0 + bw / 2 : b.y0 + bh / 2) : (along === "x" ? b.x0 : b.y0) + core * (i + 0.5) * (L / (core * count));
      const cx = along === "x" ? c : b.x0 + bw / 2;
      const cy = along === "y" ? c : b.y0 + bh / 2;
      out.push({
        x: Math.round(Math.min(W - s, Math.max(0, cx - s / 2))),
        y: Math.round(Math.min(H - s, Math.max(0, cy - s / 2))),
        s,
      });
    }
  }
  return out;
}
