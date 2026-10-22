// Editing a layer's animation: read its keyframes as simple settings
// ("slides up over 0.5 s, ease out"), write settings back as keyframes, and
// move its timing on the timeline.
import type { EasingName, LayerTiming, MotionKey } from "../types";
import { describeEntrance, type EntranceKind } from "./motion";

export type EntrancePreset = "none" | EntranceKind;

export interface AnimationSettings {
  entrance: EntrancePreset;
  enterDuration: number;
  enterEasing: EasingName;
  /** how far a slide travels, in scene pixels */
  distance: number;
  exit: "none" | "fade";
  exitDuration: number;
  exitEasing: EasingName;
}

/** Keyframes before the middle of a layer's time belong to its entrance; the rest to its exit. */
const split = (t: LayerTiming) => {
  const mid = (t.in + t.out) / 2;
  const keys = t.motion ?? [];
  return { enter: keys.filter((k) => k.t < mid), exit: keys.filter((k) => k.t >= mid) };
};

export function readAnimation(t: LayerTiming, size: number, defaultDistance: number): AnimationSettings {
  const { enter, exit } = split(t);
  const kind = describeEntrance(enter, size);
  const first = enter[0];
  const lastExit = exit[exit.length - 1];
  return {
    entrance: kind ?? "none",
    enterDuration: enter.length >= 2 ? +(enter[enter.length - 1].t - first.t).toFixed(2) : 0.5,
    enterEasing: first?.easing ?? "ease-out",
    distance: first && Math.hypot(first.dx, first.dy) > 1 ? Math.round(Math.hypot(first.dx, first.dy)) : defaultDistance,
    exit: exit.length >= 2 && lastExit.opacity < 0.05 ? "fade" : "none",
    exitDuration: exit.length >= 2 ? +(lastExit.t - exit[0].t).toFixed(2) : 0.3,
    exitEasing: exit[0]?.easing ?? "linear",
  };
}

/** New keyframes from settings. Entrances and exits are centred on the layer's in and out times. */
export function applyAnimation(t: LayerTiming, a: AnimationSettings): LayerTiming {
  const motion: MotionKey[] = [];
  if (a.entrance !== "none") {
    const d = a.distance;
    const from = {
      fade: {},
      "slide-up": { dy: d },
      "slide-down": { dy: -d },
      "slide-left": { dx: d },
      "slide-right": { dx: -d },
      scale: { scale: 0.8 },
    }[a.entrance] as Partial<MotionKey>;
    const t0 = t.in - a.enterDuration / 2;
    motion.push(
      { t: +t0.toFixed(3), dx: from.dx ?? 0, dy: from.dy ?? 0, scale: from.scale ?? 1, opacity: 0, easing: a.enterEasing },
      { t: +(t0 + a.enterDuration).toFixed(3), dx: 0, dy: 0, scale: 1, opacity: 1 },
    );
  }
  if (a.exit === "fade") {
    const t2 = t.out - a.exitDuration / 2;
    motion.push(
      { t: +t2.toFixed(3), dx: 0, dy: 0, scale: 1, opacity: 1, easing: a.exitEasing },
      { t: +(t2 + a.exitDuration).toFixed(3), dx: 0, dy: 0, scale: 1, opacity: 0 },
    );
  }
  return { in: t.in, out: t.out, motion: motion.length ? motion : undefined };
}

/** Moves a layer's in time, out time, or both; its entrance and exit keyframes move with them. */
export function retime(t: LayerTiming, edge: "in" | "out" | "both", delta: number): LayerTiming {
  const { enter, exit } = split(t);
  const move = (k: MotionKey) => ({ ...k, t: +(k.t + delta).toFixed(3) });
  return {
    in: +(t.in + (edge === "out" ? 0 : delta)).toFixed(3),
    out: +(t.out + (edge === "in" ? 0 : delta)).toFixed(3),
    motion: t.motion && [...(edge === "out" ? enter : enter.map(move)), ...(edge === "in" ? exit : exit.map(move))],
  };
}
