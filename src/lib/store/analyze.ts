"use client";
// Runs the vision pipeline (or the video breakdown) and tracks its progress for the upload experience.
import { create } from "zustand";
import type { Project } from "../types";
import { uid } from "../utils";
import { analyzeVideo, VIDEO_STEPS } from "../video/analyze";
import { withLayerTimings } from "../video/project";
import { PIPELINE_STEPS, runPipeline } from "../vision/pipeline";
import { useApp, useLibrary } from "./app";
import { storageErrorMessage } from "./db";

export interface AnalysisInput {
  /** Data URL for images; object URL for videos (too large to hold as text). */
  src: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
}

type StepState = { status: "pending" | "active" | "done" | "skipped" | "error"; note?: string; progress?: number };
export type Step = { id: string; label: string };

const VIDEO_FLOW: Step[] = [...VIDEO_STEPS, { id: "save", label: "Saving project" }];

interface AnalyzeState {
  input: AnalysisInput | null;
  running: boolean;
  /** The steps for the current input (an image and a video go through different ones). */
  stepList: Step[];
  steps: Record<string, StepState>;
  error: string | null;
  resultId: string | null;
  setInput: (i: AnalysisInput | null) => void;
  start: () => Promise<string | null>;
  reset: () => void;
}

export const isVideo = (i: Pick<AnalysisInput, "mimeType"> | null | undefined) => !!i?.mimeType.startsWith("video/");
const flowFor = (i: AnalysisInput | null): Step[] => (isVideo(i) ? VIDEO_FLOW : [...PIPELINE_STEPS]);
const freshSteps = (list: Step[]) => Object.fromEntries(list.map((s) => [s.id, { status: "pending" }])) as Record<string, StepState>;
const titleFrom = (fileName: string, fallback: string) =>
  fileName.replace(/\.[a-z0-9]+$/i, "").replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) || fallback;

export const useAnalyze = create<AnalyzeState>()((set, get) => {
  const onStep = (id: string, status: StepState["status"], note?: string) =>
    set((s) => ({ steps: { ...s.steps, [id]: { ...s.steps[id], status, note } } }));
  const onProgress = (id: string, progress: number, note?: string) =>
    set((s) => ({ steps: { ...s.steps, [id]: { ...s.steps[id], progress, note: note ?? s.steps[id]?.note } } }));
  const dropInput = (i: AnalysisInput | null) => {
    if (i && i.src.startsWith("blob:")) URL.revokeObjectURL(i.src);
  };

  return {
    input: null,
    running: false,
    stepList: [...PIPELINE_STEPS],
    steps: freshSteps([...PIPELINE_STEPS]),
    error: null,
    resultId: null,
    setInput: (input) => {
      if (get().input !== input) dropInput(get().input);
      const stepList = flowFor(input);
      set({ input, stepList, steps: freshSteps(stepList), error: null, resultId: null });
    },
    reset: () => {
      dropInput(get().input);
      set({ input: null, running: false, stepList: [...PIPELINE_STEPS], steps: freshSteps([...PIPELINE_STEPS]), error: null, resultId: null });
    },
    start: async () => {
      const input = get().input;
      if (!input || get().running) return null;
      set({ running: true, steps: freshSteps(get().stepList), error: null, resultId: null });
      const { settings, notify } = useApp.getState();
      try {
        const now = new Date().toISOString();
        let project: Project;
        let summary: string;
        if (isVideo(input)) {
          const out = await analyzeVideo(input.src, input.fileName, {
            ocr: settings.ocr,
            ocrInvertPass: settings.ocrInvertPass,
            sensitivity: settings.sensitivity,
            maxObjects: settings.maxObjects,
            onStep,
            onProgress,
          });
          onStep("save", "active");
          const first = out.scenes[0];
          project = withLayerTimings({
            id: uid("prj"),
            name: titleFrom(input.fileName, "Untitled video"),
            createdAt: now,
            updatedAt: now,
            original: first.original,
            thumbnail: first.thumbnail,
            analysis: first.analysis,
            scene: first.scene,
            video: {
              fileName: input.fileName,
              fileSize: input.fileSize,
              mimeType: input.mimeType,
              width: out.width,
              height: out.height,
              duration: out.duration,
              active: 0,
              scenes: out.scenes,
            },
          });
          const layers = out.scenes.reduce((n, s) => n + s.scene.layers.length, 0);
          summary = `${out.scenes.length} scene${out.scenes.length === 1 ? "" : "s"}, ${layers} layers.`;
        } else {
          const out = await runPipeline(input.src, {
            fileName: input.fileName,
            fileSize: input.fileSize,
            mimeType: input.mimeType,
            ocr: settings.ocr,
            ocrInvertPass: settings.ocrInvertPass,
            cloud: settings.cloud,
            sensitivity: settings.sensitivity,
            maxObjects: settings.maxObjects,
            onStep,
            onProgress,
          });
          project = {
            id: uid("prj"),
            name: titleFrom(input.fileName, "Untitled poster"),
            createdAt: now,
            updatedAt: now,
            original: out.original,
            thumbnail: out.thumbnail,
            analysis: out.analysis,
            scene: out.scene,
          };
          summary = `${out.analysis.metadata.designType.label} — ${out.analysis.objects.length} objects, ${out.analysis.texts.length} text layers.`;
        }
        await useLibrary.getState().save(project);
        if (isVideo(input)) onStep("save", "done");
        notify({ title: "Breakdown complete", body: `${project.name}: ${summary}`, href: `/projects/${project.id}` });
        set({ running: false, resultId: project.id });
        return project.id;
      } catch (e) {
        const msg = storageErrorMessage(e);
        set({ running: false, error: msg });
        notify({ title: "Breakdown failed", body: msg });
        return null;
      }
    },
  };
});

export async function fileToInput(file: File): Promise<AnalysisInput> {
  if (file.type.startsWith("video/"))
    return { src: URL.createObjectURL(file), fileName: file.name, fileSize: file.size, mimeType: file.type };
  const src = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
  return { src, fileName: file.name, fileSize: file.size, mimeType: file.type || "image/png" };
}

export async function urlToInput(url: string, fileName: string): Promise<AnalysisInput> {
  const blob = await fetch(url).then((r) => r.blob());
  const src = await new Promise<string>((resolve) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.readAsDataURL(blob);
  });
  return { src, fileName, fileSize: blob.size, mimeType: blob.type || "image/svg+xml" };
}
