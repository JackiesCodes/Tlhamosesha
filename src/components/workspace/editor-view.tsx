"use client";
// Reconstruction editor: layers | canvas | inspector.
import { useRef, useState } from "react";
import { Maximize, Minus, Plus, Square, Type } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { useEditor } from "@/lib/store/editor";
import type { Project } from "@/lib/types";
import { uid } from "@/lib/utils";
import { LayerInspector, LayerList } from "./layers-panel";
import { SceneView, useFitScale } from "./scene-view";

export function EditorView({ project }: { project: Project }) {
  const [zoom, setZoom] = useState(1);
  const frame = useRef<HTMLDivElement>(null);
  const { width: W, height: H } = project.scene;
  const scale = useFitScale(frame, W, H, zoom);
  const addLayer = useEditor((s) => s.addLayer);
  const accent = project.analysis.palette.find((c) => c.role === "accent")?.hex ?? "#22D3EE";

  const addText = () =>
    addLayer({
      id: uid("lyr"),
      name: "New text",
      type: "text",
      x: W * 0.25,
      y: H * 0.45,
      width: W * 0.5,
      height: H * 0.06,
      rotation: 0,
      opacity: 1,
      visible: true,
      locked: false,
      text: "New text",
      color: "#FFFFFF",
      fontFamily: project.analysis.texts[0]?.font.family ?? "Inter",
      fontSize: Math.round(H * 0.05),
      fontWeight: 700,
      letterSpacing: 0,
      lineHeight: 1,
      align: "center",
      uppercase: false,
    });

  const addShape = () =>
    addLayer({
      id: uid("lyr"),
      name: "Rectangle",
      type: "shape",
      x: W * 0.3,
      y: H * 0.4,
      width: W * 0.4,
      height: H * 0.12,
      rotation: 0,
      opacity: 1,
      visible: true,
      locked: false,
      fill: accent,
      radius: Math.round(Math.min(W, H) * 0.02),
    });

  return (
    <div className="grid h-full min-h-0 gap-4 lg:grid-cols-[250px_1fr_300px]">
      <aside className="panel scrollbar-thin flex min-h-0 flex-col overflow-y-auto p-3">
        <div className="panel-title mb-2 px-1">Layers · {project.scene.layers.length}</div>
        <LayerList />
      </aside>

      <section className="panel relative flex min-h-[60vh] flex-col overflow-hidden">
        <div className="flex items-center gap-1 border-b border-white/[0.06] px-3 py-2">
          <Tooltip content="Add text">
            <Button variant="ghost" size="icon-sm" onClick={addText} aria-label="Add text"><Type /></Button>
          </Tooltip>
          <Tooltip content="Add shape">
            <Button variant="ghost" size="icon-sm" onClick={addShape} aria-label="Add shape"><Square /></Button>
          </Tooltip>
          <span className="mx-2 h-4 w-px bg-white/10" />
          <span className="text-[11px] text-muted-foreground">Drag to move · handles resize (⇧ keeps ratio) · double-click text to edit</span>
          <div className="ml-auto flex items-center gap-1">
            <Button variant="ghost" size="icon-sm" onClick={() => setZoom((z) => Math.max(0.25, z / 1.25))} aria-label="Zoom out"><Minus /></Button>
            <span className="w-12 text-center font-mono text-[11px] text-muted-foreground">{Math.round(scale * 100)}%</span>
            <Button variant="ghost" size="icon-sm" onClick={() => setZoom((z) => Math.min(6, z * 1.25))} aria-label="Zoom in"><Plus /></Button>
            <Button variant="ghost" size="icon-sm" onClick={() => setZoom(1)} aria-label="Fit"><Maximize /></Button>
          </div>
        </div>
        <div className="scrollbar-thin relative min-h-0 flex-1 overflow-auto bg-surface-sunken/60 bg-grid-faint [background-size:24px_24px]">
          <div ref={frame} className="absolute inset-8" />
          <div className="flex min-h-full min-w-full items-center justify-center p-8" style={{ width: "max-content" }}>
            <SceneView scene={project.scene} scale={scale} interactive className="shadow-panel ring-1 ring-white/10" />
          </div>
        </div>
      </section>

      <aside className="panel scrollbar-thin min-h-0 overflow-y-auto p-4">
        <div className="panel-title mb-3">Layer inspector</div>
        <LayerInspector />
      </aside>
    </div>
  );
}
