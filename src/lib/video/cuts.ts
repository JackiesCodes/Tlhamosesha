// Scene boundaries: hard cuts and crossfades, told apart from the animation
// inside a scene (elements sliding or fading in and out).
import { frameAt, type FrameSet } from "./frames";

export interface Cut {
  /** seconds; the middle of the transition */
  time: number;
  type: "cut" | "fade";
  /** how long the transition takes, seconds */
  length: number;
}

/** Small, blurred greyscale copies: grain and compression noise average out. */
export interface Mini {
  w: number;
  h: number;
  frames: Float32Array[];
}

export function shrink(fs: FrameSet, maxDim = 128): Mini {
  const f = Math.max(1, Math.round(Math.max(fs.w, fs.h) / maxDim));
  const w = Math.floor(fs.w / f);
  const h = Math.floor(fs.h / f);
  const frames = fs.frames.map(({ data }) => {
    const out = new Float32Array(w * h);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        let s = 0;
        for (let dy = 0; dy < f; dy++) for (let dx = 0; dx < f; dx++) s += data[(y * f + dy) * fs.w + x * f + dx];
        out[y * w + x] = s / (f * f);
      }
    return out;
  });
  return { w, h, frames };
}

export const meanDiff = (a: Float32Array, b: Float32Array) => {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]);
  return s / a.length;
};

export function edges(m: Mini, f: Float32Array, threshold = 18): Uint8Array {
  const e = new Uint8Array(m.w * m.h);
  for (let y = 1; y < m.h - 1; y++)
    for (let x = 1; x < m.w - 1; x++) {
      const i = y * m.w + x;
      if (Math.abs(f[i + 1] - f[i - 1]) + Math.abs(f[i + m.w] - f[i - m.w]) > threshold) e[i] = 1;
    }
  return e;
}

export const count = (e: Uint8Array) => e.reduce((s, v) => s + v, 0);

/** Share of the edges in `a` still present (within a pixel) in `b`. */
export function persistence(m: Mini, a: Uint8Array, b: Uint8Array): number {
  let kept = 0;
  let total = 0;
  for (let y = 1; y < m.h - 1; y++)
    for (let x = 1; x < m.w - 1; x++) {
      const i = y * m.w + x;
      if (!a[i]) continue;
      total++;
      if (b[i] || b[i - 1] || b[i + 1] || b[i - m.w] || b[i + m.w]) kept++;
    }
  return total < 8 ? 1 : kept / total;
}

/**
 * Inside a scene, content is mostly added (entrances) and only occasionally
 * removed (exits), so most edges from before a change survive it. A cut or
 * crossfade replaces the frame, so almost none do. A crossfade is also a
 * straight blend: its middle frame is the average of the two ends.
 */
export function detectCuts(fs: FrameSet, mini: Mini = shrink(fs)): Cut[] {
  const F = mini.frames;
  const n = F.length;
  if (n < 3) return [];
  const T = fs.frames.map((f) => f.t);
  const step = [0, ...F.slice(1).map((f, i) => meanDiff(f, F[i]))];
  const E = F.map((f) => edges(mini, f));
  const cuts: Cut[] = [];

  // Hard cuts: one step much larger than its neighbours, and the old frame gone.
  for (let i = 1; i < n; i++) {
    const around = Math.max(step[i - 2] ?? 0, step[i - 1], step[i + 1] ?? 0, step[i + 2] ?? 0);
    if (step[i] < 2.5 || step[i] < 3 * around) continue;
    if (persistence(mini, E[i - 1], E[i]) < 0.45) cuts.push({ time: (T[i - 1] + T[i]) / 2, type: "cut", length: 0 });
  }

  // Crossfades: frames h seconds either side of t show different content and
  // the frame at t is their average. Scanning t and h finds the window that
  // fits best, even when elements are still animating at either end.
  const fades: (Cut & { share: number })[] = [];
  for (let i = 1; i < n - 1; i++) {
    const tc = T[i];
    for (const h of [0.3, 0.45, 0.6]) {
      if (tc - h < T[0] || tc + h > T[n - 1] || cuts.some((c) => Math.abs(c.time - tc) < h + 0.1)) continue;
      const a = frameAt(fs, tc - h);
      const b = frameAt(fs, tc + h);
      let changed = 0;
      let blended = 0;
      for (let p = 0; p < F[i].length; p++) {
        const d = Math.abs(F[a][p] - F[b][p]);
        if (d < 8) continue;
        changed++;
        if (Math.abs(F[i][p] - (F[a][p] + F[b][p]) / 2) < Math.max(4, 0.25 * d)) blended++;
      }
      // A clean blend that both drops old content and brings in new. An
      // element fading out alone loses content but gains none; one fading in
      // gains but loses none. Scenes of one video often share a background
      // and layout, so the changed area can be small.
      if (changed < F[i].length * 0.05) continue;
      const share = blended / changed;
      const lost = 1 - persistence(mini, E[a], E[b]);
      const gained = 1 - persistence(mini, E[b], E[a]);
      if (share >= 0.6 && lost >= 0.3 && gained >= 0.15)
        fades.push({ time: tc, type: "fade", length: 2 * h, share: share - 0.1 * (h - 0.3) });
    }
  }
  // Keep the best-fitting window of each group of overlapping candidates.
  fades.sort((x, y) => y.share - x.share);
  for (const f of fades)
    if (!cuts.some((c) => Math.abs(c.time - f.time) < Math.max(0.5, (c.length + f.length) / 2)))
      cuts.push({ time: f.time, type: "fade", length: f.length });

  cuts.sort((x, y) => x.time - y.time);
  return cuts.filter((c, k) => k === 0 || c.time - cuts[k - 1].time > 0.3);
}
