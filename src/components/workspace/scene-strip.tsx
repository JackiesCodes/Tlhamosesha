"use client";
// Video projects: one card per scene; picking one opens it in the workspace.
import { Film } from "lucide-react";
import { useEditor } from "@/lib/store/editor";
import type { Project } from "@/lib/types";
import { cn } from "@/lib/utils";
import { formatTime } from "@/lib/video/project";

export function SceneStrip({ project }: { project: Project }) {
  const switchScene = useEditor((s) => s.switchScene);
  const video = project.video;
  if (!video) return null;
  return (
    <nav aria-label="Scenes" className="mt-4">
      <ol className="scrollbar-thin flex gap-2 overflow-x-auto pb-1">
        {video.scenes.map((s, i) => {
          const active = i === video.active;
          const layers = (active ? project.scene : s.scene).layers.length;
          return (
            <li key={i} className="shrink-0">
              <button
                onClick={() => switchScene(i)}
                aria-current={active ? "true" : undefined}
                className={cn(
                  "flex w-40 flex-col gap-1.5 rounded-xl border p-1.5 text-left transition",
                  active ? "border-brand bg-brand/[0.06]" : "border-white/[0.08] hover:border-white/20",
                )}
              >
                <span className="relative block aspect-video overflow-hidden rounded-lg bg-surface-sunken">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={s.thumbnail} alt="" className="h-full w-full object-contain" />
                  {s.transition && (
                    <span className="absolute left-1 top-1 rounded bg-ink/80 px-1.5 py-0.5 text-[10px] font-medium text-white">
                      {s.transition === "fade" ? "Crossfade" : "Cut"}
                    </span>
                  )}
                </span>
                <span className="flex items-baseline justify-between gap-2 px-1 text-xs">
                  <span className={cn("font-medium", active ? "text-white" : "text-white/80")}>Scene {i + 1}</span>
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {formatTime(s.start)}–{formatTime(s.end)}
                  </span>
                </span>
                <span className="px-1 pb-0.5 text-[11px] text-muted-foreground">{layers} layers</span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export function VideoBadge({ project }: { project: Project }) {
  if (!project.video) return null;
  return (
    <span className="flex items-center gap-1">
      <Film className="h-3 w-3" /> Video · {formatTime(project.video.duration)} · {project.video.scenes.length} scenes · showing scene {project.video.active + 1}
    </span>
  );
}
