// Object proposals → typed detections, plus transparent cut-outs.
import { colorDistance, hexToRgb, type RGB } from "../color";
import type { Box, DetectedObject, ObjectKind, TextElement } from "../types";
import { uid } from "../utils";
import { boxCoverage, makeCanvas, padBox, roundBox, scaleBox, type Raster } from "./raster";
import { isSkin, mergeNearby, type Segmentation } from "./segment";

const AD_HINT = /\b(shop|buy|order|price|sale|new|drop|launch|only|offer|deal|now)\b|[$€£]|\bR\s?\d/i;
const SPORT_HINT = /\b(vs|v\.|match|fc|cup|league|final|goal|derby|champions?|game ?day|season|tournament|united|city|rugby|soccer|football|basketball|cricket|tennis|boxing|race|marathon|stadium|kick ?off)\b/i;

export function proposeObjects(
  seg: Segmentation,
  r: Raster,
  texts: TextElement[],
  imgW: number,
  imgH: number,
  maxObjects = 14,
): DetectedObject[] {
  const s = 1 / r.scale;
  const textBoxes = texts.map((t) => scaleBox(t.box, s));
  const rasterArea = r.width * r.height;

  // Drop regions that are mostly text, then merge fragments.
  const nonText = seg.regions.filter((g) => {
    const covered = textBoxes.reduce((acc, tb) => Math.max(acc, boxCoverage(g.box, tb)), 0);
    return covered < 0.55;
  });
  const merged = mergeNearby(nonText, Math.max(2, Math.round(Math.min(r.width, r.height) * 0.012)), rasterArea);

  const allText = texts.map((t) => t.text).join(" ");
  const sporty = SPORT_HINT.test(allText);
  const commercial = AD_HINT.test(allText);
  const candidates = merged
    .filter((g) => {
      const a = (g.box.width * g.box.height) / rasterArea;
      return a > 0.004 && a < 0.92 && g.box.width > 4 && g.box.height > 4;
    })
    .sort((a, b) => b.area - a.area)
    .slice(0, maxObjects);

  const out: DetectedObject[] = [];
  for (const g of candidates) {
    const a = (g.box.width * g.box.height) / rasterArea;
    const aspect = g.box.height / g.box.width;
    const cx = (g.box.x + g.box.width / 2) / r.width;
    const cy = (g.box.y + g.box.height / 2) / r.height;
    const edgeBand = cy < 0.16 || cy > 0.84 || cx < 0.12 || cx > 0.88;
    const touchesBottom = g.box.y + g.box.height >= r.height - 2;
    const sat = saturation(g.meanColor);

    const compact = aspect > 0.6 && aspect < 1.6;
    const hasText = textBoxes.some((tb) => boxCoverage(tb, g.box) > 0.6);

    let kind: ObjectKind = "object";
    let label = "Object";
    let conf = 0.55;
    if (g.skin > 0.07 && aspect > 0.9 && a > 0.03) {
      kind = "person";
      label = sporty ? "Player" : "Person";
      conf = 0.62 + Math.min(0.3, g.skin);
    } else if (hasText && aspect < 0.5 && g.fill > 0.75 && a < 0.08) {
      kind = "object";
      label = cy > 0.8 && edgeBand ? "Sponsor logo" : "Call-to-action button";
      if (label === "Sponsor logo") kind = "logo";
      conf = 0.66;
    } else if (a < 0.06 && edgeBand && aspect > 0.3 && aspect < 3) {
      kind = "logo";
      label = cy > 0.8 ? "Sponsor logo" : sporty ? "Team badge" : "Logo";
      conf = 0.58 + (g.fill > 0.4 ? 0.1 : 0);
    } else if (a < 0.05 && compact && g.fill > 0.55) {
      kind = sporty || sat > 30 ? "logo" : "icon";
      label = sporty ? "Team badge" : kind === "logo" ? "Emblem" : "Icon";
      conf = 0.6;
    } else if (a < 0.012 && aspect > 0.5 && aspect < 2 && g.fill > 0.25) {
      kind = "icon";
      label = "Icon";
      conf = 0.6;
    } else if (commercial && a > 0.03 && a < 0.6) {
      kind = "product";
      label = "Product";
      conf = 0.62;
    } else if (a > 0.08 && aspect < 0.62 && cy > 0.5) {
      kind = "vehicle";
      label = "Vehicle";
      conf = 0.42;
    } else if (a > 0.12 && touchesBottom && aspect > 1.1 && sat < 25) {
      kind = "building";
      label = "Building / structure";
      conf = 0.42;
    } else if (a > 0.02 && a < 0.35 && g.fill > 0.45 && Math.abs(cx - 0.5) < 0.3) {
      kind = "product";
      label = "Product";
      conf = 0.5;
    }

    const box = roundBox(padBox(scaleBox(g.box, r.scale), 2 * r.scale, imgW, imgH));
    out.push({ id: uid("obj"), kind, label, box, confidence: round2(conf), source: "local" });

    if (kind === "person") {
      const face = findFace(r, g.box);
      if (face)
        out.push({
          id: uid("obj"),
          kind: "face",
          label: sporty ? "Player face" : "Face",
          box: roundBox(scaleBox(face, r.scale)),
          confidence: 0.55,
          source: "local",
        });
    }
  }

  // Multiple same-size logos along one band are almost always a sponsor strip.
  const logos = out.filter((o) => o.kind === "logo");
  for (const l of logos) {
    const cy = l.box.y + l.box.height / 2;
    const row = logos.filter(
      (m) => Math.abs(m.box.y + m.box.height / 2 - cy) < imgH * 0.04 && Math.abs(m.box.height - l.box.height) < l.box.height * 0.35,
    );
    if (row.length >= 3) {
      l.label = "Sponsor logo";
      l.confidence = round2(Math.min(0.9, l.confidence + 0.12));
    }
  }
  return out;
}

function findFace(r: Raster, b: Box): Box | null {
  // Skin blob in the top 40% of a person box.
  const h = Math.round(b.height * 0.4);
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -1;
  let y1 = -1;
  let n = 0;
  for (let y = b.y; y < b.y + h; y++)
    for (let x = b.x; x < b.x + b.width; x++) {
      const i = (y * r.width + x) * 4;
      const c: RGB = [r.data[i], r.data[i + 1], r.data[i + 2]];
      if (isSkin(c)) {
        n++;
        x0 = Math.min(x0, x);
        y0 = Math.min(y0, y);
        x1 = Math.max(x1, x);
        y1 = Math.max(y1, y);
      }
    }
  if (n < 20 || x1 < 0) return null;
  const size = Math.min(x1 - x0, y1 - y0, b.width * 0.6);
  if (size < 6) return null;
  const cx = (x0 + x1) / 2;
  return { x: cx - size / 2, y: y0, width: size, height: size * 1.2 };
}

/**
 * Produces a transparent PNG for a detection. Alpha comes from colour distance
 * to the learnt background model, gated by the dilated saliency mask, then
 * feathered — a lightweight stand-in for SAM / rembg matting.
 */
export function cutout(
  img: HTMLImageElement,
  box: Box,
  seg: Segmentation,
  mr: Raster,
  texts: TextElement[] = [],
): { cutout: string; crop: string; coverage: number } {
  const W = Math.max(1, Math.round(box.width));
  const H = Math.max(1, Math.round(box.height));
  const { canvas, ctx } = makeCanvas(W, H);
  ctx.drawImage(img, box.x, box.y, box.width, box.height, 0, 0, W, H);
  const crop = canvas.toDataURL("image/png");
  const id = ctx.getImageData(0, 0, W, H);
  const d = id.data;

  const s = 1 / mr.scale;
  // Text lying over the object is rebuilt as live text, so its ink is cut out
  // here to avoid a doubled "ghost" in the reconstruction.
  const inks = texts
    .filter((t) => boxCoverage(t.box, box) > 0.5)
    .map((t) => ({ b: t.box, c: hexToRgb(t.color) }));
  let kept = 0;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const c: RGB = [d[i], d[i + 1], d[i + 2]];
      let dist = Infinity;
      for (const bg of seg.bgColors) dist = Math.min(dist, colorDistance(c, bg));
      // mask lookup (nearest)
      const mx = Math.min(mr.width - 1, Math.floor((box.x + x) * s));
      const my = Math.min(mr.height - 1, Math.floor((box.y + y) * s));
      const inMask = seg.mask[my * mr.width + mx] === 1;
      let a = smoothstep(45, 120, dist);
      if (inMask) a = Math.max(a, 0.85);
      else a *= 0.35;
      const gx = box.x + x;
      const gy = box.y + y;
      for (const ink of inks)
        if (gx >= ink.b.x && gx <= ink.b.x + ink.b.width && gy >= ink.b.y && gy <= ink.b.y + ink.b.height && colorDistance(c, ink.c) < 170) a = 0;
      d[i + 3] = Math.round(a * 255);
      if (a > 0.5) kept++;
    }
  ctx.putImageData(id, 0, 0);
  // feather
  const f = makeCanvas(W, H);
  f.ctx.filter = "blur(0.6px)";
  f.ctx.drawImage(canvas, 0, 0);
  return { cutout: f.canvas.toDataURL("image/png"), crop, coverage: round2(kept / (W * H)) };
}

const smoothstep = (a: number, b: number, v: number) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

const saturation = ([r, g, b]: RGB) => {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return max ? ((max - min) / max) * 100 : 0;
};

const round2 = (v: number) => Math.round(v * 100) / 100;
