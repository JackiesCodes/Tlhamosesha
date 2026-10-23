// Object proposals → typed detections, plus transparent cut-outs.
import { colorDistance, hexToRgb, type RGB } from "../color";
import type { Box, DetectedObject, ObjectKind, TextElement } from "../types";
import { uid } from "../utils";
import { boxCoverage, makeCanvas, padBox, release, roundBox, scaleBox, type Raster } from "./raster";
import type { GraphicsMap } from "./graphics";
import { matteAt, type Matte } from "./ml";
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
  detail?: Raster,
): DetectedObject[] {
  const s = 1 / r.scale;
  const textBoxes = texts.map((t) => scaleBox(t.box, s));
  const rasterArea = r.width * r.height;

  // Drop regions that are mostly text, then merge fragments. A shape that
  // wholly encloses its text (a badge, a logo with lettering, a button) stays.
  const enclosing = (b: Box) => {
    const inner = textBoxes.filter((t) => t.x < b.x + b.width && t.x + t.width > b.x && t.y < b.y + b.height && t.y + t.height > b.y);
    return inner.length > 0 && inner.every((t) => boxCoverage(t, b) > 0.95 && t.width < b.width * 0.92 && t.height < b.height * 0.8);
  };
  const textLike = (b: Box) => textShare(b, textBoxes) >= 0.55 && !enclosing(b);
  const nonText = seg.regions.filter((g) => !textLike(g.box));
  const merged = mergeNearby(nonText, Math.max(2, Math.round(Math.min(r.width, r.height) * 0.012)), rasterArea);

  const allText = texts.map((t) => t.text).join(" ");
  const sporty = SPORT_HINT.test(allText);
  const commercial = AD_HINT.test(allText);
  const candidates = merged
    // Merging can rebuild a block of several text lines; drop those too.
    .filter((g) => !textLike(g.box))
    // Out-of-focus blobs in photo backgrounds have no crisp edges anywhere.
    .filter((g) => edgeSharpness(r, g.box) >= 18)
    .filter((g) => {
      const a = (g.box.width * g.box.height) / rasterArea;
      const aspect = g.box.height / g.box.width;
      // Small solid shapes (icons, badges) are kept even below the usual floor.
      const smallMark = a > 0.0015 && aspect > 0.6 && aspect < 1.6 && g.fill > 0.3;
      return (a > 0.004 || smallMark) && a < 0.92 && g.box.width > 4 && g.box.height > 4;
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
    // Icons are flat single-colour glyphs; logos and badges usually combine
    // colours (a fill plus lettering or an outline).
    const flat = a < 0.06 && compact && singleColour(detail ?? r, scaleBox(g.box, r.scale), seg.bgColors);

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
    } else if (flat) {
      kind = "icon";
      label = "Icon";
      conf = 0.6;
    } else if (a < 0.06 && edgeBand && aspect > 0.3 && aspect < 3) {
      kind = "logo";
      label = cy > 0.8 ? "Sponsor logo" : sporty ? "Team badge" : "Logo";
      conf = 0.58 + (g.fill > 0.4 ? 0.1 : 0);
    } else if (a < 0.05 && compact && g.fill > 0.55) {
      kind = "logo";
      label = sporty ? "Team badge" : "Emblem";
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

/** 98th-percentile luminance gradient inside a raster box: low means only soft, blurred edges. */
function edgeSharpness(r: Raster, b: Box): number {
  const lum = (i: number) => 0.3 * r.data[i] + 0.59 * r.data[i + 1] + 0.11 * r.data[i + 2];
  const g: number[] = [];
  const x0 = Math.max(1, Math.floor(b.x));
  const y0 = Math.max(1, Math.floor(b.y));
  const x1 = Math.min(r.width - 1, Math.ceil(b.x + b.width));
  const y1 = Math.min(r.height - 1, Math.ceil(b.y + b.height));
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) {
      const i = (y * r.width + x) * 4;
      g.push(Math.abs(lum(i + 4) - lum(i - 4)) + Math.abs(lum(i + r.width * 4) - lum(i - r.width * 4)));
    }
  if (!g.length) return 0;
  g.sort((a, b) => a - b);
  return g[Math.floor(g.length * 0.98)];
}

/** Share of a box covered by the union of the text boxes (grid estimate). */
function textShare(b: Box, textBoxes: Box[]): number {
  const near = textBoxes.filter((t) => t.x < b.x + b.width && t.x + t.width > b.x && t.y < b.y + b.height && t.y + t.height > b.y);
  if (!near.length) return 0;
  const n = 16;
  let hit = 0;
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      const x = b.x + ((i + 0.5) / n) * b.width;
      const y = b.y + ((j + 0.5) / n) * b.height;
      // Line gaps inside a text block count as text.
      if (near.some((t) => x >= t.x && x <= t.x + t.width && y >= t.y - t.height * 0.6 && y <= t.y + t.height * 1.6)) hit++;
    }
  return hit / (n * n);
}

/** True when the clearly-foreground pixels of a box (source px) are essentially one colour. */
function singleColour(r: Raster, box: Box, bgColors: RGB[]): boolean {
  const s = 1 / r.scale;
  const fg: RGB[] = [];
  const x0 = Math.max(0, Math.floor(box.x * s));
  const y0 = Math.max(0, Math.floor(box.y * s));
  const x1 = Math.min(r.width, Math.ceil((box.x + box.width) * s));
  const y1 = Math.min(r.height, Math.ceil((box.y + box.height) * s));
  const step = Math.max(1, Math.round(Math.sqrt(((x1 - x0) * (y1 - y0)) / 4000)));
  for (let y = y0; y < y1; y += step)
    for (let x = x0; x < x1; x += step) {
      const i = (y * r.width + x) * 4;
      const c: RGB = [r.data[i], r.data[i + 1], r.data[i + 2]];
      let d = Infinity;
      for (const bg of bgColors) d = Math.min(d, colorDistance(c, bg));
      if (d > 80) fg.push(c);
    }
  if (fg.length < 20) return false;
  const med = (k: number) => fg.map((p) => p[k]).sort((a, b) => a - b)[fg.length >> 1];
  const dom: RGB = [med(0), med(1), med(2)];
  return fg.filter((c) => colorDistance(c, dom) < 50).length / fg.length > 0.85;
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
 * feathered. With the AI matte, alpha comes from the matte instead wherever
 * it covers the object (photos, people, products); flat graphics the matte
 * ignores keep the colour-based alpha.
 */
export function cutout(
  img: HTMLImageElement,
  box: Box,
  seg: Segmentation,
  mr: Raster,
  texts: TextElement[] = [],
  matte?: Matte,
  graphics?: GraphicsMap,
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
  const ink = new Uint8Array(W * H);
  const IW = img.naturalWidth;
  const IH = img.naturalHeight;
  let useMatte = false;
  if (matte) {
    let on = 0;
    let tot = 0;
    for (let y = 0; y < H; y += 4)
      for (let x = 0; x < W; x += 4) {
        tot++;
        if (matteAt(matte, (box.x + x) / IW, (box.y + y) / IH) > 0.5) on++;
      }
    useMatte = on / Math.max(1, tot) > 0.12;
  }
  // Flat graphics: alpha straight from the crisp-patch mask.
  const gAt = (gx: number, gy: number) => {
    const g = graphics!;
    const x = Math.min(g.w - 1, Math.max(0, gx / g.scale - 0.5));
    const y = Math.min(g.h - 1, Math.max(0, gy / g.scale - 0.5));
    const x0 = Math.floor(x), y0 = Math.floor(y);
    const x1 = Math.min(g.w - 1, x0 + 1), y1 = Math.min(g.h - 1, y0 + 1);
    const fx = x - x0, fy = y - y0;
    const m = g.mask;
    return (m[y0 * g.w + x0] * (1 - fx) + m[y0 * g.w + x1] * fx) * (1 - fy) + (m[y1 * g.w + x0] * (1 - fx) + m[y1 * g.w + x1] * fx) * fy;
  };
  let useGraphic = false;
  if (graphics && !useMatte) {
    let on = 0;
    let tot = 0;
    for (let y = 0; y < H; y += 3)
      for (let x = 0; x < W; x += 3) {
        tot++;
        if (gAt(box.x + x, box.y + y) > 0.5) on++;
      }
    useGraphic = on / Math.max(1, tot) > 0.2;
  }
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
      const gx = box.x + x;
      const gy = box.y + y;
      let inText = false;
      for (const t of inks) {
        const m = Math.max(4, t.b.height * 0.25); // halo extends a little past the OCR box
        if (gx >= t.b.x - m && gx <= t.b.x + t.b.width + m && gy >= t.b.y - m && gy <= t.b.y + t.b.height + m) {
          inText = true;
          if (colorDistance(c, t.c) < 170 && gx >= t.b.x && gx <= t.b.x + t.b.width && gy >= t.b.y && gy <= t.b.y + t.b.height) ink[y * W + x] = 1;
        }
      }
      let a = smoothstep(45, 120, dist);
      if (useMatte) a = smoothstep(0.08, 0.92, matteAt(matte!, gx / IW, gy / IH));
      else if (useGraphic) a = Math.max(smoothstep(0.3, 0.7, gAt(gx, gy)), inMask && !inText ? smoothstep(45, 120, dist) : 0);
      // Text inflates the saliency mask, so under a text line trust colour alone:
      // otherwise the background around the letters is kept as a halo.
      else if (inMask && !inText) a = Math.max(a, 0.85);
      else if (!inMask) a *= 0.35;
      d[i + 3] = Math.round(a * 255);
    }
  // Grow the removed text by a couple of pixels so its anti-aliased outline
  // goes too, instead of leaving letter-shaped halos in the cut-out.
  const grow = 2;
  let kept = 0;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      let hit = false;
      for (let dy = -grow; dy <= grow && !hit; dy++)
        for (let dx = -grow; dx <= grow && !hit; dx++) {
          const yy = y + dy;
          const xx = x + dx;
          if (yy >= 0 && yy < H && xx >= 0 && xx < W && ink[yy * W + xx]) hit = true;
        }
      const i = (y * W + x) * 4;
      if (hit) d[i + 3] = 0;
      if (d[i + 3] > 127) kept++;
    }
  ctx.putImageData(id, 0, 0);
  // feather (the matte is already soft)
  const f = makeCanvas(W, H);
  f.ctx.filter = useMatte ? "none" : "blur(0.6px)";
  f.ctx.drawImage(canvas, 0, 0);
  const cut = f.canvas.toDataURL("image/png");
  release(canvas, f.canvas);
  return { cutout: cut, crop, coverage: round2(kept / (W * H)) };
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
