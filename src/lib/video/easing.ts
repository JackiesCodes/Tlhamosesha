// Easing curves and keyframe sampling for layer motion.
import type { EasingName, MotionKey } from "../types";

/** Cubic-bézier control points: CSS's named curves plus common design-tool presets. */
export const EASINGS: Record<EasingName, [number, number, number, number]> = {
  linear: [0, 0, 1, 1],
  ease: [0.25, 0.1, 0.25, 1],
  "ease-in": [0.42, 0, 1, 1],
  "ease-out": [0, 0, 0.58, 1],
  "ease-in-out": [0.42, 0, 0.58, 1],
  standard: [0.4, 0, 0.2, 1],
  decelerate: [0, 0, 0.2, 1],
  "out-cubic": [0.33, 1, 0.68, 1],
  "out-quint": [0.22, 1, 0.36, 1],
  "out-expo": [0.16, 1, 0.3, 1],
};

export const EASING_LABEL: Record<EasingName, string> = {
  linear: "linear",
  ease: "ease",
  "ease-in": "ease in",
  "ease-out": "ease out",
  "ease-in-out": "ease in-out",
  standard: "standard",
  decelerate: "decelerate",
  "out-cubic": "ease out (cubic)",
  "out-quint": "ease out (quint)",
  "out-expo": "ease out (expo)",
};

export const cssEasing = (e: EasingName = "linear") =>
  e === "linear" ? "linear" : `cubic-bezier(${EASINGS[e].join(", ")})`;

/** Progress (0–1) of a cubic-bézier easing at time fraction x (0–1). */
export function ease(e: EasingName, x: number): number {
  const [x1, y1, x2, y2] = EASINGS[e];
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  if (e === "linear") return x;
  const bx = (t: number) => 3 * x1 * t * (1 - t) ** 2 + 3 * x2 * t * t * (1 - t) + t ** 3;
  const by = (t: number) => 3 * y1 * t * (1 - t) ** 2 + 3 * y2 * t * t * (1 - t) + t ** 3;
  // Bisection on the x curve, which is monotonic for valid easings.
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    if (bx(mid) < x) lo = mid;
    else hi = mid;
  }
  return by((lo + hi) / 2);
}

export type MotionState = Omit<MotionKey, "t" | "easing">;
export const REST: MotionState = { dx: 0, dy: 0, scale: 1, opacity: 1 };

/** Where a layer is at time t, given its keyframes (at rest when there are none). */
export function sampleMotion(keys: MotionKey[] | undefined, t: number): MotionState {
  if (!keys?.length) return REST;
  if (t <= keys[0].t) return keys[0];
  for (let i = 0; i + 1 < keys.length; i++) {
    const a = keys[i];
    const b = keys[i + 1];
    if (t > b.t) continue;
    const p = ease(a.easing ?? "linear", (t - a.t) / Math.max(1e-6, b.t - a.t));
    const mix = (u: number, v: number) => u + (v - u) * p;
    return { dx: mix(a.dx, b.dx), dy: mix(a.dy, b.dy), scale: mix(a.scale, b.scale), opacity: mix(a.opacity, b.opacity) };
  }
  return keys[keys.length - 1];
}
