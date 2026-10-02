"use client";
// DOM renderer for the editable scene. Used for previews (static) and the
// reconstruction editor (interactive: select, move, resize, rotate, edit text).
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { cssFontStack } from "@/lib/export";
import { useEditor } from "@/lib/store/editor";
import type { Scene, SceneLayer } from "@/lib/types";
import { cn } from "@/lib/utils";

export function useFitScale(ref: React.RefObject<HTMLElement | null>, w: number, h: number, zoom = 1) {
  const [scale, setScale] = useState(0.2);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      if (!r.width) return;
      const fit = Math.min(r.width / w, r.height > 40 ? r.height / h : Infinity);
      setScale(fit * zoom);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, w, h, zoom]);
  return scale;
}

type Handle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "rot";

export function SceneView({
  scene,
  scale,
  interactive = false,
  className,
  showHidden = false,
}: {
  scene: Scene;
  scale: number;
  interactive?: boolean;
  className?: string;
  showHidden?: boolean;
}) {
  const { selectedId, highlightIds, select, updateLayer, commit } = useEditor();
  const [editingId, setEditingId] = useState<string | null>(null);
  const drag = useRef<{
    id: string;
    handle: Handle | "move";
    sx: number;
    sy: number;
    start: SceneLayer;
    center?: { x: number; y: number };
  } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!interactive) return;
    const move = (e: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      const dx = (e.clientX - d.sx) / scale;
      const dy = (e.clientY - d.sy) / scale;
      const s = d.start;
      if (d.handle === "move") {
        updateLayer(d.id, { x: Math.round(s.x + dx), y: Math.round(s.y + dy) }, { commit: false });
        return;
      }
      if (d.handle === "rot" && d.center) {
        const ang = (Math.atan2(e.clientY - d.center.y, e.clientX - d.center.x) * 180) / Math.PI + 90;
        const snapped = e.shiftKey ? Math.round(ang / 15) * 15 : Math.round(ang);
        updateLayer(d.id, { rotation: ((snapped % 360) + 360) % 360 }, { commit: false });
        return;
      }
      let { x, y, width, height } = s;
      const h = d.handle;
      if (h.includes("e")) width = Math.max(8, s.width + dx);
      if (h.includes("s")) height = Math.max(8, s.height + dy);
      if (h.includes("w")) {
        width = Math.max(8, s.width - dx);
        x = s.x + (s.width - width);
      }
      if (h.includes("n")) {
        height = Math.max(8, s.height - dy);
        y = s.y + (s.height - height);
      }
      if (e.shiftKey && h.length === 2) {
        const ratio = s.width / s.height;
        if (width / height > ratio) width = height * ratio;
        else height = width / ratio;
        if (h.includes("w")) x = s.x + (s.width - width);
        if (h.includes("n")) y = s.y + (s.height - height);
      }
      const patch: Partial<SceneLayer> = { x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) };
      if (s.type === "text" && h.length === 2) (patch as { fontSize: number }).fontSize = Math.max(4, Math.round(s.fontSize * (height / s.height)));
      updateLayer(d.id, patch, { commit: false });
    };
    const up = () => (drag.current = null);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [interactive, scale, updateLayer]);

  const begin = (e: React.PointerEvent, l: SceneLayer, handle: Handle | "move") => {
    if (!interactive) return;
    e.stopPropagation();
    select(l.id);
    if (l.locked || editingId === l.id) return;
    e.preventDefault();
    commit();
    let center;
    if (handle === "rot" && rootRef.current) {
      const r = rootRef.current.getBoundingClientRect();
      center = { x: r.left + (l.x + l.width / 2) * scale, y: r.top + (l.y + l.height / 2) * scale };
    }
    drag.current = { id: l.id, handle, sx: e.clientX, sy: e.clientY, start: { ...l }, center };
  };

  return (
    <div
      className={cn("relative overflow-hidden", className)}
      style={{ width: scene.width * scale, height: scene.height * scale }}
      onPointerDown={() => interactive && (select(null), setEditingId(null))}
    >
      <div
        ref={rootRef}
        className="absolute left-0 top-0 origin-top-left"
        style={{ width: scene.width, height: scene.height, transform: `scale(${scale})`, background: scene.background }}
      >
        {scene.layers.map((l) => {
          if (!l.visible && !showHidden) return null;
          const selected = interactive && selectedId === l.id;
          const hl = highlightIds.includes(l.id) || (l.sourceId && highlightIds.includes(l.sourceId));
          return (
            <div
              key={l.id}
              data-layer={l.id}
              onPointerDown={(e) => begin(e, l, "move")}
              onDoubleClick={() => interactive && l.type === "text" && !l.locked && setEditingId(l.id)}
              className={cn(
                "absolute",
                interactive && !l.locked && "cursor-move",
                interactive && l.type === "background" && "cursor-default",
                !l.visible && "opacity-30",
              )}
              style={{
                left: l.x,
                top: l.y,
                width: l.width,
                height: l.height,
                opacity: l.visible ? l.opacity : 0.25,
                transform: l.rotation ? `rotate(${l.rotation}deg)` : undefined,
                outline: hl ? `${2 / scale}px solid #3B82F6` : undefined,
                outlineOffset: hl ? 2 / scale : undefined,
              }}
            >
              <LayerContent layer={l} editing={editingId === l.id} onCommitText={(text) => {
                updateLayer(l.id, { text } as Partial<SceneLayer>);
                setEditingId(null);
              }} />
              {selected && <Handles scale={scale} locked={l.locked} onHandle={(e, h) => begin(e, l, h)} />}
              {interactive && !selected && (
                <div className="pointer-events-none absolute inset-0 opacity-0 transition hover:opacity-100" style={{ boxShadow: `inset 0 0 0 ${1 / scale}px rgba(59,130,246,.6)` }} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function LayerContent({ layer: l, editing, onCommitText }: { layer: SceneLayer; editing: boolean; onCommitText: (t: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (editing && ref.current) {
      ref.current.focus();
      const range = document.createRange();
      range.selectNodeContents(ref.current);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    }
  }, [editing]);

  if (l.type === "image" || l.type === "background")
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={l.src} alt={l.name} draggable={false} className="pointer-events-none h-full w-full select-none" style={{ objectFit: l.fit }} />;
  if (l.type === "shape") return <div className="h-full w-full" style={{ background: l.fill, borderRadius: l.radius }} />;
  return (
    <div
      ref={ref}
      contentEditable={editing}
      suppressContentEditableWarning
      onBlur={(e) => editing && onCommitText(e.currentTarget.textContent ?? "")}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === "Escape") {
          e.preventDefault();
          (e.currentTarget as HTMLDivElement).blur();
        }
        e.stopPropagation();
      }}
      className={cn("flex h-full w-full items-center whitespace-nowrap leading-none outline-none", editing && "cursor-text ring-2 ring-brand")}
      style={{
        justifyContent: l.align === "left" ? "flex-start" : l.align === "right" ? "flex-end" : "center",
        color: l.color,
        fontFamily: cssFontStack(l.fontFamily),
        fontSize: l.fontSize,
        fontWeight: l.fontWeight,
        letterSpacing: l.letterSpacing,
        lineHeight: l.lineHeight,
        textTransform: l.uppercase ? "uppercase" : undefined,
      }}
    >
      {l.text}
    </div>
  );
}

function Handles({ scale, locked, onHandle }: { scale: number; locked: boolean; onHandle: (e: React.PointerEvent, h: Handle) => void }) {
  const s = 10 / scale;
  const b = 1.5 / scale;
  const pos: Record<Exclude<Handle, "rot">, React.CSSProperties> = {
    nw: { left: -s / 2, top: -s / 2, cursor: "nwse-resize" },
    n: { left: `calc(50% - ${s / 2}px)`, top: -s / 2, cursor: "ns-resize" },
    ne: { right: -s / 2, top: -s / 2, cursor: "nesw-resize" },
    e: { right: -s / 2, top: `calc(50% - ${s / 2}px)`, cursor: "ew-resize" },
    se: { right: -s / 2, bottom: -s / 2, cursor: "nwse-resize" },
    s: { left: `calc(50% - ${s / 2}px)`, bottom: -s / 2, cursor: "ns-resize" },
    sw: { left: -s / 2, bottom: -s / 2, cursor: "nesw-resize" },
    w: { left: -s / 2, top: `calc(50% - ${s / 2}px)`, cursor: "ew-resize" },
  };
  return (
    <>
      <div className="pointer-events-none absolute inset-0" style={{ boxShadow: `0 0 0 ${b}px ${locked ? "#64748b" : "#3B82F6"}` }} />
      {!locked &&
        (Object.keys(pos) as Exclude<Handle, "rot">[]).map((h) => (
          <div
            key={h}
            onPointerDown={(e) => onHandle(e, h)}
            className="absolute rounded-[2px] bg-onbrand"
            style={{ ...pos[h], width: s, height: s, boxShadow: `0 0 0 ${b}px #3B82F6` }}
          />
        ))}
      {!locked && (
        <>
          <div className="pointer-events-none absolute left-1/2 bg-brand" style={{ top: -28 / scale, width: b, height: 22 / scale, transform: "translateX(-50%)" }} />
          <div
            onPointerDown={(e) => onHandle(e, "rot")}
            className="absolute left-1/2 cursor-grab rounded-full bg-brand"
            style={{ top: -34 / scale, width: s * 1.1, height: s * 1.1, transform: "translateX(-50%)" }}
          />
        </>
      )}
    </>
  );
}
