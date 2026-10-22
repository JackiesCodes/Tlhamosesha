// Helpers for video projects. The scene being edited lives in the project's
// top-level original/analysis/scene (so the editor works as for posters); the
// copy in video.scenes[active] is only refreshed when switching scenes.
import type { LayerTiming, Project, Scene, SceneLayer, VideoScene } from "../types";
import { REST, sampleMotion, type MotionState } from "./easing";
import { describeEntrance, type EntranceKind } from "./motion";

/** Every scene with the one being edited brought up to date. */
export function syncedScenes(p: Project): VideoScene[] {
  if (!p.video) return [];
  const { active, scenes } = p.video;
  return scenes.map((s, i) => (i === active ? { ...s, original: p.original, analysis: p.analysis, scene: p.scene } : s));
}

/** When a layer is on screen, and how it moves (video scenes only). */
export function layerTiming(p: Project, layer: SceneLayer): LayerTiming | undefined {
  if (!p.video) return undefined;
  if (layer.timing) return layer.timing;
  return layer.sourceId ? p.video.scenes[p.video.active]?.timing[layer.sourceId] : undefined;
}

/**
 * Copies each detected element's timing onto its layer. Projects made before
 * layers carried their own timing are upgraded this way when opened.
 */
export function withLayerTimings(p: Project): Project {
  if (!p.video) return p;
  const fill = (scene: Scene, timing: VideoScene["timing"]): Scene => {
    if (scene.layers.every((l) => l.timing || !l.sourceId || !timing[l.sourceId])) return scene;
    return { ...scene, layers: scene.layers.map((l) => (l.timing || !l.sourceId || !timing[l.sourceId] ? l : { ...l, timing: timing[l.sourceId] })) };
  };
  const scenes = p.video.scenes.map((s) => ({ ...s, scene: fill(s.scene, s.timing) }));
  return { ...p, scene: fill(p.scene, p.video.scenes[p.video.active].timing), video: { ...p.video, scenes } };
}

/**
 * Where a layer is and how visible it is at time t: its motion keyframes,
 * and outside its on-screen time (when no keyframe covers that) hidden.
 */
export function layerStateAt(timing: LayerTiming | undefined, t: number): MotionState {
  if (!timing) return REST;
  const keys = timing.motion;
  const state = sampleMotion(keys, t);
  const coveredFrom = keys?.length && keys[0].opacity < 0.05 ? keys[0].t : timing.in;
  const coveredTo = keys?.length && keys[keys.length - 1].opacity < 0.05 ? keys[keys.length - 1].t : timing.out;
  if (t < Math.min(coveredFrom, timing.in) || t > Math.max(coveredTo, timing.out)) return { ...state, opacity: 0 };
  if (!keys?.length) return t >= timing.in && t <= timing.out ? REST : { ...REST, opacity: 0 };
  return state;
}

export function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, "0")}`;
}

const ENTRANCE_LABEL: Record<EntranceKind, string> = {
  fade: "fades in",
  "slide-up": "slides up",
  "slide-down": "slides down",
  "slide-left": "slides in from the right",
  "slide-right": "slides in from the left",
  scale: "scales in",
};

/** Short description of how a layer moves, e.g. "slides up · fades out". */
export function describeMotion(t: LayerTiming | undefined, size: number): string | null {
  const keys = t?.motion;
  if (!keys?.length) return null;
  const parts: string[] = [];
  const entrance = describeEntrance(keys, size);
  if (entrance) parts.push(ENTRANCE_LABEL[entrance]);
  const last = keys[keys.length - 1];
  if (keys.length >= 2 && last.opacity < 0.05 && keys[keys.length - 2].opacity > 0.95) parts.push("fades out");
  return parts.length ? parts.join(" · ") : null;
}
