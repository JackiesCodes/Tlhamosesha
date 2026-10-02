"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, Check, Cloud, Loader2, Monitor, PenTool, Redo2, ScanSearch, Undo2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { useLibrary } from "@/lib/store/app";
import { getProject } from "@/lib/store/db";
import { useEditor } from "@/lib/store/editor";
import { cn } from "@/lib/utils";
import { BreakdownTabs } from "./breakdown-tabs";
import { EditorView } from "./editor-view";
import { ExportMenu } from "./export-menu";
import { PreviewPanel } from "./preview-panel";

export function Workspace({ id }: { id: string }) {
  const params = useSearchParams();
  const { project, load, dirty, markSaved, undo, redo, past, future, mode, setMode, selectedId, removeLayer, updateLayer, select } = useEditor();
  const save = useLibrary((s) => s.save);
  const [state, setState] = useState<"loading" | "missing" | "ready">("loading");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    getProject(id).then((p) => {
      if (!alive) return;
      if (!p) return setState("missing");
      load(p);
      useEditor.setState({ tab: "elements", mode: params.get("mode") === "reconstruct" ? "reconstruct" : "breakdown", previewMode: "split" });
      setState("ready");
    });
    return () => {
      alive = false;
    };
  }, [id, load, params]);

  // Debounced autosave
  useEffect(() => {
    if (!dirty || !project) return;
    const t = setTimeout(async () => {
      setSaving(true);
      await save(project);
      markSaved();
      setSaving(false);
    }, 800);
    return () => clearTimeout(t);
  }, [dirty, project, save, markSaved]);

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName)) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
      } else if (selectedId && (e.key === "Delete" || e.key === "Backspace")) {
        const l = useEditor.getState().project?.scene.layers.find((x) => x.id === selectedId);
        if (l && !l.locked) removeLayer(selectedId);
      } else if (selectedId && e.key.startsWith("Arrow")) {
        const l = useEditor.getState().project?.scene.layers.find((x) => x.id === selectedId);
        if (!l || l.locked) return;
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
        const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
        updateLayer(selectedId, { x: l.x + dx, y: l.y + dy });
      } else if (e.key === "Escape") select(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId, undo, redo, removeLayer, updateLayer, select]);

  if (state === "loading")
    return (
      <div className="flex h-[70vh] items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin text-brand" /> Loading workspace…
      </div>
    );
  if (state === "missing" || !project)
    return (
      <div className="flex h-[70vh] flex-col items-center justify-center gap-3 text-center">
        <p className="font-medium text-white">Project not found</p>
        <p className="text-sm text-muted-foreground">It may have been deleted, or it was created in another browser.</p>
        <Button asChild variant="secondary">
          <Link href="/projects">Back to projects</Link>
        </Button>
      </div>
    );

  const m = project.analysis.metadata;
  const rename = (name: string) => useEditor.setState({ project: { ...project, name }, dirty: true });

  return (
    <div className="flex min-h-[calc(100dvh-4rem)] flex-col px-3 py-4 sm:px-6 lg:h-[calc(100dvh-4rem)]">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/projects" aria-label="Back to projects">
            <ArrowLeft />
          </Link>
        </Button>
        <div className="min-w-0 flex-1">
          <input
            value={project.name}
            onChange={(e) => rename(e.target.value)}
            className="w-full max-w-md truncate rounded-lg bg-transparent px-1 font-display text-base sm:text-lg font-bold text-white outline-none hover:bg-white/[0.03] focus:bg-white/[0.04]"
            aria-label="Project name"
          />
          <div className="flex flex-wrap items-center gap-2 px-1 text-xs text-muted-foreground">
            <Badge>
              {m.designType.label} — {Math.round(m.designType.confidence * 100)}%
            </Badge>
            <span>
              {m.width}×{m.height} · {m.aspectRatio}
            </span>
            <span className="flex items-center gap-1">
              {saving || dirty ? <Cloud className="h-3 w-3 animate-pulse" /> : <Check className="h-3 w-3 text-emerald-400" />}
              {saving || dirty ? "Saving…" : "Saved"}
            </span>
          </div>
        </div>

        <div className="hidden rounded-xl border border-white/[0.06] bg-surface-sunken/70 p-1 lg:flex">
          {(
            [
              { id: "breakdown", label: "Breakdown", icon: ScanSearch },
              { id: "reconstruct", label: "Reconstruct", icon: PenTool },
            ] as const
          ).map((x) => (
            <button
              key={x.id}
              onClick={() => setMode(x.id)}
              className={cn(
                "relative flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition",
                mode === x.id ? "text-ink" : "text-muted-foreground hover:text-white",
              )}
            >
              {mode === x.id && <motion.span layoutId="mode-pill" className="absolute inset-0 rounded-lg bg-brand-sheen" />}
              <x.icon className="relative h-3.5 w-3.5" />
              <span className="relative">{x.label}</span>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1">
          <Tooltip content="Undo (⌘Z)">
            <Button variant="ghost" size="icon" onClick={undo} disabled={!past.length} aria-label="Undo">
              <Undo2 />
            </Button>
          </Tooltip>
          <Tooltip content="Redo (⇧⌘Z)">
            <Button variant="ghost" size="icon" onClick={redo} disabled={!future.length} aria-label="Redo">
              <Redo2 />
            </Button>
          </Tooltip>
          <ExportMenu project={project} />
        </div>
      </div>

      {/* Body */}
      <div className="mt-4 min-h-0 flex-1">
        <AnimatePresence mode="wait">
          {mode === "reconstruct" ? (
            <motion.div key="rec" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="hidden h-full lg:block">
              <EditorView project={project} />
            </motion.div>
          ) : null}
        </AnimatePresence>

        <div className={cn("grid h-full min-h-0 gap-4 lg:grid-cols-[1fr_minmax(320px,400px)]", mode === "reconstruct" && "lg:hidden")}>
          {/* Mobile: preview first */}
          <div className="panel p-4 lg:hidden">
            <PreviewPanel project={project} />
            <div className="mt-4 flex items-start gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-xs text-muted-foreground">
              <Monitor className="mt-0.5 h-4 w-4 shrink-0" /> Open on a desktop to edit layers in the reconstruction editor. You can browse and download every asset here.
            </div>
          </div>

          <section className="panel scrollbar-thin min-h-0 overflow-y-auto p-4 sm:p-5">
            <BreakdownTabs project={project} />
          </section>

          <aside className="panel hidden min-h-0 flex-col p-4 lg:flex">
            <PreviewPanel project={project} className="flex-1" />
            <Button variant="outline" className="mt-4" onClick={() => setMode("reconstruct")}>
              <PenTool /> Edit reconstruction
            </Button>
          </aside>
        </div>
      </div>
    </div>
  );
}
