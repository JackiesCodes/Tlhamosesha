"use client";
import { useState } from "react";
import { Captions, ChevronDown, Clapperboard, Download, Film, Loader2, Package, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { assetsZip, EXPORT_FORMATS, exportProject, videoCaptions, videoLayersZip, type ExportFormat } from "@/lib/export";
import { useApp } from "@/lib/store/app";
import type { Project } from "@/lib/types";
import { downloadBlob } from "@/lib/utils";
import { exportLottie } from "@/lib/video/lottie";
import { VideoExportDialog } from "./video-export-dialog";

export function ExportMenu({ project, compact }: { project: Project; compact?: boolean }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [videoOpen, setVideoOpen] = useState(false);
  const logExport = useApp((s) => s.logExport);

  const run = async (format: ExportFormat | "assets-zip" | "video-layers" | "captions-srt" | "captions-vtt" | "lottie") => {
    setBusy(format);
    try {
      if (format === "lottie") {
        const blob = await exportLottie(project);
        const fileName = `${project.name.replace(/\W+/g, "-").toLowerCase()}-lottie.json`;
        downloadBlob(blob, fileName);
        logExport({ projectId: project.id, projectName: project.name, format, fileName, size: blob.size });
      } else if (format === "captions-srt" || format === "captions-vtt") {
        const ext = format === "captions-srt" ? "srt" : "vtt";
        const blob = videoCaptions(project, ext);
        const fileName = `${project.name.replace(/\W+/g, "-").toLowerCase()}.${ext}`;
        downloadBlob(blob, fileName);
        logExport({ projectId: project.id, projectName: project.name, format, fileName, size: blob.size });
      } else if (format === "video-layers") {
        const blob = await videoLayersZip(project);
        const fileName = `${project.name.replace(/\W+/g, "-").toLowerCase()}-video-layers.zip`;
        downloadBlob(blob, fileName);
        logExport({ projectId: project.id, projectName: project.name, format, fileName, size: blob.size });
      } else if (format === "assets-zip") {
        const blob = await assetsZip(project);
        const fileName = `${project.name.replace(/\W+/g, "-").toLowerCase()}-assets.zip`;
        downloadBlob(blob, fileName);
        logExport({ projectId: project.id, projectName: project.name, format, fileName, size: blob.size });
      } else {
        const { blob, fileName } = await exportProject(project, format);
        downloadBlob(blob, fileName);
        logExport({ projectId: project.id, projectName: project.name, format, fileName, size: blob.size });
      }
    } catch (e) {
      alert(`Export failed: ${e instanceof Error ? e.message : e}`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      {project.video && <VideoExportDialog project={project} open={videoOpen} onOpenChange={setVideoOpen} />}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" disabled={!!busy}>
            {busy ? <Loader2 className="animate-spin" /> : <Download />}
            {!compact && "Export"}
            <ChevronDown className="opacity-70" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72">
          {project.video && (
            <>
              <DropdownMenuLabel>Whole video</DropdownMenuLabel>
              <DropdownMenuItem onSelect={() => setVideoOpen(true)}>
                <Clapperboard /> Rebuilt video (.mp4 / .webm)
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => run("lottie")}>
                <Sparkles /> Lottie animation (.json)
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => run("video-layers")}>
                <Film /> Layers pack: every scene, with timeline (.zip)
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => run("captions-srt")}>
                <Captions /> On-screen text as captions (.srt)
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => run("captions-vtt")}>
                <Captions /> On-screen text as captions (.vtt)
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          )}
          <DropdownMenuLabel>{project.video ? `Scene ${project.video.active + 1}` : "Export reconstruction"}</DropdownMenuLabel>
          {EXPORT_FORMATS.map((f) => (
            <DropdownMenuItem key={f.id} onSelect={() => run(f.id)}>
              <span className="w-24 font-mono text-xs font-semibold text-brand">{f.label}</span>
              <span className="text-xs text-muted-foreground">{f.description}</span>
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => run("assets-zip")}>
            <Package /> All extracted assets (.zip)
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
