// Draws the rebuilt video at any moment: each scene's layers with their
// motion and timing, and crossfades between scenes. Used by the video export.
import { drawLayerContent } from "../export";
import type { Project, Scene } from "../types";
import { loadImage } from "../vision/raster";
import { syncedScenes, withLayerTimings, layerStateAt } from "./project";

export interface VideoRenderer {
  width: number;
  height: number;
  duration: number;
  draw: (ctx: CanvasRenderingContext2D, t: number) => void;
}

/** Loads every image and font up front, so drawing a frame is synchronous and fast. */
export async function prepareRenderer(project: Project): Promise<VideoRenderer> {
  const p = withLayerTimings(project);
  if (!p.video) throw new Error("This project isn't a video.");
  const scenes = syncedScenes(p);
  const images = new Map<string, HTMLImageElement>();
  const fonts = new Set<string>();
  for (const s of scenes)
    for (const l of s.scene.layers) {
      if ("src" in l && !images.has(l.src)) images.set(l.src, await loadImage(l.src));
      if (l.type === "text") fonts.add(`${l.fontWeight} 32px "${l.fontFamily}"`);
    }
  if (typeof document !== "undefined" && document.fonts) {
    await Promise.all([...fonts].map((f) => document.fonts.load(f).catch(() => [])));
    await document.fonts.ready;
  }
  const { width, height } = scenes[0].scene;

  const drawScene = (ctx: CanvasRenderingContext2D, scene: Scene, t: number, alpha: number) => {
    ctx.save();
    ctx.fillStyle = scene.background;
    ctx.globalAlpha = alpha;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
    for (const l of scene.layers) {
      if (!l.visible) continue;
      const st = layerStateAt(l.timing, t);
      if (st.opacity <= 0.001) continue;
      ctx.save();
      ctx.globalAlpha = Math.min(1, l.opacity * st.opacity * alpha);
      ctx.translate(l.x + l.width / 2 + st.dx, l.y + l.height / 2 + st.dy);
      ctx.rotate((l.rotation * Math.PI) / 180);
      if (st.scale !== 1) ctx.scale(st.scale, st.scale);
      drawLayerContent(ctx, l, "src" in l ? images.get(l.src) : undefined);
      ctx.restore();
    }
  };

  return {
    width,
    height,
    duration: p.video.duration,
    draw: (ctx, t) => {
      let k = scenes.findIndex((s) => t < s.end);
      if (k < 0) k = scenes.length - 1;
      const s = scenes[k];
      const next = scenes[k + 1];
      const prev = scenes[k - 1];
      const fadeLen = (x?: (typeof scenes)[number]) => (x?.transition === "fade" ? (x.transitionLength ?? 0.6) : 0);
      ctx.clearRect(0, 0, width, height);
      // A crossfade straddles the boundary between two scenes.
      if (next && fadeLen(next) && t > next.start - fadeLen(next) / 2) {
        drawScene(ctx, s.scene, t, 1);
        drawScene(ctx, next.scene, t, (t - (next.start - fadeLen(next) / 2)) / fadeLen(next));
      } else if (prev && fadeLen(s) && t < s.start + fadeLen(s) / 2) {
        drawScene(ctx, prev.scene, t, 1);
        drawScene(ctx, s.scene, t, (t - (s.start - fadeLen(s) / 2)) / fadeLen(s));
      } else drawScene(ctx, s.scene, t, 1);
    },
  };
}
