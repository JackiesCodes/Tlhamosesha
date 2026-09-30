"use client";
// Runs the vision pipeline and tracks its progress for the upload experience.
import { create } from "zustand";
import type { Project } from "../types";
import { uid } from "../utils";
import { PIPELINE_STEPS, runPipeline, type StepId } from "../vision/pipeline";
import { useApp, useLibrary } from "./app";

export interface AnalysisInput {
  src: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
}

type StepState = { status: "pending" | "active" | "done" | "skipped" | "error"; note?: string; progress?: number };

interface AnalyzeState {
  input: AnalysisInput | null;
  running: boolean;
  steps: Record<StepId, StepState>;
  error: string | null;
  resultId: string | null;
  setInput: (i: AnalysisInput | null) => void;
  start: () => Promise<string | null>;
  reset: () => void;
}

const freshSteps = () =>
  Object.fromEntries(PIPELINE_STEPS.map((s) => [s.id, { status: "pending" }])) as Record<StepId, StepState>;

export const useAnalyze = create<AnalyzeState>()((set, get) => ({
  input: null,
  running: false,
  steps: freshSteps(),
  error: null,
  resultId: null,
  setInput: (input) => set({ input, steps: freshSteps(), error: null, resultId: null }),
  reset: () => set({ input: null, running: false, steps: freshSteps(), error: null, resultId: null }),
  start: async () => {
    const input = get().input;
    if (!input || get().running) return null;
    set({ running: true, steps: freshSteps(), error: null, resultId: null });
    const { settings, notify } = useApp.getState();
    try {
      const out = await runPipeline(input.src, {
        fileName: input.fileName,
        fileSize: input.fileSize,
        mimeType: input.mimeType,
        ocr: settings.ocr,
        ocrInvertPass: settings.ocrInvertPass,
        cloud: settings.cloud,
        sensitivity: settings.sensitivity,
        maxObjects: settings.maxObjects,
        onStep: (id, status, note) => set((s) => ({ steps: { ...s.steps, [id]: { ...s.steps[id], status, note } } })),
        onProgress: (id, progress, note) =>
          set((s) => ({ steps: { ...s.steps, [id]: { ...s.steps[id], progress, note: note ?? s.steps[id].note } } })),
      });
      const now = new Date().toISOString();
      const project: Project = {
        id: uid("prj"),
        name: input.fileName.replace(/\.[a-z0-9]+$/i, "").replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) || "Untitled poster",
        createdAt: now,
        updatedAt: now,
        original: out.original,
        thumbnail: out.thumbnail,
        analysis: out.analysis,
        scene: out.scene,
      };
      await useLibrary.getState().save(project);
      notify({
        title: "Breakdown complete",
        body: `${project.name}: ${out.analysis.metadata.designType.label} — ${out.analysis.objects.length} objects, ${out.analysis.texts.length} text layers.`,
        href: `/projects/${project.id}`,
      });
      set({ running: false, resultId: project.id });
      return project.id;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Analysis failed";
      set({ running: false, error: msg });
      notify({ title: "Breakdown failed", body: msg });
      return null;
    }
  },
}));

export async function fileToInput(file: File): Promise<AnalysisInput> {
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
