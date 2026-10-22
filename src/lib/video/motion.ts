// Layer motion: follow each layer through its scene, then describe what it
// did as a few keyframes with standard easings (what a designer would have set
// up in an animation tool: e.g. "slides up 48 px and fades in over 0.5 s").
import type { Box, EasingName, MotionKey } from "../types";
import { ease, EASINGS } from "./easing";
import { frameAt, type FrameSet } from "./frames";

export interface MotionSample {
  t: number;
  /** offset from the rest position, analysis-raster pixels */
  dx: number;
  dy: number;
  scale: number;
  opacity: number;
  /** the layer looks exactly as it does at rest */
  rest: boolean;
}

// Per-frame search steps. Entrances often do most of their movement in the
// first tenth of a second (a strong ease-out), so steps must allow big jumps.
const SCALES = [-0.1, -0.06, -0.03, 0, 0.03, 0.06, 0.1];
// px in the analysis raster. Wider windows jump to look-alike neighbours
// (the next text line), so a layer is followed in small steps instead.
const REACH = 6;

/**
 * Tracks one layer through a scene. A frame is modelled as the layer (as seen
 * on the keyframe, moved by dx/dy and scaled) laid over the scene's clean
 * background at some opacity. Frames where the layer already looks as it
 * does at rest are skipped; the rest are searched near the previous answer,
 * working outwards from the keyframe.
 */
export function trackLayer(fs: FrameSet, plate: Uint8Array, box: Box, start: number, end: number, keyT: number): MotionSample[] {
  const x0 = Math.max(0, Math.round(box.x));
  const y0 = Math.max(0, Math.round(box.y));
  const w = Math.min(fs.w - x0, Math.round(box.width));
  const h = Math.min(fs.h - y0, Math.round(box.height));
  if (w < 3 || h < 3) return [];
  const key = fs.frames[frameAt(fs, keyT)].data;
  const T = new Float32Array(w * h);
  let contrast = 0;
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      const p = (y0 + j) * fs.w + x0 + i;
      T[j * w + i] = key[p];
      contrast += Math.abs(key[p] - plate[p]);
    }
  contrast /= w * h;
  // A layer that barely differs from the background can't be followed.
  if (contrast < 4) return [];
  const restThreshold = Math.max(3, contrast * 0.2);
  const cx = x0 + w / 2;
  const cy = y0 + h / 2;
  const stride = Math.max(1, Math.floor(Math.sqrt((w * h) / 600)));
  const allowScale = w * h >= 150;

  /** How much of the frame the candidate explains (higher is better), and its best opacity. */
  const fit = (f: Uint8Array, dx: number, dy: number, s: number) => {
    const fw = Math.max(1, Math.round(w * s));
    const fh = Math.max(1, Math.round(h * s));
    const ox = Math.round(cx + dx - fw / 2);
    const oy = Math.round(cy + dy - fh / 2);
    let dg = 0;
    let gg = 0;
    for (let j = 0; j < fh; j += stride) {
      const Y = oy + j;
      if (Y < 0 || Y >= fs.h) continue;
      const tj = Math.min(h - 1, Math.floor((j + 0.5) / s)) * w;
      for (let i = 0; i < fw; i += stride) {
        const X = ox + i;
        if (X < 0 || X >= fs.w) continue;
        const p = Y * fs.w + X;
        const b = plate[p];
        const g = T[tj + Math.min(w - 1, Math.floor((i + 0.5) / s))] - b;
        dg += (f[p] - b) * g;
        gg += g * g;
      }
    }
    if (gg < 1) return { gain: 0, alpha: 0 };
    const alpha = Math.min(1, Math.max(0, dg / gg));
    return { gain: 2 * alpha * dg - alpha * alpha * gg, alpha };
  };

  const restDiff = (f: Uint8Array) => {
    let d = 0;
    for (let j = 0; j < h; j += stride) for (let i = 0; i < w; i += stride) d += Math.abs(f[(y0 + j) * fs.w + x0 + i] - T[j * w + i]);
    return d / (Math.ceil(h / stride) * Math.ceil(w / stride));
  };

  const idx: number[] = [];
  for (let i = frameAt(fs, start); i < fs.frames.length && fs.frames[i].t <= end + 1e-6; i++) if (fs.frames[i].t >= start - 1e-6) idx.push(i);
  const k0 = idx.indexOf(frameAt(fs, keyT));
  const out: MotionSample[] = new Array(idx.length);
  for (const dir of [-1, 1]) {
    let prev = { dx: 0, dy: 0, scale: 1 };
    for (let k = dir < 0 ? k0 : k0 + 1; k >= 0 && k < idx.length; k += dir) {
      const f = fs.frames[idx[k]];
      if (restDiff(f.data) < restThreshold) {
        out[k] = { t: f.t, dx: 0, dy: 0, scale: 1, opacity: 1, rest: true };
        prev = { dx: 0, dy: 0, scale: 1 };
        continue;
      }
      // Position first (coarse 2 px steps, then 1 px), then scale at that
      // position, then position again if the scale changed.
      const around = (c: { dx: number; dy: number; scale: number }, reach: number, step: number) => {
        let b = { ...c, ...fit(f.data, c.dx, c.dy, c.scale) };
        for (let dy = -reach; dy <= reach; dy += step)
          for (let dx = -reach; dx <= reach; dx += step) {
            if (!dx && !dy) continue;
            const r = fit(f.data, c.dx + dx, c.dy + dy, c.scale);
            if (r.gain > b.gain) b = { dx: c.dx + dx, dy: c.dy + dy, scale: c.scale, ...r };
          }
        return b;
      };
      let best = around(around(prev, REACH, 2), 1, 1);
      if (allowScale) {
        const at = best;
        for (const d of SCALES) {
          if (!d) continue;
          const sc = Math.min(1.5, Math.max(0.3, at.scale + d));
          const r = around({ dx: at.dx, dy: at.dy, scale: sc }, 1, 1);
          if (r.gain > best.gain) best = r;
        }
        if (best.scale !== at.scale) best = around(best, 2, 1);
      }
      out[k] = { t: f.t, dx: best.dx, dy: best.dy, scale: best.scale, opacity: best.alpha, rest: false };
      // A nearly transparent layer says little about where it is.
      if (best.alpha > 0.25) prev = { dx: best.dx, dy: best.dy, scale: best.scale };
    }
  }
  return out.filter(Boolean);
}

const NAMES = Object.keys(EASINGS) as EasingName[];
const INVISIBLE = 0.08;

interface Tween {
  t0: number;
  t1: number;
  easing: EasingName;
  dx: number;
  dy: number;
  scale: number;
}

/**
 * Fits one tween between "hidden" (opacity 0, offset by dx/dy, scaled) and
 * rest. `entering` tweens run hidden → rest; leaving ones rest → hidden.
 * The exact start and end lie between samples, so a few candidates for each
 * are tried along with every easing.
 */
function fitTween(seg: MotionSample[], t0lo: number, t0hi: number, t1lo: number, t1hi: number, entering: boolean): Tween {
  let best: Tween & { err: number } = { t0: t0lo, t1: t1hi, easing: "ease-out", dx: 0, dy: 0, scale: 1, err: Infinity };
  const steps = 4;
  for (let a = 0; a <= steps; a++)
    for (let b = 0; b <= steps; b++) {
      const t0 = t0lo + ((t0hi - t0lo) * a) / steps;
      const t1 = t1lo + ((t1hi - t1lo) * b) / steps;
      if (t1 - t0 < 0.05) continue;
      for (const e of NAMES) {
        // Share of the way from hidden to rest, for each sample.
        const q = seg.map((s) => {
          const p = ease(e, (s.t - t0) / (t1 - t0));
          return entering ? p : 1 - p;
        });
        // Where a sample is faint its position is guesswork, so weight by opacity squared.
        let sx = 0, sy = 0, ss = 0, nn = 0;
        seg.forEach((s, i) => {
          const r = 1 - q[i];
          const wt = s.opacity * s.opacity;
          sx += wt * s.dx * r;
          sy += wt * s.dy * r;
          ss += wt * (s.scale - 1) * r;
          nn += wt * r * r;
        });
        const dx = nn > 1e-6 ? sx / nn : 0;
        const dy = nn > 1e-6 ? sy / nn : 0;
        const ds = nn > 1e-6 ? ss / nn : 0;
        let err = 0;
        seg.forEach((s, i) => {
          const r = 1 - q[i];
          err += ((s.opacity - q[i]) / 0.1) ** 2;
          err += s.opacity * s.opacity * (((s.dx - dx * r) / 2) ** 2 + ((s.dy - dy * r) / 2) ** 2 + ((s.scale - 1 - ds * r) / 0.03) ** 2);
        });
        if (err < best.err) best = { t0, t1, easing: e, dx, dy, scale: 1 + ds, err };
      }
    }
  return best;
}

/** Keyframes (scene pixels) for a tracked layer, or undefined if it never animates. */
export function fitMotion(samples: MotionSample[], end: number, toScene: number, size: number): MotionKey[] | undefined {
  const n = samples.length;
  if (n < 3 || samples.every((s) => s.rest)) return undefined;
  const firstRest = samples.findIndex((s) => s.rest);
  const lastRest = n - 1 - [...samples].reverse().findIndex((s) => s.rest);
  if (firstRest < 0) return undefined;
  // Tiny offsets are noise; huge ones (beyond twice the layer's size, or a
  // scale outside 0.5–1.5) come from fitting faint frames, so fall back to a fade.
  const snap = (tw: Tween) => {
    const wild = Math.hypot(tw.dx, tw.dy) > 2 * size || tw.scale < 0.5 || tw.scale > 1.5;
    return {
      dx: wild || Math.abs(tw.dx) < 1.5 ? 0 : Math.round(tw.dx * toScene),
      dy: wild || Math.abs(tw.dy) < 1.5 ? 0 : Math.round(tw.dy * toScene),
      scale: wild || Math.abs(tw.scale - 1) < 0.03 ? 1 : Math.round(tw.scale * 100) / 100,
    };
  };
  const keys: MotionKey[] = [];

  // Entrance: from the last hidden sample before the layer settles.
  let hidden = -1;
  for (let i = firstRest - 1; i >= 0; i--)
    if (samples[i].opacity < INVISIBLE) {
      hidden = i;
      break;
    }
  if (hidden >= 0 && firstRest - hidden >= 2) {
    const seg = samples.slice(hidden + 1, firstRest);
    const tw = fitTween(seg, samples[hidden].t, samples[hidden + 1].t, samples[firstRest - 1].t, samples[firstRest].t, true);
    keys.push({ t: tw.t0, ...snap(tw), opacity: 0, easing: tw.easing }, { t: tw.t1, dx: 0, dy: 0, scale: 1, opacity: 1 });
  }

  // Exit: from the last rest sample until the layer is gone.
  let gone = -1;
  for (let i = lastRest + 1; i < n; i++)
    if (samples[i].opacity < INVISIBLE) {
      gone = i;
      break;
    }
  if (gone >= 0 && gone - lastRest >= 2 && samples[gone].t < end - 0.05) {
    const seg = samples.slice(lastRest + 1, gone);
    const tw = fitTween(seg, samples[lastRest].t, samples[lastRest + 1].t, samples[gone - 1].t, samples[gone].t, false);
    keys.push({ t: tw.t0, dx: 0, dy: 0, scale: 1, opacity: 1, easing: tw.easing }, { t: tw.t1, ...snap(tw), opacity: 0 });
  }
  return keys.length ? keys : undefined;
}

export type EntranceKind = "fade" | "slide-up" | "slide-down" | "slide-left" | "slide-right" | "scale";

/**
 * Names a layer's entrance the way a designer would. A scale change with only
 * a small shift counts as scaling in: the shift comes from where it scales from.
 */
export function describeEntrance(keys: MotionKey[] | undefined, size: number): EntranceKind | null {
  const k = keys?.find((x, i) => x.opacity < 0.05 && (keys[i + 1]?.opacity ?? 0) > 0.95);
  if (!k) return null;
  if (Math.abs(k.scale - 1) >= 0.06 && Math.hypot(k.dx, k.dy) <= 0.25 * size) return "scale";
  if (Math.abs(k.dy) >= 12 && Math.abs(k.dy) >= Math.abs(k.dx)) return k.dy > 0 ? "slide-up" : "slide-down";
  if (Math.abs(k.dx) >= 12) return k.dx > 0 ? "slide-left" : "slide-right";
  if (Math.abs(k.scale - 1) >= 0.06) return "scale";
  return "fade";
}
