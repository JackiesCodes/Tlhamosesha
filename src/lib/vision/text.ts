// OCR + typography estimation.
import { colorDistance, contrastRatio, kmeans, toHex, type RGB } from "../color";
import type { Box, TextElement, TextRole } from "../types";
import { uid } from "../utils";
import { boxIoU, makeCanvas, sampleColors, type Raster } from "./raster";

export interface OcrLine {
  text: string;
  confidence: number;
  box: Box; // source px
}

type Progress = (p: number, note?: string) => void;

/** Runs Tesseract (WASM) on the image and on its inverted copy, merging lines. */
export async function runOcr(img: HTMLImageElement, onProgress: Progress, invertPass = true): Promise<OcrLine[]> {
  const { createWorker, PSM } = await import("tesseract.js");
  const W = img.naturalWidth;
  const H = img.naturalHeight;
  // Tesseract prefers ~1600–2400px text-heavy images.
  const scale = Math.min(2.5, Math.max(1, 1800 / Math.max(W, H)));
  const { canvas, ctx } = makeCanvas(W * scale, H * scale);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  const passes: { name: string; canvas: HTMLCanvasElement }[] = [{ name: "positive", canvas }];
  if (invertPass) {
    const inv = makeCanvas(canvas.width, canvas.height);
    inv.ctx.filter = "grayscale(1) invert(1) contrast(1.4)";
    inv.ctx.drawImage(canvas, 0, 0);
    passes.push({ name: "inverted", canvas: inv.canvas });
  }

  let pass = 0;
  const worker = await createWorker("eng", 1, {
    // Self-hosted assets (scripts/copy-ocr-assets.mjs); absolute because the worker boots from a blob URL.
    workerPath: `${location.origin}/ocr/worker.min.js`,
    corePath: `${location.origin}/ocr`,
    langPath: `${location.origin}/ocr/lang`,
    logger: (m: { status: string; progress: number }) => {
      if (m.status === "recognizing text") onProgress((pass + m.progress) / passes.length, `OCR ${passes[pass]?.name} pass`);
      else onProgress(pass / passes.length, m.status);
    },
  });

  // Sparse-text segmentation suits posters: scattered lines at many sizes.
  await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT });

  const lines: OcrLine[] = [];
  try {
    for (pass = 0; pass < passes.length; pass++) {
      const { data } = await worker.recognize(passes[pass].canvas);
      for (const l of data.lines ?? []) {
        const text = l.text.replace(/\s+/g, " ").trim();
        const alnum = (text.match(/[\p{L}\p{N}]/gu) ?? []).length;
        if (text.length < 2 || alnum / text.length < 0.55 || l.confidence < 50) continue;
        const box = {
          x: l.bbox.x0 / scale,
          y: l.bbox.y0 / scale,
          width: (l.bbox.x1 - l.bbox.x0) / scale,
          height: (l.bbox.y1 - l.bbox.y0) / scale,
        };
        if (box.height < 6 || box.width < 8) continue;
        // Reject implausible geometry (OCR hallucinations over photos/graphics).
        const charAspect = box.width / Math.max(1, text.length) / box.height;
        if (box.height > H * 0.3 || charAspect < 0.18 || charAspect > 2.2) continue;
        // Same line seen twice (other pass, or fragments of a longer line)?
        const clashes = lines.filter((o) => boxIoU(o.box, box) > 0.3 || sameLine(o.box, box));
        const beats = (o: OcrLine) =>
          text.length > o.text.length * 1.2 || (text.length >= o.text.length * 0.8 && l.confidence > o.confidence);
        if (clashes.every(beats)) {
          for (const c of clashes) lines.splice(lines.indexOf(c), 1);
          lines.push({ text, confidence: l.confidence, box });
        }
      }
    }
  } finally {
    await worker.terminate();
  }
  onProgress(1);
  return lines;
}

const MONTHS = /\b(jan(uary)?|feb(ruary)?|mar(ch)?|apr(il)?|may|june?|july?|aug(ust)?|sept?(ember)?|oct(ober)?|nov(ember)?|dec(ember)?|mon(day)?|tue(sday)?|wed(nesday)?|thu(rsday)?|fri(day)?|sat(urday)?|sun(day)?)\b/i;

export function classifyTextRole(text: string): TextRole | null {
  const t = text.trim();
  if (/\b\d{1,3}\s*[-–:|]\s*\d{1,3}\b/.test(t) && t.length <= 24 && !/\d{4}/.test(t)) return "score";
  if (MONTHS.test(t) || /\b\d{1,2}[./-]\d{1,2}[./-]\d{2,4}\b/.test(t) || /\b(19|20)\d{2}\b/.test(t) && t.length < 24)
    return "date";
  if (/\d+(\.\d+)?\s*(%|pts|km|kg|x|k|m|\+)(\b|$)/i.test(t) || (/^\D{0,10}\d[\d.,]*\D{0,12}$/.test(t) && t.length < 16))
    return "statistic";
  const words = t.split(/\s+/);
  if (words.length >= 2 && words.length <= 3 && !/\d/.test(t) && words.every((w) => /^[A-Z][\p{Ll}'’.-]+$/u.test(w)) && t.length < 28)
    return "name";
  return null;
}

const FONT_LIBRARY = {
  condensedHeavy: "Anton",
  condensed: "Oswald",
  display: "Bebas Neue",
  geometric: "Montserrat",
  serif: "Playfair Display",
  sans: "Inter",
  mono: "JetBrains Mono",
} as const;

export function buildTextElements(lines: OcrLine[], r: Raster, imgW: number, refMaxSize?: number): TextElement[] {
  const measured = lines.map((l) => {
    const s = 1 / r.scale;
    const rb = { x: l.box.x * s, y: l.box.y * s, width: l.box.width * s, height: l.box.height * s };
    const pixels = sampleColors(r, 1, rb);
    const border = ringColors(r, rb);
    const clusters = kmeans(pixels.length ? pixels : [[255, 255, 255]], 2, 6);
    // text colour = cluster farthest from surrounding background
    const bgRef = kmeans(border.length ? border : pixels, 1, 4)[0]?.center ?? [0, 0, 0];
    const ink = [...clusters].sort((a, b) => colorDistance(b.center, bgRef) - colorDistance(a.center, bgRef))[0];
    const inkRatio = ink ? ink.count / Math.max(1, pixels.length) : 0.3;
    const letters = l.text.replace(/\s/g, "");
    const upper = letters === letters.toUpperCase() && /[A-Z]/.test(letters);
    const descender = /[gjpqy,]/.test(l.text);
    const emFactor = upper ? 0.74 : descender ? 1.0 : 0.8;
    const sizePx = l.box.height / emFactor;
    const charW = l.box.width / Math.max(1, l.text.length);
    const widthRatio = charW / sizePx;
    const contrast = contrastRatio(ink?.center ?? [255, 255, 255], bgRef);
    return { l, inkRatio, upper, sizePx, widthRatio, color: ink?.center ?? ([255, 255, 255] as RGB), contrast, bgRef };
  });

  const maxSize = refMaxSize ?? Math.max(1, ...measured.map((m) => m.sizePx));
  const sorted = refMaxSize ? [] : [...measured].sort((a, b) => b.sizePx - a.sizePx);

  return measured.map((m) => {
    const weight =
      m.inkRatio < 0.16 ? 300 : m.inkRatio < 0.24 ? 400 : m.inkRatio < 0.31 ? 600 : m.inkRatio < 0.4 ? 700 : 800;
    const condensed = m.widthRatio < 0.46;
    const wide = m.widthRatio > 0.7;
    const numeric = /^[\d\s:.,%+\-–]+$/.test(m.l.text);
    let category: TextElement["font"]["category"] = "sans-serif";
    let family: string = FONT_LIBRARY.sans;
    if (numeric && m.sizePx > maxSize * 0.4) {
      category = "display";
      family = FONT_LIBRARY.display;
    } else if (condensed && weight >= 700) {
      category = "condensed";
      family = FONT_LIBRARY.condensedHeavy;
    } else if (condensed) {
      category = "condensed";
      family = FONT_LIBRARY.condensed;
    } else if (m.upper && (wide || weight >= 700)) {
      category = "sans-serif";
      family = FONT_LIBRARY.geometric;
    }

    let role: TextRole = classifyTextRole(m.l.text) ?? "body";
    const rank = sorted.indexOf(m);
    if (rank === 0 && role !== "score") role = "headline";
    else if (!["score", "date", "statistic", "name"].includes(role)) {
      if (m.sizePx >= maxSize * 0.55) role = "subheadline";
      else if (m.sizePx < maxSize * 0.28) role = "caption";
      else role = "body";
    }

    const cx = m.l.box.x + m.l.box.width / 2;
    const align: "left" | "center" | "right" =
      Math.abs(cx - imgW / 2) < imgW * 0.05 ? "center" : cx < imgW / 2 ? "left" : "right";
    const tracking = m.upper && m.widthRatio > 0.72 ? Math.round((m.widthRatio - 0.68) * m.sizePx) : 0;

    return {
      id: uid("txt"),
      text: m.l.text,
      role,
      box: m.l.box,
      confidence: Math.round(m.l.confidence) / 100,
      color: toHex(m.color),
      font: {
        family,
        category,
        weight,
        sizePx: Math.round(m.sizePx),
        letterSpacing: tracking,
        uppercase: m.upper,
        align,
      },
      source: "ocr",
    } satisfies TextElement;
  });
}

function ringColors(r: Raster, b: Box): RGB[] {
  const pad = Math.max(2, Math.round(b.height * 0.25));
  const out: RGB[] = [];
  const x0 = Math.max(0, Math.floor(b.x - pad));
  const x1 = Math.min(r.width - 1, Math.ceil(b.x + b.width + pad));
  const y0 = Math.max(0, Math.floor(b.y - pad));
  const y1 = Math.min(r.height - 1, Math.ceil(b.y + b.height + pad));
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const inside = x >= b.x && x <= b.x + b.width && y >= b.y && y <= b.y + b.height;
      if (inside) continue;
      const i = (y * r.width + x) * 4;
      out.push([r.data[i], r.data[i + 1], r.data[i + 2]]);
    }
  return out;
}

/** True when two boxes are the same text line (one is a fragment of the other). */
function sameLine(a: Box, b: Box) {
  const ox = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const oy = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return ox > 0.7 * Math.min(a.width, b.width) && oy > 0.5 * Math.min(a.height, b.height);
}

/**
 * Second-chance OCR for small high-contrast regions (buttons, word-mark logos)
 * that full-page segmentation tends to skip. Reads each crop as a single line.
 */
export async function readRegions(img: HTMLImageElement, boxes: Box[]): Promise<(OcrLine | null)[]> {
  if (!boxes.length) return [];
  const { createWorker, PSM } = await import("tesseract.js");
  const worker = await createWorker("eng", 1, {
    workerPath: `${location.origin}/ocr/worker.min.js`,
    corePath: `${location.origin}/ocr`,
    langPath: `${location.origin}/ocr/lang`,
  });
  await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_LINE });
  const out: (OcrLine | null)[] = [];
  try {
    for (const b of boxes) {
      const k = Math.min(4, Math.max(1, 140 / b.height));
      const pad = 8;
      const { canvas, ctx } = makeCanvas(b.width * k + pad * 2, b.height * k + pad * 2);
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.filter = "grayscale(1) contrast(1.6)";
      ctx.drawImage(img, b.x, b.y, b.width, b.height, pad, pad, b.width * k, b.height * k);
      const { data } = await worker.recognize(canvas);
      const words = (data.words ?? []).filter((w) => w.confidence > 60 && /[\p{L}\p{N}]{2,}/u.test(w.text));
      if (!words.length) {
        out.push(null);
        continue;
      }
      const x0 = Math.min(...words.map((w) => w.bbox.x0));
      const y0 = Math.min(...words.map((w) => w.bbox.y0));
      const x1 = Math.max(...words.map((w) => w.bbox.x1));
      const y1 = Math.max(...words.map((w) => w.bbox.y1));
      out.push({
        text: words.map((w) => w.text).join(" "),
        confidence: words.reduce((sum, w) => sum + w.confidence, 0) / words.length,
        box: { x: b.x + (x0 - pad) / k, y: b.y + (y0 - pad) / k, width: (x1 - x0) / k, height: (y1 - y0) / k },
      });
    }
  } finally {
    await worker.terminate();
  }
  return out;
}
