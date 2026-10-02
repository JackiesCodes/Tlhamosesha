"use client";
import { useState } from "react";
import { ChevronDown, Download, Loader2, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { assetsZip, EXPORT_FORMATS, exportProject, type ExportFormat } from "@/lib/export";
import { useApp } from "@/lib/store/app";
import type { Project } from "@/lib/types";
import { downloadBlob } from "@/lib/utils";

export function ExportMenu({ project, compact }: { project: Project; compact?: boolean }) {
  const [busy, setBusy] = useState<string | null>(null);
  const logExport = useApp((s) => s.logExport);

  const run = async (format: ExportFormat | "assets-zip") => {
    setBusy(format);
    try {
      if (format === "assets-zip") {
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
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" disabled={!!busy}>
          {busy ? <Loader2 className="animate-spin" /> : <Download />}
          {!compact && "Export"}
          <ChevronDown className="opacity-70" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel>Export reconstruction</DropdownMenuLabel>
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
  );
}
