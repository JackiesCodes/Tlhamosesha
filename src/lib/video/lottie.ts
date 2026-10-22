// Lottie (Bodymovin JSON) export of a rebuilt video. Each scene is a
// precomposition, crossfaded in order; inside, every layer is an image layer
// (text and shapes are rasterised, since Lottie players render text only with
// fonts they have) with keyframed position, scale and opacity whose easing
// matches the fitted motion.
import { drawLayerContent } from "../export";
import type { LayerTiming, Project, SceneLayer } from "../types";
import { loadImage, makeCanvas, release } from "../vision/raster";
import { EASINGS } from "./easing";
import { layerStateAt, syncedScenes, withLayerTimings } from "./project";

const FPS = 30;

type Vec = number[];
interface Kf {
  t: number;
  s: Vec;
  o?: { x: number[]; y: number[] };
  i?: { x: number[]; y: number[] };
  h?: 1;
}
type Prop = { a: 0; k: number | Vec } | { a: 1; k: Kf[] };

const stat = (k: number | Vec): Prop => ({ a: 0, k });

/** Rasterises a text or shape layer, with a margin for glyphs that overhang their box. */
async function rasterise(l: SceneLayer) {
  const pad = Math.ceil(Math.max(l.width, l.height) * 0.15);
  const { canvas, ctx } = makeCanvas(l.width + pad * 2, l.height + pad * 2);
  ctx.translate(canvas.width / 2, canvas.height / 2);
  drawLayerContent(ctx, { ...l, rotation: 0, opacity: 1 } as SceneLayer);
  const url = canvas.toDataURL("image/png");
  const size = { w: canvas.width, h: canvas.height };
  release(canvas);
  return { url, ...size };
}

/**
 * Keyframes for one layer's position, scale and opacity over [t0, t1]. Values
 * are sampled from the same state function the renderer uses, at every motion
 * keyframe and visibility change, so the Lottie matches the MP4. A segment
 * covered by a motion keyframe takes its easing; constant stretches hold.
 */
function animate(l: SceneLayer, timing: LayerTiming | undefined, t0: number, t1: number) {
  const cx = l.x + l.width / 2;
  const cy = l.y + l.height / 2;
  const at = (t: number) => {
    const st = layerStateAt(timing, t);
    return { p: [cx + st.dx, cy + st.dy, 0], s: [st.scale * 100, st.scale * 100, 100], o: [st.opacity * l.opacity * 100] };
  };
  if (!timing) return { p: stat([cx, cy, 0]), s: stat([100, 100, 100]), o: stat(l.opacity * 100) };
  const keys = timing.motion ?? [];
  const times = [...new Set([t0, t1, timing.in, timing.out, ...keys.map((k) => k.t)].map((t) => +t.toFixed(4)))]
    .filter((t) => t >= t0 && t <= t1)
    .sort((a, b) => a - b);
  const eps = 1e-4;
  const tracks = { p: [] as Kf[], s: [] as Kf[], o: [] as Kf[] };
  times.forEach((t, i) => {
    const v = at(Math.min(t1, t + eps)); // value just after t: jumps happen at t
    const frame = +(t * FPS).toFixed(3);
    for (const k of ["p", "s", "o"] as const) {
      const kf: Kf = { t: frame, s: v[k] };
      const next = times[i + 1];
      if (next !== undefined) {
        const key = keys.find((m) => Math.abs(m.t - t) < 1e-3);
        const end = at(next - eps)[k];
        if (end.every((x, j) => Math.abs(x - v[k][j]) < 1e-6)) kf.h = 1;
        else {
          const [x1, y1, x2, y2] = EASINGS[key?.easing ?? "linear"];
          kf.o = { x: [x1], y: [y1] };
          kf.i = { x: [x2], y: [y2] };
        }
      }
      tracks[k].push(kf);
    }
  });
  const prop = (kfs: Kf[]): Prop => (kfs.length > 1 ? { a: 1, k: kfs } : stat(kfs[0].s));
  return { p: prop(tracks.p), s: prop(tracks.s), o: prop(tracks.o) };
}

export async function exportLottie(project: Project): Promise<Blob> {
  const p = withLayerTimings(project);
  if (!p.video) throw new Error("This project isn't a video.");
  const scenes = syncedScenes(p);
  if (typeof document !== "undefined" && document.fonts) {
    const fonts = new Set(scenes.flatMap((s) => s.scene.layers.flatMap((l) => (l.type === "text" ? [`${l.fontWeight} 32px "${l.fontFamily}"`] : []))));
    await Promise.all([...fonts].map((f) => document.fonts.load(f).catch(() => [])));
  }
  const { width: W, height: H } = scenes[0].scene;
  const assets: Record<string, unknown>[] = [];
  const imageIds = new Map<string, string>();
  const imageAsset = (url: string, w: number, h: number) => {
    let id = imageIds.get(url);
    if (!id) {
      id = `img_${imageIds.size}`;
      imageIds.set(url, id);
      assets.push({ id, w: Math.round(w), h: Math.round(h), u: "", p: url, e: 1 });
    }
    return id;
  };
  const fade = (x: (typeof scenes)[number] | undefined) => (x?.transition === "fade" ? (x.transitionLength ?? 0.6) : 0);

  const sceneLayers = [];
  for (const [k, s] of scenes.entries()) {
    const fin = fade(s);
    const fout = fade(scenes[k + 1]);
    const t0 = Math.max(0, s.start - fin / 2);
    const t1 = Math.min(p.video.duration, s.end + fout / 2);
    const layers = [];
    // Lottie lists layers top first.
    for (const [i, l] of [...s.scene.layers].reverse().entries()) {
      if (!l.visible) continue;
      let ref: string;
      let w = l.width;
      let h = l.height;
      if ("src" in l) {
        const img = await loadImage(l.src);
        ref = imageAsset(l.src, img.naturalWidth, img.naturalHeight);
        // Image assets keep their own pixel size; scale them to the layer box.
        const sx = (l.width / img.naturalWidth) * 100;
        const sy = (l.height / img.naturalHeight) * 100;
        w = img.naturalWidth;
        h = img.naturalHeight;
        const a = animate(l, l.timing, t0, t1);
        const scaleBy = (v: Vec) => [(v[0] * sx) / 100, (v[1] * sy) / 100, 100];
        const sProp: Prop = a.s.a === 1 ? { a: 1, k: a.s.k.map((kf) => ({ ...kf, s: scaleBy(kf.s) })) } : stat(scaleBy(a.s.k as Vec));
        layers.push(imageLayer(i, l.name, ref, w, h, a.p, sProp, a.o, l.rotation, t0, t1));
        continue;
      }
      const r = await rasterise(l);
      ref = imageAsset(r.url, r.w, r.h);
      const a = animate(l, l.timing, t0, t1);
      layers.push(imageLayer(i, l.name, ref, r.w, r.h, a.p, a.s, a.o, l.rotation, t0, t1));
    }
    const id = `scene_${k + 1}`;
    assets.push({ id, nm: `Scene ${k + 1}`, layers });
    const o: Prop = fin
      ? { a: 1, k: [{ t: t0 * FPS, s: [0], o: { x: [0], y: [0] }, i: { x: [1], y: [1] } }, { t: (s.start + fin / 2) * FPS, s: [100] }] }
      : stat(100);
    sceneLayers.push({
      ddd: 0,
      ind: k + 1,
      ty: 0,
      nm: `Scene ${k + 1}`,
      refId: id,
      sr: 1,
      ks: { o, r: stat(0), p: stat([W / 2, H / 2, 0]), a: stat([W / 2, H / 2, 0]), s: stat([100, 100, 100]) },
      ao: 0,
      w: W,
      h: H,
      ip: t0 * FPS,
      op: t1 * FPS,
      st: 0,
      bm: 0,
    });
  }

  const json = {
    v: "5.12.1",
    fr: FPS,
    ip: 0,
    op: Math.round(p.video.duration * FPS),
    w: W,
    h: H,
    nm: p.name,
    ddd: 0,
    assets,
    // Later scenes sit on top, so a crossfade reveals the next scene over the last.
    layers: sceneLayers.reverse(),
    markers: scenes.map((s, k) => ({ tm: s.start * FPS, cm: `Scene ${k + 1}`, dr: (s.end - s.start) * FPS })),
  };
  return new Blob([JSON.stringify(json)], { type: "application/json" });
}

function imageLayer(ind: number, nm: string, refId: string, w: number, h: number, p: Prop, s: Prop, o: Prop, rotation: number, t0: number, t1: number) {
  return {
    ddd: 0,
    ind: ind + 1,
    ty: 2,
    nm,
    refId,
    sr: 1,
    ks: { o, r: stat(rotation), p, a: stat([w / 2, h / 2, 0]), s },
    ao: 0,
    ip: t0 * FPS,
    op: t1 * FPS,
    st: 0,
    bm: 0,
  };
}
