// Browser persistence (IndexedDB) for projects, which carry large image payloads.
import { clear, createStore, del, get, set, values } from "idb-keyval";
import type { Project, ProjectSummary } from "../types";
import { syncedScenes } from "../video/project";

const isBrowser = typeof indexedDB !== "undefined";
// IndexedDB names predate the RevVisual rename; kept so saved projects survive.
const projectsStore = isBrowser ? createStore("tlhamosesha-projects", "projects") : undefined;
const summaryStore = isBrowser ? createStore("tlhamosesha-summaries", "summaries") : undefined;

const scenesOf = (p: Project) => (p.video ? syncedScenes(p) : [p]);

export function summarize(p: Project): ProjectSummary {
  return {
    id: p.id,
    name: p.name,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    thumbnail: p.thumbnail,
    starred: p.starred,
    video: p.video ? { duration: p.video.duration, scenes: p.video.scenes.length } : undefined,
    designType: p.analysis.metadata.designType.label,
    confidence: p.analysis.metadata.designType.confidence,
    width: p.analysis.metadata.width,
    height: p.analysis.metadata.height,
    // A video's counts cover all of its scenes.
    counts: {
      texts: scenesOf(p).reduce((n, s) => n + s.analysis.texts.length, 0),
      objects: scenesOf(p).reduce((n, s) => n + s.analysis.objects.length, 0),
      colors: p.analysis.palette.length,
      layers: scenesOf(p).reduce((n, s) => n + s.scene.layers.length, 0),
    },
    dnaOverall: p.analysis.dna.overall,
  };
}

/** Turns low-level storage failures into something a person can act on. */
export function storageErrorMessage(e: unknown) {
  const name = (e as { name?: string })?.name ?? "";
  if (name === "QuotaExceededError")
    return "Your browser is out of storage space for RevVisual. Delete some projects (or export a backup and clear them) and try again.";
  if (name === "InvalidStateError" || name === "SecurityError" || name === "UnknownError")
    return "Your browser blocked saving. Private or incognito windows, or strict privacy settings, can prevent RevVisual from storing projects.";
  return e instanceof Error ? e.message : "Something went wrong while saving.";
}

export async function putProject(p: Project) {
  if (!projectsStore || !summaryStore) throw new Error("This browser doesn't support saving projects (IndexedDB is unavailable).");
  await set(p.id, p, projectsStore);
  await set(p.id, summarize(p), summaryStore);
  // Optional server sync, off unless the operator enables a database
  // (NEXT_PUBLIC_SERVER_SYNC=1). By default nothing about a project leaves the browser.
  if (process.env.NEXT_PUBLIC_SERVER_SYNC === "1")
    fetch("/api/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      // Inline images stay in the browser; this keeps requests under serverless body limits (4.5 MB on Vercel).
      body: JSON.stringify({ id: p.id, name: p.name, analysis: p.analysis, scene: p.scene }, (_k, v) =>
        typeof v === "string" && v.startsWith("data:") ? `[inline:${Math.round(v.length / 1024)}KB]` : v,
      ),
    }).catch(() => undefined);
}

export async function getProject(id: string) {
  if (!projectsStore) return undefined;
  return get<Project>(id, projectsStore);
}

export async function removeProject(id: string) {
  if (!projectsStore) return;
  await del(id, projectsStore);
  await del(id, summaryStore);
}

export async function allProjects(): Promise<Project[]> {
  if (!projectsStore) return [];
  const list = await values<Project>(projectsStore);
  return list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function allSummaries(): Promise<ProjectSummary[]> {
  if (!summaryStore) return [];
  const list = await values<ProjectSummary>(summaryStore);
  return list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/** Removes every project and summary saved in this browser. */
export async function clearAllProjects() {
  if (!projectsStore || !summaryStore) return;
  await clear(projectsStore);
  await clear(summaryStore);
}
