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
  reduceMotion: boolean;
}

export interface ExportRecord {
  id: string;
  projectId: string;
  projectName: string;
  format: ExportFormat | "assets-zip" | "video-layers" | "asset";
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
  clearNotifications: () => void;
}

export const useApp = create<AppState>()(
  persist(
    (set) => ({
      settings: {
        ocr: true,
        ocrInvertPass: true,
        // Cloud vision is opt-in: by default images never leave the browser.
        cloud: false,
        sensitivity: 0.5,
        maxObjects: 14,
        reduceMotion: false,
      },
      setSettings: (s) => set((st) => ({ settings: { ...st.settings, ...s } })),
      exports: [],
      logExport: (e) =>
        set((st) => ({
          exports: [{ ...e, id: crypto.randomUUID(), at: new Date().toISOString() }, ...st.exports].slice(0, 200),
        })),
      clearExports: () => set({ exports: [] }),
      notifications: [],
      notify: (n) =>
        set((st) => ({
          notifications: [{ ...n, id: crypto.randomUUID(), at: new Date().toISOString(), read: false }, ...st.notifications].slice(0, 30),
        })),
      markAllRead: () => set((st) => ({ notifications: st.notifications.map((n) => ({ ...n, read: true })) })),
      clearNotifications: () => set({ notifications: [] }),
    }),
    {
      // Storage key predates the RevVisual rename; kept so saved settings survive.
      name: "tlhamosesha-app",
      version: 2,
      // v1 carried demo data (a fake profile, workspaces and a seeded welcome
      // notification). Drop it, keep the user's real settings and history.
      migrate: (persisted, version) => {
        const s = (persisted ?? {}) as Partial<AppState> & { workspaces?: unknown; settings?: Record<string, unknown> };
        if (version < 2) {
          delete s.workspaces;
          if (s.settings) {
            delete s.settings.workspace;
            delete s.settings.displayName;
            // Cloud vision became opt-in in v2.
            s.settings.cloud = false;
          }
          s.notifications = (s.notifications ?? []).filter((n) => n.id !== "welcome");
        }
        return s as AppState;
      },
    },
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
