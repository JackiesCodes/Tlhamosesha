// Builds an editable scene graph from an analysis result.
import type { AnalysisResult, Scene, SceneLayer } from "../types";
import { uid } from "../utils";

export function buildScene(a: AnalysisResult, plate: string): Scene {
  const { width: W, height: H } = a.metadata;
  const layers: SceneLayer[] = [
    {
      id: uid("lyr"),
      name: "Background",
      type: "background",
      x: 0,
      y: 0,
      width: W,
      height: H,
      rotation: 0,
      opacity: 1,
      visible: true,
      locked: true,
      src: plate,
      fit: "fill",
    },
  ];

  // Larger cut-outs sit behind smaller ones.
  const objs = a.objects
    .filter((o) => o.cutout && o.kind !== "face")
    .sort((x, y) => y.box.width * y.box.height - x.box.width * x.box.height);
  for (const o of objs)
    layers.push({
      id: uid("lyr"),
      name: o.label,
      type: "image",
      x: o.box.x,
      y: o.box.y,
      width: o.box.width,
      height: o.box.height,
      rotation: 0,
      opacity: 1,
      visible: true,
      locked: false,
      src: o.cutout!,
      fit: "fill",
      sourceId: o.id,
    });

  for (const t of [...a.texts].sort((x, y) => x.font.sizePx - y.font.sizePx))
    layers.push({
      id: uid("lyr"),
      name: t.text.slice(0, 32),
      type: "text",
      x: t.box.x,
      y: t.box.y,
      width: t.box.width,
      height: t.box.height,
      rotation: 0,
      opacity: 1,
      visible: true,
      locked: false,
      text: t.text,
      color: t.color,
      fontFamily: t.font.family,
      fontSize: t.font.sizePx,
      fontWeight: t.font.weight,
      letterSpacing: t.font.letterSpacing,
      lineHeight: 1,
      align: t.font.align,
      uppercase: t.font.uppercase,
      sourceId: t.id,
    });

  return { width: W, height: H, background: a.palette[0]?.hex ?? "#000000", layers };
}
