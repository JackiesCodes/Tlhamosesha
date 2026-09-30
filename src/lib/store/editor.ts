"use client";
// Workspace editor state: current project, selection, undo/redo history.
import { create } from "zustand";
import type { Project, Scene, SceneLayer } from "../types";

export type PreviewMode = "split" | "overlay" | "difference";
export type WorkspaceTab = "elements" | "layers" | "typography" | "colors" | "layout" | "metadata" | "dna";
export type WorkspaceMode = "breakdown" | "reconstruct";

interface EditorState {
  project: Project | null;
  selectedId: string | null;
  highlightIds: string[];
  past: Scene[];
  future: Scene[];
  previewMode: PreviewMode;
  tab: WorkspaceTab;
  mode: WorkspaceMode;
  dirty: boolean;
  setTab: (t: WorkspaceTab) => void;
  setMode: (m: WorkspaceMode) => void;
  load: (p: Project) => void;
  select: (id: string | null) => void;
  highlight: (ids: string[]) => void;
  setPreviewMode: (m: PreviewMode) => void;
  updateLayer: (id: string, patch: Partial<SceneLayer>, opts?: { commit?: boolean }) => void;
  commit: () => void;
  reorder: (id: string, dir: "up" | "down" | "top" | "bottom") => void;
  removeLayer: (id: string) => void;
  duplicateLayer: (id: string) => void;
  addLayer: (l: SceneLayer) => void;
  setScene: (s: Scene) => void;
  undo: () => void;
  redo: () => void;
  markSaved: () => void;
}

const snapshot = (s: Scene): Scene => ({ ...s, layers: s.layers.map((l) => ({ ...l })) });

export const useEditor = create<EditorState>()((set, get) => {
  const mutate = (fn: (s: Scene) => Scene, commit = true) => {
    const p = get().project;
    if (!p) return;
    const next = fn(snapshot(p.scene));
    set({
      project: { ...p, scene: next, updatedAt: new Date().toISOString() },
      past: commit ? [...get().past, snapshot(p.scene)].slice(-60) : get().past,
      future: commit ? [] : get().future,
      dirty: true,
    });
  };
  return {
    project: null,
    selectedId: null,
    highlightIds: [],
    past: [],
    future: [],
    previewMode: "split",
    tab: "elements",
    mode: "breakdown",
    dirty: false,
    setTab: (tab) => set({ tab }),
    setMode: (mode) => set({ mode }),
    load: (p) => set({ project: p, selectedId: null, highlightIds: [], past: [], future: [], dirty: false }),
    select: (id) => set({ selectedId: id }),
    highlight: (ids) => set({ highlightIds: ids }),
    setPreviewMode: (m) => set({ previewMode: m }),
    // Drag gestures call with commit:false on every move, then commit() once.
    updateLayer: (id, patch, opts) =>
      mutate(
        (s) => ({ ...s, layers: s.layers.map((l) => (l.id === id ? ({ ...l, ...patch } as SceneLayer) : l)) }),
        opts?.commit ?? true,
      ),
    commit: () => {
      const p = get().project;
      if (!p) return;
      set({ past: [...get().past, snapshot(p.scene)].slice(-60), future: [] });
    },
    reorder: (id, dir) =>
      mutate((s) => {
        const layers = [...s.layers];
        const i = layers.findIndex((l) => l.id === id);
        if (i < 0) return s;
        const [l] = layers.splice(i, 1);
        const floor = layers[0]?.type === "background" ? 1 : 0;
        const to =
          dir === "up" ? Math.min(layers.length, i + 1) : dir === "down" ? Math.max(floor, i - 1) : dir === "top" ? layers.length : floor;
        layers.splice(to, 0, l);
        return { ...s, layers };
      }),
    removeLayer: (id) => {
      mutate((s) => ({ ...s, layers: s.layers.filter((l) => l.id !== id) }));
      if (get().selectedId === id) set({ selectedId: null });
    },
    duplicateLayer: (id) =>
      mutate((s) => {
        const i = s.layers.findIndex((l) => l.id === id);
        if (i < 0) return s;
        const copy = { ...s.layers[i], id: `lyr_${crypto.randomUUID().slice(0, 8)}`, name: s.layers[i].name + " copy", x: s.layers[i].x + 16, y: s.layers[i].y + 16, locked: false };
        const layers = [...s.layers];
        layers.splice(i + 1, 0, copy as SceneLayer);
        return { ...s, layers };
      }),
    addLayer: (l) => {
      mutate((s) => ({ ...s, layers: [...s.layers, l] }));
      set({ selectedId: l.id });
    },
    setScene: (scene) => mutate(() => scene),
    undo: () => {
      const { past, project, future } = get();
      if (!past.length || !project) return;
      const prev = past[past.length - 1];
      set({ project: { ...project, scene: prev }, past: past.slice(0, -1), future: [snapshot(project.scene), ...future], dirty: true });
    },
    redo: () => {
      const { past, project, future } = get();
      if (!future.length || !project) return;
      set({ project: { ...project, scene: future[0] }, future: future.slice(1), past: [...past, snapshot(project.scene)], dirty: true });
    },
    markSaved: () => set({ dirty: false }),
  };
});
