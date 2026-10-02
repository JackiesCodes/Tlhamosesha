"use client";
// Original vs reconstructed comparison: split slider, overlay and difference.
import { useRef, useState } from "react";
import { Columns2, Diff, Layers2 } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { useEditor, type PreviewMode } from "@/lib/store/editor";
import type { Box, Project } from "@/lib/types";
import { cn } from "@/lib/utils";
import { SceneView, useFitScale } from "./scene-view";

const MODES: { id: PreviewMode; label: string; icon: typeof Columns2 }[] = [
  { id: "split", label: "Split", icon: Columns2 },
  { id: "overlay", label: "Overlay", icon: Layers2 },
  { id: "difference", label: "Difference", icon: Diff },
];

export function PreviewPanel({ project, className }: { project: Project; className?: string }) {
  const { previewMode, setPreviewMode, highlightIds } = useEditor();
  const [split, setSplit] = useState(50);
  const [overlay, setOverlay] = useState(50);
  const frame = useRef<HTMLDivElement>(null);
  const { width: W, height: H } = project.scene;
  const scale = useFitScale(frame, W, H);

  const boxes: Box[] = [
    ...project.analysis.texts.filter((t) => highlightIds.includes(t.id)).map((t) => t.box),
    ...project.analysis.objects.filter((o) => highlightIds.includes(o.id)).map((o) => o.box),
  ];

  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      <div className="flex items-center justify-between gap-2">
        <div className="panel-title">Poster preview</div>
        <div className="flex rounded-lg border border-white/[0.06] bg-surface-sunken/70 p-0.5">
          {MODES.map((m) => (
            <button
              key={m.id}
              onClick={() => setPreviewMode(m.id)}
              className={cn(
                "flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition",
                previewMode === m.id ? "bg-white/[0.09] text-white" : "text-muted-foreground hover:text-white",
              )}
            >
              <m.icon className="h-3 w-3" /> {m.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3 flex justify-between text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        <span>Original</span>
        <span className="text-brand">Reconstructed</span>
      </div>

      <div ref={frame} className="relative mt-2 flex min-h-[260px] flex-1 items-start justify-center">
        <div className="checkerboard relative overflow-hidden rounded-xl shadow-panel" style={{ width: W * scale, height: H * scale }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={project.original} alt="Original poster" className="absolute inset-0 h-full w-full" draggable={false} />

          <div
            className="absolute inset-0"
            style={{
              clipPath: previewMode === "split" ? `inset(0 0 0 ${split}%)` : undefined,
              opacity: previewMode === "overlay" ? overlay / 100 : 1,
              mixBlendMode: previewMode === "difference" ? "difference" : undefined,
            }}
          >
            <SceneView scene={project.scene} scale={scale} />
          </div>

          {previewMode === "split" && (
            <div className="pointer-events-none absolute inset-y-0 w-0.5 bg-brand shadow-[0_0_10px_rgba(34,211,238,.8)]" style={{ left: `${split}%` }}>
              <div className="absolute top-1/2 -ml-3 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full border-2 border-brand bg-ink text-[10px] text-brand">⇆</div>
            </div>
          )}

          {boxes.map((b, i) => (
            <div
              key={i}
              className="pointer-events-none absolute rounded-sm border-2 border-brand bg-brand/10"
              style={{ left: b.x * scale, top: b.y * scale, width: b.width * scale, height: b.height * scale }}
            />
          ))}
        </div>
      </div>

      <div className="mt-4">
        {previewMode === "split" && <Slider value={[split]} min={0} max={100} step={1} onValueChange={([v]) => setSplit(v)} aria-label="Split position" />}
        {previewMode === "overlay" && <Slider value={[overlay]} min={0} max={100} step={1} onValueChange={([v]) => setOverlay(v)} aria-label="Overlay opacity" />}
        {previewMode === "difference" && (
          <p className="text-[11px] leading-relaxed text-muted-foreground">Black means a perfect match. Bright areas show where the reconstruction differs from the original.</p>
        )}
      </div>
    </div>
  );
}
