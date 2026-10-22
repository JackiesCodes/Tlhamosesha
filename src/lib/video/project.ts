// Helpers for video projects. The scene being edited lives in the project's
// top-level original/analysis/scene (so the editor works as for posters); the
// copy in video.scenes[active] is only refreshed when switching scenes.
import type { LayerTiming, Project, SceneLayer, VideoScene } from "../types";

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
