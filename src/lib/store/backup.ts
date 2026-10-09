"use client";
// Backup / restore for projects. Projects live only in this browser's
// IndexedDB, so a portable file is the user's safety net.
import type { Project } from "../types";
import { allProjects, putProject } from "./db";

export const BACKUP_FORMAT = "decon-backup";
const BACKUP_VERSION = 1;

interface BackupFile {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: string;
  projects: Project[];
}

export async function createBackup(): Promise<{ blob: Blob; count: number }> {
  const projects = await allProjects();
  const file: BackupFile = { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: new Date().toISOString(), projects };
  return { blob: new Blob([JSON.stringify(file)], { type: "application/json" }), count: projects.length };
}

function isProject(p: unknown): p is Project {
  const x = p as Project;
  return (
    !!x &&
    typeof x.id === "string" &&
    typeof x.name === "string" &&
    typeof x.original === "string" &&
    x.original.startsWith("data:image/") &&
    !!x.analysis?.metadata &&
    Array.isArray(x.analysis?.objects) &&
    Array.isArray(x.scene?.layers)
  );
}

/** Restores projects from a backup file. Existing projects with the same id are replaced. */
export async function restoreBackup(file: File): Promise<{ restored: number; skipped: number }> {
  let data: Partial<BackupFile>;
  try {
    data = JSON.parse(await file.text());
  } catch {
    throw new Error("That file isn't a Decon backup (it couldn't be read as JSON).");
  }
  if (data.format !== BACKUP_FORMAT || !Array.isArray(data.projects)) throw new Error("That file isn't a Decon backup.");
  if ((data.version ?? 0) > BACKUP_VERSION) throw new Error("This backup was made by a newer version of Decon.");
  let restored = 0;
  let skipped = 0;
  for (const p of data.projects) {
    if (!isProject(p)) {
      skipped++;
      continue;
    }
    await putProject(p);
    restored++;
  }
  return { restored, skipped };
}

export interface StorageInfo {
  usage: number | null;
  quota: number | null;
  persisted: boolean | null;
}

export async function storageInfo(): Promise<StorageInfo> {
  const s = typeof navigator !== "undefined" ? navigator.storage : undefined;
  if (!s?.estimate) return { usage: null, quota: null, persisted: null };
  const [est, persisted] = await Promise.all([s.estimate(), s.persisted?.() ?? Promise.resolve(null)]);
  return { usage: est.usage ?? null, quota: est.quota ?? null, persisted };
}

/** Asks the browser not to evict our data under storage pressure. */
export async function requestPersistence(): Promise<boolean> {
  try {
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}
