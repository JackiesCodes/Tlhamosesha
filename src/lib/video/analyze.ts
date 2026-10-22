// Video breakdown: split into scenes, run the still-image pipeline on each
// scene's keyframe(s), then time every layer across its scene.
import type { AnalysisResult, Box, DetectedObject, TextElement } from "../types";
import { boxIoU } from "../vision/raster";
import { runPipeline } from "../vision/pipeline";
import { count, detectCuts, edges, persistence, shrink, type Cut, type Mini } from "./cuts";
import { captureFrames, closeVideo, frameAt, grabFrame, grayAt, openVideo, type FrameSet } from "./frames";

export interface Timed {
  /** seconds, when the layer is half-way in and half-way out */
  in: number;
  out: number;
}

export interface VideoScene {
  start: number;
  end: number;
  keyframes: number[];
  thumbnail: string;
  texts: (TextElement & Timed)[];
  objects: (DetectedObject & Timed)[];
  analysis: AnalysisResult;
}

export interface VideoBreakdown {
  width: number;
  height: number;
  duration: number;
  framesAnalysed: number;
  cuts: Cut[];
  scenes: VideoScene[];
  /** seconds spent in each stage */
  timings: Record<"decode" | "cuts" | "keyframes" | "timing" | "total", number>;
}

export interface VideoOptions {
  ocr: boolean;
  ocrInvertPass: boolean;
  sensitivity: number;
  maxObjects: number;
  onStatus?: (stage: string, progress: number) => void;
}

const now = () => performance.now() / 1000;

export async function analyzeVideo(src: string, fileName: string, opt: VideoOptions): Promise<VideoBreakdown> {
  const t0 = now();
  const timings = { decode: 0, cuts: 0, keyframes: 0, timing: 0, total: 0 };
  const video = await openVideo(src);

  opt.onStatus?.("Reading frames", 0);
  let t = now();
  const fs = await captureFrames(video, { onProgress: (p) => opt.onStatus?.("Reading frames", p) });
  timings.decode = now() - t;

  opt.onStatus?.("Finding scenes", 0);
  t = now();
  const mini = shrink(fs);
  const cuts = detectCuts(fs, mini);
  for (const c of cuts) if (c.type === "cut") c.time = await refineCut(video, fs, c.time);
  const bounds = [0, ...cuts.map((c) => c.time), fs.duration];
  timings.cuts = now() - t;

  // Grab every keyframe first, then close the video so its decoder isn't held
  // while the (memory-hungry) still-image analysis runs.
  t = now();
  const plan: { start: number; end: number; keys: { t: number; url: string }[] }[] = [];
  for (let s = 0; s + 1 < bounds.length; s++) {
    const keys = [];
    for (const kt of pickKeyframes(fs, mini, bounds[s], bounds[s + 1], cuts)) keys.push({ t: kt, url: await grabFrame(video, kt) });
    plan.push({ start: bounds[s], end: bounds[s + 1], keys });
  }
  closeVideo(video);
  let tKey = now() - t;

  const scenes: VideoScene[] = [];
  let tTime = 0;
  for (const [s, { start, end, keys }] of plan.entries()) {
    opt.onStatus?.(`Breaking down scene ${s + 1} of ${plan.length}`, s / plan.length);
    t = now();
    const results: { analysis: AnalysisResult; thumbnail: string; t: number }[] = [];
    for (const key of keys) {
      try {
        const out = await runPipeline(key.url, {
          fileName: `${fileName} @ ${key.t.toFixed(2)}s`,
          fileSize: 0,
          mimeType: "image/png",
          ocr: opt.ocr,
          ocrInvertPass: opt.ocrInvertPass,
          cloud: false,
          sensitivity: opt.sensitivity,
          maxObjects: opt.maxObjects,
          onStep: () => {},
        });
        results.push({ analysis: out.analysis, thumbnail: out.thumbnail, t: key.t });
      } finally {
        URL.revokeObjectURL(key.url);
      }
    }
    tKey += now() - t;

    // Merge layers found on different keyframes; boxes go to video pixels.
    t = now();
    const texts: (TextElement & { key: number })[] = [];
    const objects: (DetectedObject & { key: number })[] = [];
    for (const r of results) {
      const k = fs.width / r.analysis.metadata.width;
      const toVideo = (b: Box) => ({ x: b.x * k, y: b.y * k, width: b.width * k, height: b.height * k });
      for (const x of r.analysis.texts) {
        const box = toVideo(x.box);
        if (!texts.some((o) => boxIoU(o.box, box) > 0.5 && o.text === x.text))
          texts.push({ ...x, box, font: { ...x.font, sizePx: x.font.sizePx * k }, key: r.t });
      }
      for (const x of r.analysis.objects) {
        const box = toVideo(x.box);
        if (!objects.some((o) => boxIoU(o.box, box) > 0.5)) objects.push({ ...x, box, key: r.t });
      }
    }
    scenes.push({
      start,
      end,
      keyframes: keys.map((k) => k.t),
      thumbnail: results[0].thumbnail,
      texts: texts.map(({ key, ...x }) => ({ ...x, ...visibility(fs, x.box, start, end, key) })),
      objects: objects.map(({ key, ...x }) => ({ ...x, ...visibility(fs, x.box, start, end, key) })),
      analysis: results[0].analysis,
    });
    tTime += now() - t;
  }
  timings.keyframes = tKey;
  timings.timing = tTime;
  timings.total = now() - t0;
  return { width: fs.width, height: fs.height, duration: fs.duration, framesAnalysed: fs.frames.length, cuts, scenes, timings };
}

/**
 * The frame showing the most content, away from the transitions. If other
 * frames show sizeable content it lacks (layers that leave before the busiest
 * moment), the most different of them becomes a second keyframe.
 */
function pickKeyframes(fs: FrameSet, mini: Mini, start: number, end: number, cuts: Cut[]): number[] {
  const margin = (c?: Cut) => (c ? c.length / 2 + 0.12 : 0);
  const lo = start + margin(cuts.find((c) => Math.abs(c.time - start) < 1e-6));
  const hi = end - margin(cuts.find((c) => Math.abs(c.time - end) < 1e-6));
  const idx: number[] = [];
  for (let i = frameAt(fs, lo); i <= frameAt(fs, hi); i++) if (fs.frames[i].t >= lo && fs.frames[i].t <= hi) idx.push(i);
  if (!idx.length) return [(start + end) / 2];
  const E = new Map(idx.map((i) => [i, edges(mini, mini.frames[i])]));
  const best = idx.reduce((a, b) => (count(E.get(b)!) > count(E.get(a)!) ? b : a));
  const keys = [fs.frames[best].t];
  let worst = -1;
  let worstKept = 1;
  for (const i of idx) {
    if (Math.abs(fs.frames[i].t - keys[0]) < 0.5 || count(E.get(i)!) < count(E.get(best)!) * 0.15) continue;
    const kept = persistence(mini, E.get(i)!, E.get(best)!);
    if (kept < worstKept) {
      worstKept = kept;
      worst = i;
    }
  }
  if (worst >= 0 && worstKept < 0.75) keys.push(fs.frames[worst].t);
  return keys;
}

/**
 * When a layer is on screen: compare its box in every frame of the scene with
 * the keyframe where it was found. It counts as visible once it is more than
 * half-way from its "absent" look to its keyframe look.
 */
function visibility(fs: FrameSet, box: Box, start: number, end: number, keyT: number): Timed {
  const k = fs.w / fs.width;
  const x0 = Math.max(0, Math.floor(box.x * k));
  const y0 = Math.max(0, Math.floor(box.y * k));
  const x1 = Math.min(fs.w, Math.ceil((box.x + box.width) * k));
  const y1 = Math.min(fs.h, Math.ceil((box.y + box.height) * k));
  const ref = fs.frames[frameAt(fs, keyT)].data;
  const a = frameAt(fs, start);
  const b = frameAt(fs, end);
  const ts: number[] = [];
  const d: number[] = [];
  for (let i = a; i <= b; i++) {
    const f = fs.frames[i];
    if (f.t < start - 1e-6 || f.t > end + 1e-6) continue;
    let s = 0;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) s += Math.abs(f.data[y * fs.w + x] - ref[y * fs.w + x]);
    ts.push(f.t);
    d.push(s / Math.max(1, (x1 - x0) * (y1 - y0)));
  }
  const max = Math.max(0, ...d);
  if (max < 6 || !d.length) return { in: start, out: end };
  const half = max / 2;
  const vis = d.map((v) => v < half);
  const first = vis.indexOf(true);
  const last = vis.lastIndexOf(true);
  if (first < 0) return { in: keyT, out: keyT };
  // Interpolate the crossing between neighbouring samples.
  const cross = (i: number, j: number) => {
    if (j < 0 || j >= d.length) return ts[i];
    const f = (d[j] - half) / Math.max(1e-6, d[j] - d[i]);
    return ts[j] + (ts[i] - ts[j]) * f;
  };
  return {
    in: first === 0 ? start : cross(first, first - 1),
    out: last === d.length - 1 ? end : cross(last, last + 1),
  };
}

/**
 * Frames are sampled, so a cut is only known to lie between two samples.
 * Bisect that gap with seeks until it is narrower than one frame.
 */
async function refineCut(video: HTMLVideoElement, fs: FrameSet, t: number): Promise<number> {
  const i = frameAt(fs, t);
  const [a, b] = fs.frames[i].t < t ? [i, i + 1] : [i - 1, i];
  if (a < 0 || b >= fs.frames.length) return t;
  const before = fs.frames[a].data;
  const after = fs.frames[b].data;
  const diff = (x: Uint8Array, y: Uint8Array) => {
    let s = 0;
    for (let p = 0; p < x.length; p += 4) s += Math.abs(x[p] - y[p]);
    return s;
  };
  let lo = fs.frames[a].t;
  let hi = fs.frames[b].t;
  while (hi - lo > 1 / 60) {
    const mid = (lo + hi) / 2;
    const g = await grayAt(video, fs, mid);
    if (diff(g, before) <= diff(g, after)) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}
