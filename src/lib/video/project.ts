// Helpers for video projects. The scene being edited lives in the project's
// top-level original/analysis/scene (so the editor works as for posters); the
// copy in video.scenes[active] is only refreshed when switching scenes.
import type { LayerTiming, Project, SceneLayer, VideoScene } from "../types";
import { describeEntrance, type EntranceKind } from "./motion";

/** Every scene with the one being edited brought up to date. */
export function syncedScenes(p: Project): VideoScene[] {
  if (!p.video) return [];
  const { active, scenes } = p.video;
  return scenes.map((s, i) => (i === active ? { ...s, original: p.original, analysis: p.analysis, scene: p.scene } : s));
}

/** When a layer is on screen, if it came from a detected element of a video scene. */
export function layerTiming(p: Project, layer: SceneLayer): LayerTiming | undefined {
  if (!p.video || !layer.sourceId) return undefined;
  return p.video.scenes[p.video.active]?.timing[layer.sourceId];
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
