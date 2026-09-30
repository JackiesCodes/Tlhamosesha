"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Download, FileDown, Package, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { assetsZip, exportProject, type ExportFormat } from "@/lib/export";
import { useApp } from "@/lib/store/app";
import { allProjects, getProject } from "@/lib/store/db";
import type { DetectedObject, Project } from "@/lib/types";
import { downloadBlob, downloadDataUrl, formatBytes, timeAgo } from "@/lib/utils";

export default function DownloadsPage() {
  const { exports, clearExports, logExport } = useApp();
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [kind, setKind] = useState("all");

  useEffect(() => {
    allProjects().then(setProjects);
  }, []);

  const assets = useMemo(
    () =>
      (projects ?? []).flatMap((p) =>
        p.analysis.objects.filter((o) => o.cutout).map((o) => ({ o, project: p })),
      ),
    [projects],
  );
  const kinds = ["all", ...new Set(assets.map((a) => a.o.kind))];
  const shown = assets.filter((a) => kind === "all" || a.o.kind === kind);

  const redownload = async (projectId: string, format: string) => {
    const p = await getProject(projectId);
    if (!p) return alert("That project no longer exists.");
    if (format === "assets-zip") downloadBlob(await assetsZip(p), `${p.name}-assets.zip`);
    else if (format !== "asset") {
      const { blob, fileName } = await exportProject(p, format as ExportFormat);
      downloadBlob(blob, fileName);
    }
  };

  const saveAsset = (o: DetectedObject, p: Project) => {
    const fileName = `${o.label.replace(/\W+/g, "-").toLowerCase()}.png`;
    downloadDataUrl(o.cutout!, fileName);
    logExport({ projectId: p.id, projectName: p.name, format: "asset", fileName, size: Math.round(o.cutout!.length * 0.75) });
  };

  return (
    <div className="mx-auto max-w-[1400px] space-y-6 px-4 py-8 sm:px-8">
      <PageHeader eyebrow="Downloads" title="Exports & asset library" description="Everything you have exported, plus every transparent asset extracted across your projects." />

      <Tabs defaultValue="assets">
        <TabsList>
          <TabsTrigger value="assets">
            <Package /> Asset library
          </TabsTrigger>
          <TabsTrigger value="history">
            <FileDown /> Export history
          </TabsTrigger>
        </TabsList>

        <TabsContent value="assets" className="mt-6 space-y-4">
          <div className="scrollbar-thin flex gap-1.5 overflow-x-auto">
            {kinds.map((k) => (
              <button
                key={k}
                onClick={() => setKind(k)}
                className={`whitespace-nowrap rounded-full border px-3 py-1.5 text-xs capitalize transition ${kind === k ? "border-gold/50 bg-gold/10 text-gold-200" : "border-white/[0.08] text-muted-foreground hover:text-white"}`}
              >
                {k}
              </button>
            ))}
          </div>
          {projects && shown.length === 0 && (
            <div className="panel px-6 py-14 text-center text-sm text-muted-foreground">
              No assets yet — <Link href="/upload" className="text-gold hover:underline">break down a poster</Link> to build your library.
            </div>
          )}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
            {shown.map(({ o, project }, i) => (
              <motion.div
                key={o.id}
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: Math.min(i * 0.02, 0.3) }}
                className="group overflow-hidden rounded-2xl border border-white/[0.06] bg-surface/70"
              >
                <div className="checkerboard relative flex aspect-square items-center justify-center p-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={o.cutout} alt={o.label} className="max-h-full max-w-full object-contain" />
                  <button
                    onClick={() => saveAsset(o, project)}
                    className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-lg bg-ink/80 text-white opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100"
                    aria-label="Download PNG"
                  >
                    <Download className="h-4 w-4" />
                  </button>
                </div>
                <div className="p-3">
                  <div className="truncate text-sm text-white">{o.label}</div>
                  <Link href={`/projects/${project.id}`} className="block truncate text-[11px] text-muted-foreground hover:text-gold">
                    {project.name}
                  </Link>
                </div>
              </motion.div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="history" className="mt-6">
          <div className="panel overflow-hidden">
            <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-3">
              <span className="text-sm text-muted-foreground">{exports.length} exports</span>
              {exports.length > 0 && (
                <Button variant="ghost" size="sm" onClick={clearExports}>
                  <Trash2 /> Clear history
                </Button>
              )}
            </div>
            {exports.length === 0 ? (
              <p className="px-5 py-14 text-center text-sm text-muted-foreground">Exports from the workspace will appear here.</p>
            ) : (
              <div className="divide-y divide-white/[0.05]">
                {exports.map((e) => (
                  <div key={e.id} className="flex items-center gap-4 px-5 py-3">
                    <Badge variant="secondary" className="w-24 justify-center uppercase">{e.format}</Badge>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm text-white">{e.fileName}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        {e.projectName} · {formatBytes(e.size)} · {timeAgo(e.at)}
                      </div>
                    </div>
                    {e.format !== "asset" && (
                      <Button variant="ghost" size="sm" onClick={() => redownload(e.projectId, e.format)}>
                        <Download /> <span className="hidden sm:inline">Download again</span>
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
