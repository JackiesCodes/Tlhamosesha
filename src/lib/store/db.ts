// Browser persistence (IndexedDB) for projects, which carry large image payloads.
import { createStore, del, get, set, values } from "idb-keyval";
import type { Project, ProjectSummary } from "../types";

const isBrowser = typeof indexedDB !== "undefined";
const projectsStore = isBrowser ? createStore("tlhamosesha-projects", "projects") : undefined;
const summaryStore = isBrowser ? createStore("tlhamosesha-summaries", "summaries") : undefined;

export function summarize(p: Project): ProjectSummary {
  return {
    id: p.id,
    name: p.name,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    thumbnail: p.thumbnail,
    starred: p.starred,
    designType: p.analysis.metadata.designType.label,
    confidence: p.analysis.metadata.designType.confidence,
    width: p.analysis.metadata.width,
    height: p.analysis.metadata.height,
    counts: {
      texts: p.analysis.texts.length,
      objects: p.analysis.objects.length,
      colors: p.analysis.palette.length,
      layers: p.scene.layers.length,
    },
    dnaOverall: p.analysis.dna.overall,
  };
}

export async function putProject(p: Project) {
  if (!projectsStore) return;
  await set(p.id, p, projectsStore);
  await set(p.id, summarize(p), summaryStore);
  // Best-effort server sync (no-op when no database is configured).
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
