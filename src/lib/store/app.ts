"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ExportFormat } from "../export";
import type { Project, ProjectSummary } from "../types";
import { allSummaries, putProject, removeProject, summarize } from "./db";

export interface Settings {
  ocr: boolean;
  ocrInvertPass: boolean;
  cloud: boolean;
  sensitivity: number;
  maxObjects: number;
  workspace: string;
  displayName: string;
  reduceMotion: boolean;
}

export interface ExportRecord {
  id: string;
  projectId: string;
  projectName: string;
  format: ExportFormat | "assets-zip" | "asset";
  fileName: string;
  size: number;
  at: string;
}

export interface Notification {
  id: string;
  title: string;
  body: string;
  at: string;
  read: boolean;
  href?: string;
}

interface AppState {
  settings: Settings;
  setSettings: (s: Partial<Settings>) => void;
  exports: ExportRecord[];
  logExport: (e: Omit<ExportRecord, "id" | "at">) => void;
  clearExports: () => void;
  notifications: Notification[];
  notify: (n: Omit<Notification, "id" | "at" | "read">) => void;
  markAllRead: () => void;
  workspaces: string[];
}

export const useApp = create<AppState>()(
  persist(
    (set) => ({
      settings: {
        ocr: true,
        ocrInvertPass: true,
        cloud: true,
        sensitivity: 0.5,
        maxObjects: 14,
        workspace: "Personal Studio",
        displayName: "Studio Owner",
        reduceMotion: false,
      },
      setSettings: (s) => set((st) => ({ settings: { ...st.settings, ...s } })),
      exports: [],
      logExport: (e) =>
        set((st) => ({
          exports: [{ ...e, id: crypto.randomUUID(), at: new Date().toISOString() }, ...st.exports].slice(0, 200),
        })),
      clearExports: () => set({ exports: [] }),
      notifications: [
        {
          id: "welcome",
          title: "Welcome to Tlhamosesha AI",
          body: "Upload a poster or try a sample to see it broken down into layers.",
          at: new Date().toISOString(),
          read: false,
          href: "/upload",
        },
      ],
      notify: (n) =>
        set((st) => ({
          notifications: [{ ...n, id: crypto.randomUUID(), at: new Date().toISOString(), read: false }, ...st.notifications].slice(0, 30),
        })),
      markAllRead: () => set((st) => ({ notifications: st.notifications.map((n) => ({ ...n, read: true })) })),
      workspaces: ["Personal Studio", "Matchday Creative", "Brand Lab"],
    }),
    { name: "tlhamosesha-app", version: 1 },
  ),
);

interface LibraryState {
  loaded: boolean;
  summaries: ProjectSummary[];
  refresh: () => Promise<void>;
  save: (p: Project) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

export const useLibrary = create<LibraryState>()((set, get) => ({
  loaded: false,
  summaries: [],
  refresh: async () => {
    set({ summaries: await allSummaries(), loaded: true });
  },
  save: async (p) => {
    await putProject(p);
    const s = summarize(p);
    set({ summaries: [s, ...get().summaries.filter((x) => x.id !== p.id)].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)) });
  },
  remove: async (id) => {
    await removeProject(id);
    set({ summaries: get().summaries.filter((x) => x.id !== id) });
  },
}));
