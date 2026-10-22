// Video breakdown: split into scenes, run the still-image pipeline on each
// scene's keyframe(s), then time every layer across its scene.
import type { AnalysisResult, Box, LayerTiming, VideoScene } from "../types";
import { buildScene } from "../vision/reconstruct";
import { boxIoU, loadImage, makeCanvas, release } from "../vision/raster";
import { runPipeline } from "../vision/pipeline";
import { count, detectCuts, edges, persistence, shrink, type Cut, type Mini } from "./cuts";
import { fitMotion, trackLayer } from "./motion";
import { captureFrames, closeVideo, frameAt, grabFrame, grayAt, openVideo, type FrameSet } from "./frames";

export const VIDEO_STEPS = [
  { id: "frames", label: "Reading frames" },
  { id: "scenes", label: "Finding scenes" },
  { id: "keyframes", label: "Breaking down each scene" },
  { id: "timing", label: "Timing and motion of every layer" },
] as const;

export type VideoStepId = (typeof VIDEO_STEPS)[number]["id"];

export interface VideoBreakdown {
  width: number;
  height: number;
  duration: number;
  framesAnalysed: number;
  cuts: Cut[];
  scenes: VideoScene[];
  /** seconds spent in each stage */
  timings: Record<"decode" | "cuts" | "keyframes" | "timing" | "motion" | "total", number>;
  /** milliseconds per still-image step, summed over all keyframes */
  stepMs: Record<string, number>;
}

export interface VideoOptions {
  ocr: boolean;
  ocrInvertPass: boolean;
  sensitivity: number;
  maxObjects: number;
  onStep?: (id: VideoStepId, status: "active" | "done", note?: string) => void;
  onProgress?: (id: VideoStepId, p: number, note?: string) => void;
}

/** Longest video we accept for now, in seconds. */
export const MAX_VIDEO_SECONDS = 60;

const now = () => performance.now() / 1000;
const MIN_SCENE = 0.7; // seconds

export async function analyzeVideo(src: string, fileName: string, opt: VideoOptions): Promise<VideoBreakdown> {
  const t0 = now();
  const timings = { decode: 0, cuts: 0, keyframes: 0, timing: 0, motion: 0, total: 0 };
  const video = await openVideo(src);
  if (video.duration > MAX_VIDEO_SECONDS + 0.5) {
    closeVideo(video);
    throw new Error(`This video is ${Math.round(video.duration)} seconds long. Videos up to ${MAX_VIDEO_SECONDS} seconds are supported for now; trim it and try again.`);
  }

  opt.onStep?.("frames", "active");
  let t = now();
  const fs = await captureFrames(video, { onProgress: (p) => opt.onProgress?.("frames", p) });
  timings.decode = now() - t;
  opt.onStep?.("frames", "done", `${fs.frames.length} frames`);

  opt.onStep?.("scenes", "active");
  t = now();
  const mini = shrink(fs);
  const cuts = detectCuts(fs, mini);
  for (const c of cuts) if (c.type === "cut") c.time = await refineCut(video, fs, c.time);
  // A "scene" under 0.7 s is almost always a false break (an element popping
  // in at the very start or end); fold it into its neighbour.
  for (let i = cuts.length - 1; i >= 0; i--) {
    const prev = i > 0 ? cuts[i - 1].time : 0;
    const next = i + 1 < cuts.length ? cuts[i + 1].time : fs.duration;
    if (cuts[i].time - prev < MIN_SCENE || next - cuts[i].time < MIN_SCENE) cuts.splice(i, 1);
  }
  const bounds = [0, ...cuts.map((c) => c.time), fs.duration];

  // Grab every keyframe first, then close the video so its decoder isn't held
  // while the (memory-hungry) still-image analysis runs.
  const plan: { start: number; end: number; keys: { t: number; url: string }[]; empty: boolean }[] = [];
  for (let s = 0; s + 1 < bounds.length; s++) {
    const keys = [];
    const picked = pickKeyframes(fs, mini, bounds[s], bounds[s + 1], cuts);
    for (const kt of picked.keys) keys.push({ t: kt, url: await grabFrame(video, kt) });
    plan.push({ start: bounds[s], end: bounds[s + 1], keys, empty: picked.empty });
  }
  closeVideo(video);
  timings.cuts = now() - t;
  opt.onStep?.("scenes", "done", `${plan.length} scene${plan.length === 1 ? "" : "s"}`);

  const scenes: VideoScene[] = [];
  const stepMs: Record<string, number> = {};
  opt.onStep?.("keyframes", "active");
  for (const [s, { start, end, keys, empty }] of plan.entries()) {
    opt.onProgress?.("keyframes", s / plan.length, `Scene ${s + 1} of ${plan.length}`);
    t = now();
    const outs = [];
    for (const key of keys) {
      try {
        const out = await runPipeline(key.url, {
          fileName: `${fileName} @ ${key.t.toFixed(2)}s`,
          fileSize: 0,
          mimeType: "image/png",
          // Nothing to read on a near-blank frame, and OCR on pure grain is slow.
          ocr: opt.ocr && !empty,
          ocrInvertPass: opt.ocrInvertPass,
          cloud: false,
          sensitivity: opt.sensitivity,
          maxObjects: opt.maxObjects,
          onStep: () => {},
        });
        outs.push({ ...out, t: key.t });
        for (const [k, v] of Object.entries(out.stepMs)) stepMs[k] = (stepMs[k] ?? 0) + (v ?? 0);
      } finally {
        URL.revokeObjectURL(key.url);
      }
    }
    timings.keyframes += now() - t;

    // Layers from a second keyframe join the first one's analysis, and each
    // element remembers which keyframe it was seen on, for timing.
    t = now();
    const [main, ...extra] = outs;
    const analysis: AnalysisResult = { ...main.analysis, texts: [...main.analysis.texts], objects: [...main.analysis.objects] };
    const seenAt = new Map<string, number>([...analysis.texts, ...analysis.objects].map((x) => [x.id, main.t]));
    for (const o of extra) {
      const k = analysis.metadata.width / o.analysis.metadata.width;
      const scale = (b: Box) => ({ x: b.x * k, y: b.y * k, width: b.width * k, height: b.height * k });
      for (const x of o.analysis.texts) {
        const box = scale(x.box);
        if (analysis.texts.some((y) => boxIoU(y.box, box) > 0.5 && y.text === x.text)) continue;
        analysis.texts.push({ ...x, box, font: { ...x.font, sizePx: x.font.sizePx * k } });
        seenAt.set(x.id, o.t);
      }
      for (const x of o.analysis.objects) {
        const box = scale(x.box);
        if (analysis.objects.some((y) => boxIoU(y.box, box) > 0.5)) continue;
        analysis.objects.push({ ...x, box });
        seenAt.set(x.id, o.t);
      }
    }
    const plate = analysis.backgrounds.find((b) => b.kind === "base")?.image ?? main.original;
    const toVideo = fs.width / analysis.metadata.width;
    const timing: Record<string, LayerTiming> = {};
    for (const x of [...analysis.texts, ...analysis.objects]) {
      const b = x.box;
      timing[x.id] = visibility(fs, { x: b.x * toVideo, y: b.y * toVideo, width: b.width * toVideo, height: b.height * toVideo }, start, end, seenAt.get(x.id)!);
    }
    timings.timing += now() - t;

    // Motion: follow each layer against the scene's clean background.
    t = now();
    const toFrames = fs.w / fs.width; // video px -> analysis raster px
    const bg = await grayImage(plate, fs.w, fs.h);
    for (const x of [...analysis.texts, ...analysis.objects]) {
      if ("kind" in x && x.kind === "face") continue;
      const k = toVideo * toFrames;
      const box = { x: x.box.x * k, y: x.box.y * k, width: x.box.width * k, height: x.box.height * k };
      const motion = fitMotion(trackLayer(fs, bg, box, start, end, seenAt.get(x.id)!), end, 1 / k, Math.max(box.width, box.height));
      if (motion) timing[x.id].motion = motion;
    }
    timings.motion += now() - t;
    t = now();
    scenes.push({
      start,
      end,
      transition: s === 0 ? null : cuts[s - 1].type,
      transitionLength: s === 0 ? undefined : +cuts[s - 1].length.toFixed(3),
      keyframes: keys.map((k) => k.t),
      // Analysed losslessly; stored as JPEG, which is a fraction of the size.
      original: await toJpeg(main.original),
      thumbnail: main.thumbnail,
      analysis,
      scene: extra.length ? buildScene(analysis, plate) : main.scene,
      timing,
    });
    timings.timing += now() - t;
  }
  opt.onStep?.("keyframes", "done");
  opt.onStep?.("timing", "done");
  timings.total = now() - t0;
  return { width: fs.width, height: fs.height, duration: fs.duration, framesAnalysed: fs.frames.length, cuts, scenes, timings, stepMs };
}

/**
 * The frame showing the most content, away from the transitions. If other
 * frames show sizeable content it lacks (layers that leave before the busiest
 * moment), the most different of them becomes a second keyframe. A scene whose
 * busiest frame is still nearly blank is flagged as empty.
 */
function pickKeyframes(fs: FrameSet, mini: Mini, start: number, end: number, cuts: Cut[]): { keys: number[]; empty: boolean } {
  const margin = (c?: Cut) => (c ? c.length / 2 + 0.12 : 0);
  const lo = start + margin(cuts.find((c) => Math.abs(c.time - start) < 1e-6));
  const hi = end - margin(cuts.find((c) => Math.abs(c.time - end) < 1e-6));
  const idx: number[] = [];
  for (let i = frameAt(fs, lo); i <= frameAt(fs, hi); i++) if (fs.frames[i].t >= lo && fs.frames[i].t <= hi) idx.push(i);
  if (!idx.length) return { keys: [(start + end) / 2], empty: false };
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
  return { keys, empty: count(E.get(best)!) < mini.w * mini.h * 0.002 };
}

/**
 * When a layer is on screen: compare its box in every frame of the scene with
 * the keyframe where it was found. It counts as visible once it is more than
 * half-way from its "absent" look to its keyframe look.
 */
function visibility(fs: FrameSet, box: Box, start: number, end: number, keyT: number): LayerTiming {
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

async function toJpeg(src: string): Promise<string> {
  const img = await loadImage(src);
  const { canvas, ctx } = makeCanvas(img.naturalWidth, img.naturalHeight);
  ctx.drawImage(img, 0, 0);
  const url = canvas.toDataURL("image/jpeg", 0.9);
  release(canvas);
  return url;
}

/** An image as greyscale at the given size (matching the frame set). */
async function grayImage(src: string, w: number, h: number): Promise<Uint8Array> {
  const img = await loadImage(src);
  const { canvas, ctx } = makeCanvas(w, h);
  ctx.drawImage(img, 0, 0, w, h);
  const d = ctx.getImageData(0, 0, w, h).data;
  release(canvas);
  const g = new Uint8Array(w * h);
  for (let p = 0, i = 0; p < g.length; p++, i += 4) g[p] = (d[i] * 77 + d[i + 1] * 150 + d[i + 2] * 29) >> 8;
  return g;
}
