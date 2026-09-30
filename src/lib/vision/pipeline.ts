// Orchestrates the full breakdown: local CV → OCR → cloud vision → merge →
// cut-outs → background plate → layout → classification → DNA → scene.
import type { VisionResponse } from "../ai/schema";
import { buildPalette, hexToRgb, toHex } from "../color";
import type {
  AnalysisResult,
  DesignCategory,
  DetectedObject,
  EngineRun,
  Metadata,
  ObjectKind,
  Scene,
  TextElement,
  TextRole,
} from "../types";
import { gcd, uid } from "../utils";
import { extractBackground } from "./background";
import { classifyDesign } from "./classify";
import { scoreDna } from "./dna";
import { analyzeLayout } from "./layout";
import { cutout, proposeObjects } from "./objects";
import { boxIoU, loadImage, makeCanvas, nextFrame, rasterize, sampleColors } from "./raster";
import { buildScene } from "./reconstruct";
import { segment } from "./segment";
import { buildTextElements, classifyTextRole, readRegions, runOcr, type OcrLine } from "./text";

export const PIPELINE_STEPS = [
  { id: "load", label: "Decoding image" },
  { id: "palette", label: "Extracting colour palette" },
  { id: "segment", label: "Segmenting foreground" },
  { id: "ocr", label: "Reading text (OCR)" },
  { id: "cloud", label: "Cloud vision models" },
  { id: "objects", label: "Detecting objects & logos" },
  { id: "cutouts", label: "Removing backgrounds" },
  { id: "background", label: "Rebuilding background plate" },
  { id: "layout", label: "Analysing layout & grid" },
  { id: "classify", label: "Classifying design" },
  { id: "reconstruct", label: "Reconstructing editable layers" },
] as const;

export type StepId = (typeof PIPELINE_STEPS)[number]["id"];

export interface PipelineOptions {
  fileName: string;
  fileSize: number;
  mimeType: string;
  ocr: boolean;
  ocrInvertPass: boolean;
  cloud: boolean;
  sensitivity: number;
  maxObjects: number;
  onStep: (id: StepId, status: "active" | "done" | "skipped" | "error", note?: string) => void;
  onProgress?: (id: StepId, p: number, note?: string) => void;
}

export interface PipelineOutput {
  analysis: AnalysisResult;
  scene: Scene;
  original: string;
  thumbnail: string;
}

const MAX_WORKING = 2400;

export async function runPipeline(src: string, opt: PipelineOptions): Promise<PipelineOutput> {
  const engines: EngineRun[] = [];
  const t0 = performance.now();

  // ---- load & normalise
  opt.onStep("load", "active");
  const raw = await loadImage(src);
  const origW = raw.naturalWidth;
  const origH = raw.naturalHeight;
  const k = Math.min(1, MAX_WORKING / Math.max(origW, origH));
  const work = makeCanvas(origW * k, origH * k);
  work.ctx.imageSmoothingQuality = "high";
  work.ctx.drawImage(raw, 0, 0, work.canvas.width, work.canvas.height);
  const original = opt.mimeType === "image/png" ? work.canvas.toDataURL("image/png") : work.canvas.toDataURL("image/jpeg", 0.93);
  const img = await loadImage(original);
  const W = img.naturalWidth;
  const H = img.naturalHeight;
  const thumbC = makeCanvas(Math.min(480, W), Math.min(480, W) * (H / W));
  thumbC.ctx.drawImage(img, 0, 0, thumbC.canvas.width, thumbC.canvas.height);
  const thumbnail = thumbC.canvas.toDataURL("image/jpeg", 0.82);
  const seg0 = rasterize(img, 360); // segmentation raster
  const mid = rasterize(img, 900); // text colour raster
  opt.onStep("load", "done", `${origW}×${origH}`);
  await nextFrame();

  // ---- palette
  opt.onStep("palette", "active");
  const palette = buildPalette(sampleColors(seg0, 2), 10);
  const colorfulness = colourfulness(seg0.data);
  const meanL = palette.reduce((s, p) => s + p.hsl[2] * p.weight, 0);
  opt.onStep("palette", "done", `${palette.length} colours`);
  await nextFrame();

  // ---- segmentation
  opt.onStep("segment", "active");
  const tSeg = performance.now();
  const seg = segment(seg0, opt.sensitivity);
  opt.onStep("segment", "done", `${seg.regions.length} regions`);
  if ((globalThis as { __TL_DEBUG?: boolean }).__TL_DEBUG) debugMasks(seg0, seg);
  await nextFrame();

  // ---- OCR and cloud in parallel
  const cloudPromise = opt.cloud ? callCloud(img) : Promise.resolve(null);
  let lines: OcrLine[] = [];
  if (opt.ocr) {
    opt.onStep("ocr", "active");
    const tOcr = performance.now();
    try {
      lines = await runOcr(img, (p, note) => opt.onProgress?.("ocr", p, note), opt.ocrInvertPass);
      engines.push({ id: "ocr", label: "Tesseract OCR (WASM)", status: "ok", durationMs: ms(tOcr), note: `${lines.length} lines` });
      opt.onStep("ocr", "done", `${lines.length} lines`);
    } catch (e) {
      engines.push({ id: "ocr", label: "Tesseract OCR (WASM)", status: "error", durationMs: ms(tOcr), note: String(e) });
      opt.onStep("ocr", "error", "OCR unavailable");
    }
  } else {
    engines.push({ id: "ocr", label: "Tesseract OCR (WASM)", status: "skipped", durationMs: 0 });
    opt.onStep("ocr", "skipped");
  }
  let texts: TextElement[] = buildTextElements(lines, mid, W);

  opt.onStep("cloud", "active");
  const cloud = await cloudPromise;
  if (cloud) {
    for (const p of cloud.providers)
      engines.push({ id: p.provider, label: p.label, status: p.status, durationMs: p.durationMs, note: p.error });
    const okCount = cloud.providers.filter((p) => p.status === "ok").length;
    opt.onStep("cloud", okCount ? "done" : "skipped", okCount ? `${okCount} provider${okCount > 1 ? "s" : ""}` : "no providers configured");
  } else opt.onStep("cloud", "skipped", "disabled");
  await nextFrame();

  // ---- objects
  opt.onStep("objects", "active");
  let objects = proposeObjects(seg, seg0, texts, W, H, opt.maxObjects);
  engines.unshift({ id: "local", label: "On-device CV (saliency + components)", status: "ok", durationMs: ms(tSeg), note: `${objects.length} proposals` });
  let cloudCategories: DesignCategory[] | null = null;
  if (cloud?.merged) {
    const src = cloud.primary ?? "openai";
    texts = mergeTexts(texts, cloud.merged, W, H, src);
    objects = mergeObjects(objects, cloud.merged, W, H, src);
    if (cloud.merged.designType)
      cloudCategories = [cloud.merged.designType, ...(cloud.merged.categories ?? [])].filter(
        (c, i, arr) => arr.findIndex((x) => x.label === c.label) === i,
      );
  }
  if (opt.ocr) {
    try {
      const targets = objects.filter(
        (o) =>
          (o.kind === "logo" || o.label === "Call-to-action button" || (o.kind === "object" && o.box.height / o.box.width < 0.6)) &&
          !texts.some((t) => boxIoU(t.box, o.box) > 0.1),
      );
      const reads = await readRegions(img, targets.map((o) => o.box));
      const extra: OcrLine[] = [];
      reads.forEach((line, i) => {
        if (!line) return;
        const o = targets[i];
        if (o.kind === "logo") o.label = `${o.label} · ${line.text}`;
        else {
          o.label = "Call-to-action button";
          extra.push(line);
        }
      });
      if (extra.length) {
        const added = buildTextElements(extra, mid, W, Math.max(...texts.map((t) => t.font.sizePx), 1));
        for (const t of added) t.role = "cta";
        texts = [...texts, ...added];
      }
    } catch {
      /* region OCR is best-effort */
    }
  }
  opt.onStep("objects", "done", `${objects.length} objects`);
  await nextFrame();

  // ---- cut-outs
  opt.onStep("cutouts", "active");
  for (let i = 0; i < objects.length; i++) {
    const o = objects[i];
    const c = cutout(img, o.box, seg, seg0, texts);
    o.cutout = c.cutout;
    o.crop = c.crop;
    o.coverage = c.coverage;
    opt.onProgress?.("cutouts", (i + 1) / objects.length);
    if (i % 3 === 2) await nextFrame();
  }
  opt.onStep("cutouts", "done", `${objects.length} PNGs`);

  // ---- background
  opt.onStep("background", "active");
  await nextFrame();
  const bg = extractBackground(
    img,
    seg0,
    seg.mask,
    [...texts.map((t) => t.box), ...objects.map((o) => o.box)],
  );
  opt.onStep("background", "done", `${bg.layers.length} layers`);
  await nextFrame();

  // ---- layout
  opt.onStep("layout", "active");
  const layout = analyzeLayout(texts, objects, W, H);
  opt.onStep("layout", "done", `${layout.columns}×${layout.rows} grid`);

  // ---- classify
  opt.onStep("classify", "active");
  const aspectDecimal = origW / origH;
  const local = classifyDesign({ texts, objects, palette, aspect: aspectDecimal, colorfulness, edgeDensity: seg.edgeDensity });
  const categories = cloudCategories?.length ? blendCategories(cloudCategories, local) : local;
  const g = gcd(origW, origH);
  const ratio = `${origW / g}:${origH / g}`;
  const metadata: Metadata = {
    width: W,
    height: H,
    aspectRatio: origW / g > 50 ? approxRatio(aspectDecimal) : ratio,
    aspectDecimal: Math.round(aspectDecimal * 1000) / 1000,
    orientation: Math.abs(aspectDecimal - 1) < 0.03 ? "square" : aspectDecimal > 1 ? "landscape" : "portrait",
    fileName: opt.fileName,
    fileSize: opt.fileSize,
    mimeType: opt.mimeType,
    megapixels: Math.round(((origW * origH) / 1e6) * 100) / 100,
    designType: categories[0],
    categories,
    dominantTone: meanL < 38 ? "dark" : meanL > 65 ? "light" : "mid",
    colorfulness: Math.round(colorfulness),
    edgeDensity: Math.round(seg.edgeDensity * 1000) / 1000,
  };
  opt.onStep("classify", "done", `${categories[0].label} — ${Math.round(categories[0].confidence * 100)}%`);

  const bgHex = toHex(seg.bgColors[0] ?? hexToRgb(palette[0]?.hex ?? "#000000"));
  const dna = scoreDna(texts, palette, layout, W, H, bgHex);

  // ---- reconstruct
  opt.onStep("reconstruct", "active");
  const analysis: AnalysisResult = {
    version: 1,
    createdAt: new Date().toISOString(),
    engines,
    metadata,
    texts,
    objects,
    backgrounds: bg.layers,
    palette,
    gradients: bg.gradients,
    layout,
    dna,
  };
  const scene = buildScene(analysis, bg.plate);
  opt.onStep("reconstruct", "done", `${scene.layers.length} layers · ${Math.round(ms(t0) / 100) / 10}s`);
  return { analysis, scene, original, thumbnail };
}

// ---------------------------------------------------------------------------

async function callCloud(img: HTMLImageElement) {
  try {
    const health = await fetch("/api/health").then((r) => r.json());
    if (!health?.providers?.some((p: { enabled: boolean }) => p.enabled)) return null;
    const maxDim = 1280;
    const s = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
    const { canvas, ctx } = makeCanvas(img.naturalWidth * s, img.naturalHeight * s);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const res = await fetch("/api/analyze", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ image: canvas.toDataURL("image/jpeg", 0.88) }),
    });
    if (!res.ok) return null;
    return (await res.json()) as {
      providers: { provider: EngineRun["id"]; label: string; status: EngineRun["status"]; durationMs: number; error?: string }[];
      merged: VisionResponse | null;
      primary: EngineRun["id"] | null;
    };
  } catch {
    return null;
  }
}

const ROLES: TextRole[] = ["headline", "subheadline", "caption", "statistic", "score", "date", "name", "cta", "body"];
const KINDS: ObjectKind[] = ["person", "face", "product", "vehicle", "building", "object", "logo", "icon"];

const denorm = (b: [number, number, number, number], W: number, H: number) => ({
  x: Math.round(b[0] * W),
  y: Math.round(b[1] * H),
  width: Math.round(b[2] * W),
  height: Math.round(b[3] * H),
});

function mergeTexts(texts: TextElement[], v: VisionResponse, W: number, H: number, src: EngineRun["id"]): TextElement[] {
  const out = [...texts];
  for (const t of v.texts ?? []) {
    const box = denorm(t.box, W, H);
    if (box.width < 4 || box.height < 4) continue;
    const match = out.find((o) => boxIoU(o.box, box) > 0.25);
    const role = ROLES.includes(t.role as TextRole) ? (t.role as TextRole) : undefined;
    if (match) {
      // Vision LLMs are better at identifying typefaces and roles; OCR at geometry.
      if (t.fontFamily) match.font.family = t.fontFamily;
      if (t.fontWeight) match.font.weight = t.fontWeight;
      if (role) match.role = role;
      if (match.confidence < 0.7 && t.text.length > 1) match.text = t.text;
    } else {
      const upper = t.text === t.text.toUpperCase();
      out.push({
        id: uid("txt"),
        text: t.text,
        role: role ?? classifyTextRole(t.text) ?? "body",
        box,
        confidence: 0.8,
        color: /^#[0-9a-f]{6}$/i.test(t.color ?? "") ? t.color!.toUpperCase() : "#FFFFFF",
        font: {
          family: t.fontFamily ?? "Inter",
          category: "sans-serif",
          weight: t.fontWeight ?? 600,
          sizePx: Math.round(box.height / (upper ? 0.74 : 0.9)),
          letterSpacing: 0,
          uppercase: upper,
          align: Math.abs(box.x + box.width / 2 - W / 2) < W * 0.05 ? "center" : box.x < W / 2 ? "left" : "right",
        },
        source: src,
      });
    }
  }
  return out;
}

function mergeObjects(objects: DetectedObject[], v: VisionResponse, W: number, H: number, src: EngineRun["id"]): DetectedObject[] {
  const out = [...objects];
  for (const o of v.objects ?? []) {
    const box = denorm(o.box, W, H);
    if (box.width < 6 || box.height < 6) continue;
    const kind = KINDS.includes(o.kind as ObjectKind) ? (o.kind as ObjectKind) : "object";
    const match = out.find((x) => boxIoU(x.box, box) > 0.3);
    if (match) {
      match.kind = kind;
      match.label = o.label;
      match.confidence = Math.max(match.confidence, o.confidence ?? 0.85);
      match.source = src;
    } else
      out.push({ id: uid("obj"), kind, label: o.label, box, confidence: o.confidence ?? 0.8, source: src });
  }
  return out;
}

function blendCategories(cloud: DesignCategory[], local: DesignCategory[]): DesignCategory[] {
  const map = new Map<string, number>();
  for (const c of cloud) map.set(c.label, c.confidence * 0.75);
  for (const c of local) map.set(c.label, (map.get(c.label) ?? 0) + c.confidence * 0.25);
  const top = cloud[0];
  map.set(top.label, Math.max(map.get(top.label) ?? 0, top.confidence));
  return [...map.entries()]
    .map(([label, confidence]) => ({ label, confidence: Math.round(Math.min(0.99, confidence) * 100) / 100 }))
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 5);
}

/** Hasler–Süsstrunk colourfulness metric. */
function colourfulness(d: Uint8ClampedArray) {
  let n = 0;
  let mRg = 0;
  let mYb = 0;
  let sRg = 0;
  let sYb = 0;
  for (let i = 0; i < d.length; i += 8) {
    const rg = d[i] - d[i + 1];
    const yb = 0.5 * (d[i] + d[i + 1]) - d[i + 2];
    n++;
    mRg += rg;
    mYb += yb;
    sRg += rg * rg;
    sYb += yb * yb;
  }
  mRg /= n;
  mYb /= n;
  const stdRg = Math.sqrt(sRg / n - mRg * mRg);
  const stdYb = Math.sqrt(sYb / n - mYb * mYb);
  return Math.sqrt(stdRg ** 2 + stdYb ** 2) + 0.3 * Math.sqrt(mRg ** 2 + mYb ** 2);
}

function approxRatio(r: number) {
  const known: [string, number][] = [
    ["1:1", 1], ["4:5", 0.8], ["3:4", 0.75], ["2:3", 0.667], ["9:16", 0.5625], ["1:1.414 (A-series)", 0.707],
    ["5:4", 1.25], ["4:3", 1.333], ["3:2", 1.5], ["16:9", 1.778], ["1.91:1", 1.91], ["3:1", 3], ["4:1", 4],
  ];
  const best = known.reduce((a, b) => (Math.abs(b[1] - r) < Math.abs(a[1] - r) ? b : a));
  return Math.abs(best[1] - r) < 0.03 ? best[0] : `${r.toFixed(2)}:1`;
}

export const ms = (t: number) => Math.round(performance.now() - t);

/** Debug aid: exposes saliency + mask images on window.__TL_SEG (set window.__TL_DEBUG = true). */
function debugMasks(r: { width: number; height: number }, seg: { saliency: Float32Array; mask: Uint8Array; regions: unknown[] }) {
  const img = (f: (i: number) => number) => {
    const { canvas, ctx } = makeCanvas(r.width, r.height);
    const d = ctx.createImageData(r.width, r.height);
    for (let i = 0; i < r.width * r.height; i++) {
      const v = f(i);
      d.data[i * 4] = d.data[i * 4 + 1] = d.data[i * 4 + 2] = v;
      d.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(d, 0, 0);
    return canvas.toDataURL();
  };
  (globalThis as { __TL_SEG?: unknown }).__TL_SEG = {
    saliency: img((i) => seg.saliency[i] * 255),
    mask: img((i) => seg.mask[i] * 255),
    regions: seg.regions,
  };
}
