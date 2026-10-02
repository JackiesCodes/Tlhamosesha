"use client";
// Figma-style layer list and inspector.
import { useEffect, useRef, useState } from "react";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowDown,
  ArrowDownToLine,
  ArrowUp,
  ArrowUpToLine,
  Copy,
  Eye,
  EyeOff,
  Image as ImageIcon,
  Lock,
  RefreshCcw,
  Square,
  Trash2,
  Type,
  Unlock,
  Wallpaper,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Tooltip } from "@/components/ui/tooltip";
import { GOOGLE_FONTS } from "@/lib/export";
import { useEditor } from "@/lib/store/editor";
import type { SceneLayer, TextLayer } from "@/lib/types";
import { cn } from "@/lib/utils";

const TYPE_ICON = { background: Wallpaper, image: ImageIcon, text: Type, shape: Square } as const;

export function LayerList({ className }: { className?: string }) {
  const { project, selectedId, select, updateLayer, highlightIds } = useEditor();
  if (!project) return null;
  const layers = [...project.scene.layers].reverse();
  return (
    <div className={cn("space-y-0.5", className)}>
      {layers.map((l, i) => {
        const Icon = TYPE_ICON[l.type];
        const active = selectedId === l.id;
        const hl = highlightIds.includes(l.id) || (l.sourceId && highlightIds.includes(l.sourceId));
        return (
          <div
            key={l.id}
            onClick={() => select(l.id)}
            className={cn(
              "group flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition",
              active ? "bg-brand/[0.12] text-white ring-1 ring-brand/30" : "text-white/80 hover:bg-white/[0.04]",
              hl && !active && "bg-brand/[0.05]",
            )}
          >
            <span className="w-5 text-right font-mono text-[10px] text-muted-foreground">{layers.length - i}</span>
            <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-md border border-white/[0.06] bg-surface-sunken">
              {"src" in l ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={l.src} alt="" className="h-full w-full object-contain" />
              ) : (
                <Icon className="h-3.5 w-3.5 text-muted-foreground" />
              )}
            </span>
            <span className={cn("min-w-0 flex-1 truncate", !l.visible && "opacity-40")}>{l.name}</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                updateLayer(l.id, { locked: !l.locked });
              }}
              className={cn("rounded p-1 text-muted-foreground hover:text-white", !l.locked && "opacity-0 group-hover:opacity-100")}
              aria-label={l.locked ? "Unlock" : "Lock"}
            >
              {l.locked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                updateLayer(l.id, { visible: !l.visible });
              }}
              className={cn("rounded p-1 text-muted-foreground hover:text-white", l.visible && "opacity-0 group-hover:opacity-100")}
              aria-label={l.visible ? "Hide" : "Show"}
            >
              {l.visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
            </button>
          </div>
        );
      })}
    </div>
  );
}

export function LayerInspector({ className }: { className?: string }) {
  const { project, selectedId, updateLayer, reorder, removeLayer, duplicateLayer, commit } = useEditor();
  const fileRef = useRef<HTMLInputElement>(null);
  const layer = project?.scene.layers.find((l) => l.id === selectedId);
  if (!project) return null;
  if (!layer)
    return (
      <div className={cn("rounded-xl border border-dashed border-white/10 p-6 text-center text-xs text-muted-foreground", className)}>
        Select a layer to inspect its position, size, rotation, opacity and order.
      </div>
    );

  const index = project.scene.layers.findIndex((l) => l.id === layer.id);
  const set = (patch: Partial<SceneLayer>) => updateLayer(layer.id, patch);

  const replaceImage = (f?: File) => {
    if (!f) return;
    const r = new FileReader();
    r.onload = () => set({ src: r.result as string } as Partial<SceneLayer>);
    r.readAsDataURL(f);
  };

  return (
    <div className={cn("space-y-5", className)}>
      <div className="flex items-center gap-2">
        <input
          value={layer.name}
          onChange={(e) => updateLayer(layer.id, { name: e.target.value }, { commit: false })}
          onFocus={commit}
          className="h-8 min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-2 text-sm font-semibold text-white hover:border-white/10 focus:border-brand/40 focus:outline-none"
        />
        <span className="rounded-md bg-white/[0.05] px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">{layer.type}</span>
      </div>

      <Section title="Transform">
        <div className="grid grid-cols-2 gap-2">
          <NumField label="X" value={layer.x} onChange={(v) => set({ x: v })} />
          <NumField label="Y" value={layer.y} onChange={(v) => set({ y: v })} />
          <NumField label="W" value={layer.width} min={1} onChange={(v) => set({ width: v })} />
          <NumField label="H" value={layer.height} min={1} onChange={(v) => set({ height: v })} />
          <NumField label="↻" suffix="°" value={layer.rotation} onChange={(v) => set({ rotation: ((v % 360) + 360) % 360 })} />
          <NumField label="α" suffix="%" value={Math.round(layer.opacity * 100)} min={0} max={100} onChange={(v) => set({ opacity: v / 100 })} />
        </div>
        <Slider
          className="mt-3"
          value={[layer.opacity * 100]}
          min={0}
          max={100}
          step={1}
          onPointerDown={commit}
          onValueChange={([v]) => updateLayer(layer.id, { opacity: v / 100 }, { commit: false })}
          aria-label="Opacity"
        />
      </Section>

      <Section title={`Layer order · ${index + 1} of ${project.scene.layers.length}`}>
        <div className="flex flex-wrap gap-1">
          <IconBtn label="Bring to front" onClick={() => reorder(layer.id, "top")} icon={ArrowUpToLine} />
          <IconBtn label="Bring forward" onClick={() => reorder(layer.id, "up")} icon={ArrowUp} />
          <IconBtn label="Send backward" onClick={() => reorder(layer.id, "down")} icon={ArrowDown} />
          <IconBtn label="Send to back" onClick={() => reorder(layer.id, "bottom")} icon={ArrowDownToLine} />
          <span className="flex-1" />
          <IconBtn label="Duplicate" onClick={() => duplicateLayer(layer.id)} icon={Copy} />
          <IconBtn label={layer.locked ? "Unlock" : "Lock"} onClick={() => set({ locked: !layer.locked })} icon={layer.locked ? Lock : Unlock} />
          <IconBtn label="Delete" onClick={() => removeLayer(layer.id)} icon={Trash2} danger />
        </div>
      </Section>

      {layer.type === "text" && <TextProps layer={layer} />}

      {(layer.type === "image" || layer.type === "background") && (
        <Section title="Image">
          <div className="checkerboard flex h-28 items-center justify-center overflow-hidden rounded-lg border border-white/[0.06]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={layer.src} alt="" className="max-h-full max-w-full object-contain" />
          </div>
          <Button variant="secondary" size="sm" className="mt-2 w-full" onClick={() => fileRef.current?.click()}>
            <RefreshCcw /> Replace image
          </Button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => replaceImage(e.target.files?.[0])} />
        </Section>
      )}

      {layer.type === "shape" && (
        <Section title="Fill">
          <ColorField value={layer.fill} onChange={(v) => set({ fill: v } as Partial<SceneLayer>)} />
        </Section>
      )}
    </div>
  );
}

function TextProps({ layer }: { layer: TextLayer }) {
  const { updateLayer, project } = useEditor();
  const set = (patch: Partial<TextLayer>) => updateLayer(layer.id, patch);
  const palette = project?.analysis.palette ?? [];
  const fonts = [...new Set([layer.fontFamily, ...GOOGLE_FONTS])];
  return (
    <Section title="Text">
      <textarea
        value={layer.text}
        onChange={(e) => set({ text: e.target.value, name: e.target.value.slice(0, 32) })}
        rows={2}
        className="w-full resize-none rounded-lg border border-white/[0.08] bg-surface-sunken/80 px-2.5 py-2 text-sm text-white focus:border-brand/40 focus:outline-none"
      />
      <select
        value={layer.fontFamily}
        onChange={(e) => set({ fontFamily: e.target.value })}
        className="mt-2 h-8 w-full rounded-lg border border-white/[0.08] bg-surface-sunken px-2 text-sm text-white"
        style={{ fontFamily: layer.fontFamily }}
      >
        {fonts.map((f) => (
          <option key={f} value={f} style={{ fontFamily: f }}>
            {f}
          </option>
        ))}
      </select>
      <div className="mt-2 grid grid-cols-3 gap-2">
        <NumField label="Size" value={layer.fontSize} min={4} onChange={(v) => set({ fontSize: v })} />
        <NumField label="Wt" value={layer.fontWeight} min={100} max={900} step={100} onChange={(v) => set({ fontWeight: v })} />
        <NumField label="Tr" value={layer.letterSpacing} onChange={(v) => set({ letterSpacing: v })} />
      </div>
      <div className="mt-2 flex items-center gap-1">
        {(["left", "center", "right"] as const).map((a) => {
          const I = a === "left" ? AlignLeft : a === "center" ? AlignCenter : AlignRight;
          return (
            <button
              key={a}
              onClick={() => set({ align: a })}
              className={cn("flex h-8 flex-1 items-center justify-center rounded-lg border", layer.align === a ? "border-brand/40 bg-brand/10 text-brand" : "border-white/[0.06] text-muted-foreground hover:text-white")}
              aria-label={`Align ${a}`}
            >
              <I className="h-4 w-4" />
            </button>
          );
        })}
        <button
          onClick={() => set({ uppercase: !layer.uppercase })}
          className={cn("flex h-8 flex-1 items-center justify-center rounded-lg border text-xs font-bold", layer.uppercase ? "border-brand/40 bg-brand/10 text-brand" : "border-white/[0.06] text-muted-foreground hover:text-white")}
        >
          AA
        </button>
      </div>
      <div className="mt-3">
        <ColorField value={layer.color} onChange={(v) => set({ color: v })} />
        <div className="mt-2 flex flex-wrap gap-1.5">
          {palette.map((c) => (
            <Tooltip key={c.hex} content={`${c.name} ${c.hex}`}>
              <button
                onClick={() => set({ color: c.hex })}
                className={cn("h-6 w-6 rounded-md border border-white/15 transition hover:scale-110", c.hex === layer.color && "ring-2 ring-brand")}
                style={{ background: c.hex }}
                aria-label={`Use ${c.hex}`}
              />
            </Tooltip>
          ))}
        </div>
      </div>
    </Section>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="panel-title mb-2">{title}</div>
      {children}
    </div>
  );
}

function NumField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  suffix,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
}) {
  return (
    <label className="flex h-8 items-center gap-1.5 rounded-lg border border-white/[0.08] bg-surface-sunken/80 px-2 focus-within:border-brand/40">
      <span className="w-6 shrink-0 text-[10px] font-semibold text-muted-foreground">{label}</span>
      <input
        type="number"
        value={Math.round(value * 10) / 10}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          const v = parseFloat(e.target.value);
          if (!Number.isNaN(v)) onChange(Math.min(max ?? Infinity, Math.max(min ?? -Infinity, v)));
        }}
        className="w-full min-w-0 bg-transparent font-mono text-xs text-white outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
      />
      {suffix && <span className="text-[10px] text-muted-foreground">{suffix}</span>}
    </label>
  );
}

function ColorField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <div className="flex items-center gap-2">
      <label className="relative h-8 w-8 shrink-0 cursor-pointer overflow-hidden rounded-lg border border-white/15" style={{ background: value }}>
        <input type="color" value={value} onChange={(e) => onChange(e.target.value.toUpperCase())} className="absolute inset-0 cursor-pointer opacity-0" />
      </label>
      <input
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          if (/^#[0-9a-f]{6}$/i.test(e.target.value)) onChange(e.target.value.toUpperCase());
        }}
        className="h-8 min-w-0 flex-1 rounded-lg border border-white/[0.08] bg-surface-sunken/80 px-2 font-mono text-xs text-white focus:border-brand/40 focus:outline-none"
      />
    </div>
  );
}

function IconBtn({ label, icon: Icon, onClick, danger }: { label: string; icon: typeof Copy; onClick: () => void; danger?: boolean }) {
  return (
    <Tooltip content={label}>
      <button
        onClick={onClick}
        aria-label={label}
        className={cn(
          "flex h-8 w-8 items-center justify-center rounded-lg border border-white/[0.06] text-muted-foreground transition hover:border-white/15 hover:text-white",
          danger && "hover:border-rose-400/40 hover:text-rose-700 hover:dark:text-rose-300",
        )}
      >
        <Icon className="h-3.5 w-3.5" />
      </button>
    </Tooltip>
  );
}
