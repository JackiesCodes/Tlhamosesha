// Core domain model for Decon.
// All geometry is expressed in source-image pixels unless noted otherwise.

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type TextRole =
  | "headline"
  | "subheadline"
  | "caption"
  | "statistic"
  | "score"
  | "date"
  | "name"
  | "cta"
  | "body";

export interface TextElement {
  id: string;
  text: string;
  role: TextRole;
  box: Box;
  confidence: number;
  color: string;
  font: {
    family: string;
    category: "sans-serif" | "serif" | "display" | "condensed" | "monospace" | "script";
    weight: number;
    sizePx: number;
    letterSpacing: number;
    uppercase: boolean;
    align: "left" | "center" | "right";
  };
  source: EngineId;
}

export type ObjectKind =
  | "person"
  | "face"
  | "product"
  | "vehicle"
  | "building"
  | "object"
  | "logo"
  | "icon";

export interface DetectedObject {
  id: string;
  kind: ObjectKind;
  label: string;
  box: Box;
  confidence: number;
  /** Transparent PNG cut-out (data URL). */
  cutout?: string;
  /** Plain crop (data URL). */
  crop?: string;
  /** Share of pixels kept after background removal, 0..1. */
  coverage?: number;
  source: EngineId;
}

export type BackgroundKind = "base" | "gradient" | "texture" | "blur" | "overlay" | "lighting";

export interface BackgroundLayer {
  id: string;
  kind: BackgroundKind;
  label: string;
  /** Data URL of the extracted plate. */
  image: string;
  /** CSS gradient string when kind === gradient. */
  css?: string;
  confidence: number;
  meta?: Record<string, string | number>;
}

export type ColorRole = "primary" | "secondary" | "accent" | "neutral";

export interface PaletteColor {
  hex: string;
  rgb: [number, number, number];
  hsl: [number, number, number];
  name: string;
  weight: number;
  role: ColorRole;
}

export interface GradientValue {
  id: string;
  angle: number;
  stops: { hex: string; at: number }[];
  css: string;
  region: string;
}

export interface LayoutAnalysis {
  columns: number;
  rows: number;
  gutter: number;
  margins: { top: number; right: number; bottom: number; left: number };
  padding: number;
  alignment: "left" | "center" | "right" | "mixed";
  columnGuides: number[];
  rowGuides: number[];
  baseline: number;
  symmetry: number;
  /** Visual hierarchy, highest weight first. */
  hierarchy: { id: string; label: string; weight: number }[];
}

export interface DesignCategory {
  label: string;
  confidence: number;
}

export interface Metadata {
  width: number;
  height: number;
  aspectRatio: string;
  aspectDecimal: number;
  orientation: "portrait" | "landscape" | "square";
  fileName: string;
  fileSize: number;
  mimeType: string;
  megapixels: number;
  designType: DesignCategory;
  categories: DesignCategory[];
  dominantTone: "dark" | "light" | "mid";
  colorfulness: number;
  edgeDensity: number;
}

export interface DnaScore {
  score: number;
  checks: { label: string; score: number; note: string }[];
}

export interface DesignDNA {
  overall: number;
  typography: DnaScore;
  color: DnaScore;
  layout: DnaScore;
}

export type EngineId = "local" | "ocr" | "openai" | "gemini" | "claude" | "vision-service";

export interface EngineRun {
  id: EngineId;
  label: string;
  status: "ok" | "skipped" | "error";
  durationMs: number;
  note?: string;
}

export interface AnalysisResult {
  version: 1;
  createdAt: string;
  engines: EngineRun[];
  metadata: Metadata;
  texts: TextElement[];
  objects: DetectedObject[];
  backgrounds: BackgroundLayer[];
  palette: PaletteColor[];
  gradients: GradientValue[];
  layout: LayoutAnalysis;
  dna: DesignDNA;
}

// ---------------------------------------------------------------------------
// Reconstruction scene graph (editable)

export type SceneLayerType = "background" | "image" | "text" | "shape";

interface BaseLayer {
  id: string;
  name: string;
  type: SceneLayerType;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
  visible: boolean;
  locked: boolean;
  /** Link back to the analysis element it came from. */
  sourceId?: string;
}

interface RasterLayer<T extends "image" | "background"> extends BaseLayer {
  type: T;
  src: string;
  fit: "cover" | "contain" | "fill";
  tint?: string;
}

export type ImageLayer = RasterLayer<"image"> | RasterLayer<"background">;

export interface TextLayer extends BaseLayer {
  type: "text";
  text: string;
  color: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  letterSpacing: number;
  lineHeight: number;
  align: "left" | "center" | "right";
  uppercase: boolean;
}

export interface ShapeLayer extends BaseLayer {
  type: "shape";
  fill: string;
  radius: number;
}

export type SceneLayer = ImageLayer | TextLayer | ShapeLayer;

export interface Scene {
  width: number;
  height: number;
  background: string;
  /** Bottom → top. */
  layers: SceneLayer[];
}

export interface Project {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  original: string;
  thumbnail: string;
  analysis: AnalysisResult;
  scene: Scene;
  starred?: boolean;
}

export type ProjectSummary = Pick<
  Project,
  "id" | "name" | "createdAt" | "updatedAt" | "thumbnail" | "starred"
> & {
  designType: string;
  confidence: number;
  width: number;
  height: number;
  counts: { texts: number; objects: number; colors: number; layers: number };
  dnaOverall: number;
};
