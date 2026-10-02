"use client";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { CornerDownLeft, FolderKanban, Image as ImageIcon, Layers, Search, Sparkles, Type } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Kbd } from "@/components/ui/kbd";
import { SEARCH_SUGGESTIONS, smartSearch, type SearchHit } from "@/lib/search";
import { useLibrary } from "@/lib/store/app";
import { useEditor } from "@/lib/store/editor";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "./nav-items";

export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [q, setQ] = useState("");
  const [cursor, setCursor] = useState(0);
  const router = useRouter();
  const pathname = usePathname();
  const project = useEditor((s) => s.project);
  const inProject = !!project && pathname.startsWith("/projects/");
  const summaries = useLibrary((s) => s.summaries);

  useEffect(() => {
    if (!open) {
      setQ("");
      setCursor(0);
    }
  }, [open]);

  const result = useMemo(() => (inProject && q ? smartSearch(project!, q) : null), [inProject, project, q]);
  const projectHits = useMemo(() => {
    if (inProject) return [];
    const s = q.toLowerCase();
    return summaries.filter((p) => !s || p.name.toLowerCase().includes(s) || p.designType.toLowerCase().includes(s)).slice(0, 6);
  }, [inProject, q, summaries]);
  const navHits = useMemo(() => NAV_ITEMS.filter((n) => q && n.label.toLowerCase().includes(q.toLowerCase())), [q]);

  const choose = (hit: SearchHit) => {
    const ed = useEditor.getState();
    if (result?.tab) ed.setTab(result.tab);
    if (hit.type === "layer") ed.select(hit.id);
    else if (hit.type === "text" || hit.type === "object") {
      const layer = ed.project?.scene.layers.find((l) => l.sourceId === hit.id);
      if (layer) ed.select(layer.id);
    }
    ed.highlight((result?.hits ?? []).map((h) => h.id));
    onOpenChange(false);
  };

  const count = (result?.hits.length ?? 0) + projectHits.length + navHits.length;
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => Math.min(count - 1, c + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => Math.max(0, c - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const hits = result?.hits ?? [];
      if (cursor < hits.length) choose(hits[cursor]);
      else if (cursor - hits.length < projectHits.length) {
        router.push(`/projects/${projectHits[cursor - hits.length].id}`);
        onOpenChange(false);
      } else {
        const n = navHits[cursor - hits.length - projectHits.length];
        if (n) {
          router.push(n.href);
          onOpenChange(false);
        }
      }
    }
  };

  const icon = (h: SearchHit) =>
    h.type === "color" ? (
      <span className="h-6 w-6 rounded-md border border-white/10" style={{ background: h.hex }} />
    ) : (h.type === "object" || h.type === "background") && h.image ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={h.image} alt="" className="checkerboard h-8 w-8 rounded-md object-contain" />
    ) : h.type === "text" ? (
      <Type className="h-4 w-4 text-sky-300" />
    ) : h.type === "layer" ? (
      <Layers className="h-4 w-4 text-violet-300" />
    ) : (
      <ImageIcon className="h-4 w-4 text-emerald-300" />
    );

  let idx = -1;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl p-0" hideClose>
        <DialogTitle className="sr-only">Smart Search</DialogTitle>
        <div className="flex items-center gap-3 border-b border-white/[0.06] px-5">
          <Sparkles className="h-4 w-4 text-brand" />
          <input
            autoFocus
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setCursor(0);
            }}
            onKeyDown={onKey}
            placeholder={inProject ? "Ask the breakdown… “Show sponsor logos”" : "Search projects, pages and commands…"}
            className="h-14 flex-1 bg-transparent text-[15px] text-white outline-none placeholder:text-slate-500"
          />
          <Kbd>esc</Kbd>
        </div>

        <div className="scrollbar-thin max-h-[60vh] overflow-y-auto p-2">
          {!q && (
            <div className="p-3">
              <div className="panel-title mb-3">{inProject ? "Try asking" : "Smart Search works inside a project"}</div>
              <div className="flex flex-wrap gap-2">
                {SEARCH_SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => setQ(s)}
                    className="rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-xs text-slate-300 transition hover:border-brand/40 hover:text-white"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {result && (
            <div className="p-1">
              <div className="panel-title flex items-center justify-between px-3 py-2">
                <span>{result.intent}</span>
                <span>{result.hits.length} result{result.hits.length === 1 ? "" : "s"}</span>
              </div>
              {result.hits.length === 0 && <p className="px-3 py-6 text-center text-sm text-muted-foreground">Nothing matched in this poster.</p>}
              {result.hits.map((h) => {
                idx++;
                const i = idx;
                return (
                  <button
                    key={h.type + h.id}
                    onMouseEnter={() => setCursor(i)}
                    onClick={() => choose(h)}
                    className={cn("flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition", cursor === i && "bg-white/[0.06]")}
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.04]">{icon(h)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-white">{h.title}</span>
                      <span className="block truncate text-xs capitalize text-muted-foreground">{h.subtitle}</span>
                    </span>
                    {cursor === i && <CornerDownLeft className="h-4 w-4 text-muted-foreground" />}
                  </button>
                );
              })}
            </div>
          )}

          {projectHits.length > 0 && (
            <div className="p-1">
              <div className="panel-title px-3 py-2">Projects</div>
              {projectHits.map((p) => {
                idx++;
                const i = idx;
                return (
                  <button
                    key={p.id}
                    onMouseEnter={() => setCursor(i)}
                    onClick={() => {
                      router.push(`/projects/${p.id}`);
                      onOpenChange(false);
                    }}
                    className={cn("flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left", cursor === i && "bg-white/[0.06]")}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.thumbnail} alt="" className="h-9 w-9 rounded-lg object-cover" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-white">{p.name}</span>
                      <span className="block text-xs text-muted-foreground">{p.designType}</span>
                    </span>
                    <FolderKanban className="h-4 w-4 text-muted-foreground" />
                  </button>
                );
              })}
            </div>
          )}

          {navHits.length > 0 && (
            <div className="p-1">
              <div className="panel-title px-3 py-2">Go to</div>
              {navHits.map((n) => {
                idx++;
                const i = idx;
                return (
                  <button
                    key={n.href}
                    onMouseEnter={() => setCursor(i)}
                    onClick={() => {
                      router.push(n.href);
                      onOpenChange(false);
                    }}
                    className={cn("flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm", cursor === i && "bg-white/[0.06]")}
                  >
                    <n.icon className="h-4 w-4 text-muted-foreground" /> {n.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <div className="flex items-center justify-between border-t border-white/[0.06] px-5 py-3 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-2">
            <Search className="h-3.5 w-3.5" /> Smart Search understands objects, colours, text roles and layers
          </span>
          <span className="hidden items-center gap-1 sm:flex">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd> navigate <Kbd>↵</Kbd> select
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
}

