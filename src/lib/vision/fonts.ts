// Font matching by rendering: each text line becomes a soft ink map (how close
// each pixel is to the text colour), then is re-drawn in every library font
// and weight at the size that matches its ink height, word by word with the
// letter-spacing that matches each word's width (word gaps differ between
// fonts, so fitting the whole line at once misplaces the right font). The
// candidate whose glyphs overlap the real ink best wins; its size and spacing
// come from the same fit, and the colour is read from the pixels both agree
// are glyph.
import { colorDistance, hexToRgb, toHex, type RGB } from "../color";
import { FONT_LIBRARY } from "../fonts";

import type { TextElement } from "../types";
import { makeCanvas, release } from "./raster";

/** Working height of a line, in pixels: enough detail to tell fonts apart, cheap to render ~60 times. */
const LINE_PX = 64;

let fontsReady: Promise<unknown> | null = null;
function loadLibrary() {
  if (typeof document === "undefined" || !document.fonts) return Promise.resolve();
  fontsReady ??= Promise.all(
    FONT_LIBRARY.flatMap((f) => f.weights.map((w) => document.fonts.load(`${w} 40px "${f.family}"`, "AaGg09").catch(() => []))),
  );
  return fontsReady;
}

interface Fit {
  family: string;
  category: TextElement["font"]["category"];
  weight: number;
  score: number;
  sizePx: number;
  spacing: number;
  glyph: Uint8Array;
}

export async function matchFonts(img: HTMLImageElement, texts: TextElement[]) {
  if (!texts.length) return;
  await loadLibrary();
  for (const t of texts) {
    try {
      matchOne(img, t);
    } catch {
      /* keep the heuristic font for this line */
    }
  }
}

function matchOne(img: HTMLImageElement, t: TextElement) {
  const text = (t.font.uppercase ? t.text.toUpperCase() : t.text).trim();
  if (text.replace(/\s/g, "").length < 2 || t.box.height < 6) return;
  const k = Math.min(1, LINE_PX / t.box.height);
  const pad = Math.round(t.box.height * 0.2);
  const sx = Math.max(0, Math.floor(t.box.x - pad));
  const sy = Math.max(0, Math.floor(t.box.y - pad));
  const sw = Math.min(img.naturalWidth - sx, Math.ceil(t.box.width + pad * 2));
  const sh = Math.min(img.naturalHeight - sy, Math.ceil(t.box.height + pad * 2));
  const w = Math.max(4, Math.round(sw * k));
  const h = Math.max(4, Math.round(sh * k));
  const { canvas, ctx } = makeCanvas(w, h);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
  const px = ctx.getImageData(0, 0, w, h).data;

  // Ink: 1 near the text colour, fading to 0 by 60% of the way to the
  // background colour. Soft, so busy backgrounds don't add solid "ink".
  const ring: RGB[] = [];
  for (let x = 0; x < w; x++) ring.push(rgb(px, x, 0, w), rgb(px, x, h - 1, w));
  for (let y = 0; y < h; y++) ring.push(rgb(px, 0, y, w), rgb(px, w - 1, y, w));
  const bg = median(ring);
  const fg = hexToRgb(t.color);
  const contrast = colorDistance(fg, bg);
  if (contrast < 40) return release(canvas);
  const ink = new Float32Array(w * h);
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  // Only inside the OCR box (plus a little): the padding is there for the ring.
  const bx0 = Math.max(0, Math.floor((t.box.x - sx - pad * 0.4) * k));
  const bx1 = Math.min(w - 1, Math.ceil((t.box.x + t.box.width - sx + pad * 0.4) * k));
  const by0 = Math.max(0, Math.floor((t.box.y - sy - pad * 0.4) * k));
  const by1 = Math.min(h - 1, Math.ceil((t.box.y + t.box.height - sy + pad * 0.4) * k));
  for (let y = by0; y <= by1; y++)
    for (let x = bx0; x <= bx1; x++) {
      const v = Math.max(0, Math.min(1, 1 - (colorDistance(rgb(px, x, y, w), fg) - 0.25 * contrast) / (0.35 * contrast)));
      ink[y * w + x] = v;
      if (v > 0.5) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  if (x1 - x0 < 4 || y1 - y0 < 4) return release(canvas);
  const mh = y1 - y0 + 1;

  // Words: runs of ink columns split at gaps wider than ~a quarter of the
  // line height, merged at the narrowest gaps until they match the words.
  const words = text.split(/\s+/);
  const colInk = new Uint16Array(w);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (ink[y * w + x] > 0.5) colInk[x]++;
  let segs: [number, number][] = [];
  let run: [number, number] | null = null;
  let gap = 0;
  for (let x = x0; x <= x1 + 1; x++) {
    if (x <= x1 && colInk[x] > 0) {
      if (run && gap > mh * 0.28) {
        segs.push(run);
        run = null;
      }
      if (!run) run = [x, x];
      run[1] = x;
      gap = 0;
    } else gap++;
  }
  if (run) segs.push(run);
  while (segs.length > words.length) {
    let bi = 0;
    for (let i = 1; i < segs.length - 1; i++) if (segs[i + 1][0] - segs[i][1] < segs[bi + 1][0] - segs[bi][1]) bi = i;
    segs.splice(bi, 2, [segs[bi][0], segs[bi + 1][1]]);
  }
  if (segs.length !== words.length || words.length < 2) segs = [[x0, x1]];
  const parts = segs.length > 1 ? words.map((wd, i) => ({ text: wd, x0: segs[i][0], x1: segs[i][1] })) : [{ text, x0, x1 }];

  const r = makeCanvas(w, h);
  const spaced = r.ctx as CanvasRenderingContext2D & { letterSpacing?: string };
  const canSpace = "letterSpacing" in r.ctx;
  const setFont = (font: string, spacing: number) => {
    r.ctx.font = font;
    if (canSpace) spaced.letterSpacing = `${spacing}px`;
  };
  let best: Fit | null = null;
  for (const f of FONT_LIBRARY)
    for (const weight of f.weights) {
      setFont(`${weight} 100px "${f.family}"`, 0);
      const m = r.ctx.measureText(text);
      const inkH = m.actualBoundingBoxAscent + m.actualBoundingBoxDescent;
      if (inkH <= 0) continue;
      const size = (mh / inkH) * 100;
      const baseline = y0 + (m.actualBoundingBoxAscent * size) / 100;
      r.ctx.clearRect(0, 0, w, h);
      r.ctx.fillStyle = "#000";
      let spacingSum = 0;
      for (const part of parts) {
        setFont(`${weight} 100px "${f.family}"`, 0);
        const pm = r.ctx.measureText(part.text);
        const pw = ((pm.actualBoundingBoxLeft + pm.actualBoundingBoxRight) * size) / 100;
        let spacing = canSpace ? (part.x1 - part.x0 + 1 - pw) / Math.max(1, part.text.length - 1) : 0;
        spacing = Math.max(-0.08 * size, Math.min(0.5 * size, spacing));
        spacingSum += spacing;
        setFont(`${weight} ${size}px "${f.family}"`, spacing);
        r.ctx.fillText(part.text, part.x0 + r.ctx.measureText(part.text).actualBoundingBoxLeft, baseline);
      }
      const a = r.ctx.getImageData(0, 0, w, h).data;
      const glyph = new Uint8Array(w * h);
      let I = 0, U = 0;
      for (let y = Math.max(0, y0 - 2); y <= Math.min(h - 1, y1 + 2); y++)
        for (let x = Math.max(0, x0 - 2); x <= Math.min(w - 1, x1 + 2); x++) {
          const i = y * w + x;
          const g = a[i * 4 + 3] / 255;
          glyph[i] = g > 0.5 ? 1 : 0;
          I += Math.min(g, ink[i]);
          U += Math.max(g, ink[i]);
        }
      const score = U ? I / U : 0;
      if (!best || score > best.score)
        best = { family: f.family, category: f.category, weight, score, sizePx: size / k, spacing: spacingSum / parts.length / k, glyph };
    }
  if (best && best.score > 0.35) {
    t.font.family = best.family;
    t.font.category = best.category;
    t.font.weight = best.weight;
    t.font.sizePx = Math.round(best.sizePx * 10) / 10;
    t.font.letterSpacing = Math.round(best.spacing * 10) / 10;
    // Colour from the glyph cores both masks agree on (no anti-aliased edges).
    const core: RGB[] = [];
    for (let y = 1; y < h - 1; y++)
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        if (best.glyph[i] && ink[i] > 0.5 && best.glyph[i - 1] && best.glyph[i + 1] && best.glyph[i - w] && best.glyph[i + w]) core.push(rgb(px, x, y, w));
      }
    if (core.length > 12) t.color = toHex(median(core));
  }
  release(canvas, r.canvas);
}

const rgb = (d: Uint8ClampedArray, x: number, y: number, w: number): RGB => {
  const i = (y * w + x) * 4;
  return [d[i], d[i + 1], d[i + 2]];
};

function median(cs: RGB[]): RGB {
  const m = (k: number) => cs.map((c) => c[k]).sort((a, b) => a - b)[cs.length >> 1];
  return [m(0), m(1), m(2)];
}
