"use client";
import { useState } from "react";
import { motion } from "framer-motion";
import {
  Boxes,
  Check,
  Copy,
  Cpu,
  Dna,
  Download,
  Eye,
  FileText,
  Grid3X3,
  Layers,
  Palette,
  Type,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip } from "@/components/ui/tooltip";
import { contrastRatio, hexToRgb } from "@/lib/color";
import { cssFontStack } from "@/lib/export";
import { useApp } from "@/lib/store/app";
import { useEditor, type WorkspaceTab } from "@/lib/store/editor";
import type { DetectedObject, PaletteColor, Project, TextRole } from "@/lib/types";
import { cn, downloadDataUrl, formatBytes } from "@/lib/utils";
import { LayerInspector, LayerList } from "./layers-panel";

const TABS: { id: WorkspaceTab; label: string; icon: typeof Boxes }[] = [
  { id: "elements", label: "Elements", icon: Boxes },
  { id: "layers", label: "Layers", icon: Layers },
  { id: "typography", label: "Typography", icon: Type },
  { id: "colors", label: "Colors", icon: Palette },
  { id: "layout", label: "Layout", icon: Grid3X3 },
  { id: "metadata", label: "Metadata", icon: FileText },
  { id: "dna", label: "Design DNA", icon: Dna },
];

export function BreakdownTabs({ project }: { project: Project }) {
  const { tab, setTab } = useEditor();
  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v as WorkspaceTab)} className="flex min-h-0 flex-col">
      <div className="scrollbar-thin -mx-1 overflow-x-auto px-1 pb-1">
        <TabsList>
          {TABS.map((t) => (
            <TabsTrigger key={t.id} value={t.id}>
              <t.icon /> {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
      <div className="mt-5 min-h-0 flex-1">
        <TabsContent value="elements"><ElementsTab project={project} /></TabsContent>
        <TabsContent value="layers"><LayersTab /></TabsContent>
        <TabsContent value="typography"><TypographyTab project={project} /></TabsContent>
        <TabsContent value="colors"><ColorsTab project={project} /></TabsContent>
        <TabsContent value="layout"><LayoutTab project={project} /></TabsContent>
        <TabsContent value="metadata"><MetadataTab project={project} /></TabsContent>
        <TabsContent value="dna"><DnaTab project={project} /></TabsContent>
      </div>
    </Tabs>
  );
}

// ---------------------------------------------------------------------------

function useAssetDownload(project: Project) {
  const logExport = useApp((s) => s.logExport);
  return (dataUrl: string, name: string) => {
    const ext = dataUrl.startsWith("data:image/png") ? "png" : "jpg";
    const fileName = `${name.replace(/\W+/g, "-").toLowerCase()}.${ext}`;
    downloadDataUrl(dataUrl, fileName);
    logExport({ projectId: project.id, projectName: project.name, format: "asset", fileName, size: Math.round(dataUrl.length * 0.75) });
  };
}

const KIND_ORDER = ["person", "face", "logo", "product", "vehicle", "building", "icon", "object"];

function ElementsTab({ project }: { project: Project }) {
  const { highlight, highlightIds } = useEditor();
  const download = useAssetDownload(project);
  const [view, setView] = useState<"cutout" | "crop">("cutout");
  const objs = [...project.analysis.objects].sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind));
  const groups = KIND_ORDER.map((k) => ({ kind: k, items: objs.filter((o) => o.kind === k) })).filter((g) => g.items.length);

  return (
    <div className="space-y-8">
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white">
            Detected objects <span className="ml-1 text-muted-foreground">{objs.length}</span>
          </h3>
          <div className="flex rounded-lg border border-white/[0.06] p-0.5 text-[11px]">
            {(["cutout", "crop"] as const).map((v) => (
              <button key={v} onClick={() => setView(v)} className={cn("rounded-md px-2 py-1 capitalize", view === v ? "bg-white/[0.09] text-white" : "text-muted-foreground")}>
                {v === "cutout" ? "Transparent" : "Original crop"}
              </button>
            ))}
          </div>
        </div>
        {objs.length === 0 && <Empty text="No distinct objects were found. Try raising segmentation sensitivity in Settings." />}
        <div className="space-y-5">
          {groups.map((g) => (
            <div key={g.kind}>
              <div className="panel-title mb-2 capitalize">{g.kind === "person" ? "People & players" : g.kind + "s"}</div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                {g.items.map((o, i) => (
                  <ObjectCard
                    key={o.id}
                    o={o}
                    i={i}
                    view={view}
                    active={highlightIds.includes(o.id)}
                    onView={() => highlight(highlightIds.includes(o.id) ? [] : [o.id])}
                    onDownload={() => download(view === "cutout" ? o.cutout! : o.crop!, o.label)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h3 className="mb-3 text-sm font-semibold text-white">
          Background layers <span className="ml-1 text-muted-foreground">{project.analysis.backgrounds.length}</span>
        </h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {project.analysis.backgrounds.map((b) => (
            <div key={b.id} className="group overflow-hidden rounded-xl border border-white/[0.06] bg-surface-sunken/60">
              <div className="checkerboard relative aspect-[4/3]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={b.image} alt={b.label} className="h-full w-full object-cover" />
                <button
                  onClick={() => download(b.image, `background-${b.kind}`)}
                  className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-lg bg-ink/80 text-white transition sm:opacity-0 sm:group-hover:opacity-100"
                  aria-label="Download layer"
                >
                  <Download className="h-4 w-4" />
                </button>
              </div>
              <div className="p-3">
                <div className="truncate text-sm text-white">{b.label}</div>
                <div className="mt-0.5 flex items-center justify-between text-[11px] text-muted-foreground">
                  <span className="capitalize">{b.kind}</span>
                  <span>{Math.round(b.confidence * 100)}%</span>
                </div>
                {b.css && <code className="mt-1 block truncate font-mono text-[10px] text-brand/80">{b.css}</code>}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function ObjectCard({ o, i, view, active, onView, onDownload }: { o: DetectedObject; i: number; view: "cutout" | "crop"; active: boolean; onView: () => void; onDownload: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(i * 0.03, 0.3) }}
      className={cn("group overflow-hidden rounded-xl border bg-surface-sunken/60 transition", active ? "border-brand ring-1 ring-brand" : "border-white/[0.06] hover:border-white/15")}
    >
      <div className={cn("relative flex aspect-square items-center justify-center p-3", view === "cutout" && "checkerboard")}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={view === "cutout" ? o.cutout : o.crop} alt={o.label} className="max-h-full max-w-full object-contain" />
        <div className="absolute right-2 top-2 flex gap-1 transition sm:opacity-0 sm:group-hover:opacity-100">
          <button onClick={onView} className="flex h-7 w-7 items-center justify-center rounded-md bg-ink/80 text-white" aria-label="Locate on poster">
            <Eye className="h-3.5 w-3.5" />
          </button>
          <button onClick={onDownload} className="flex h-7 w-7 items-center justify-center rounded-md bg-ink/80 text-white" aria-label="Download PNG">
            <Download className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <div className="p-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-sm text-white">{o.label}</span>
          <ConfidenceDot v={o.confidence} />
        </div>
        <div className="mt-0.5 font-mono text-[10px] text-muted-foreground">
          {o.box.x},{o.box.y} · {o.box.width}×{o.box.height}
        </div>
        <div className="mt-1 flex items-center gap-1">
          <Badge variant="secondary" className="px-1.5 py-0 text-[9px] uppercase">{o.source}</Badge>
          {o.coverage !== undefined && <span className="text-[10px] text-muted-foreground">{Math.round(o.coverage * 100)}% kept</span>}
        </div>
      </div>
    </motion.div>
  );
}

function LayersTab() {
  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_300px]">
      <div className="rounded-xl border border-white/[0.06] bg-surface-sunken/40 p-2">
        <LayerList />
      </div>
      <div className="rounded-xl border border-white/[0.06] bg-surface-sunken/40 p-4">
        <div className="panel-title mb-3">Layer inspector</div>
        <LayerInspector />
      </div>
    </div>
  );
}

const ROLE_STYLE: Record<TextRole, string> = {
  headline: "danger",
  subheadline: "warning",
  score: "default",
  statistic: "info",
  date: "success",
  name: "info",
  cta: "success",
  caption: "secondary",
  body: "secondary",
};

function TypographyTab({ project }: { project: Project }) {
  const { highlight, highlightIds } = useEditor();
  const texts = [...project.analysis.texts].sort((a, b) => b.font.sizePx - a.font.sizePx);
  const families = Object.entries(
    texts.reduce<Record<string, { count: number; weights: Set<number>; sizes: number[] }>>((acc, t) => {
      const f = (acc[t.font.family] ??= { count: 0, weights: new Set(), sizes: [] });
      f.count++;
      f.weights.add(t.font.weight);
      f.sizes.push(t.font.sizePx);
      return acc;
    }, {}),
  );

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {families.map(([fam, f]) => (
          <div key={fam} className="rounded-xl border border-white/[0.06] bg-surface-sunken/50 p-4">
            <div className="truncate text-3xl text-white" style={{ fontFamily: cssFontStack(fam) }}>
              Aa Gg 123
            </div>
            <div className="mt-3 flex items-center justify-between">
              <span className="text-sm font-medium text-white">{fam}</span>
              <span className="text-xs text-muted-foreground">{f.count} uses</span>
            </div>
            <div className="mt-1 text-[11px] text-muted-foreground">
              Weights {[...f.weights].sort().join(", ")} · {Math.min(...f.sizes)}–{Math.max(...f.sizes)}px
            </div>
          </div>
        ))}
      </div>

      {texts.length === 0 && <Empty text="No text was recognised in this image." />}
      <div className="overflow-hidden rounded-xl border border-white/[0.06]">
        <div className="hidden grid-cols-[1fr_110px_150px_70px_90px] gap-3 border-b border-white/[0.06] bg-white/[0.02] px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground md:grid">
          <span>Text</span>
          <span>Role</span>
          <span>Font estimate</span>
          <span>Size</span>
          <span>Position</span>
        </div>
        {texts.map((t) => (
          <button
            key={t.id}
            onClick={() => highlight(highlightIds.includes(t.id) ? [] : [t.id])}
            className={cn(
              "grid w-full grid-cols-1 gap-2 border-b border-white/[0.04] px-4 py-3 text-left transition last:border-0 md:grid-cols-[1fr_110px_150px_70px_90px] md:items-center md:gap-3",
              highlightIds.includes(t.id) ? "bg-brand/[0.08]" : "hover:bg-white/[0.03]",
            )}
          >
            <span className="flex min-w-0 items-center gap-2">
              <span className="h-3 w-3 shrink-0 rounded-sm border border-white/20" style={{ background: t.color }} />
              <span className="truncate text-sm text-white" style={{ fontFamily: cssFontStack(t.font.family), fontWeight: t.font.weight }}>
                {t.text}
              </span>
            </span>
            <span>
              <Badge variant={ROLE_STYLE[t.role] as "default"} className="capitalize">{t.role}</Badge>
            </span>
            <span className="text-xs text-slate-300">
              {t.font.family} · {t.font.weight}
              <span className="block text-[10px] text-muted-foreground">
                {t.font.category}
                {t.font.uppercase ? " · caps" : ""} · {t.font.align}
              </span>
            </span>
            <span className="font-mono text-xs text-white">{t.font.sizePx}px</span>
            <span className="font-mono text-[10px] text-muted-foreground">
              {Math.round(t.box.x)},{Math.round(t.box.y)}
              <span className="block">{Math.round(t.box.width)}×{Math.round(t.box.height)}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function ColorsTab({ project }: { project: Project }) {
  const roles: PaletteColor["role"][] = ["primary", "secondary", "accent", "neutral"];
  const p = project.analysis.palette;
  return (
    <div className="space-y-6">
      <div className="flex h-14 overflow-hidden rounded-xl border border-white/[0.06]">
        {p.map((c) => (
          <Tooltip key={c.hex} content={`${c.name} · ${Math.round(c.weight * 100)}%`}>
            <div className="h-full transition-all hover:flex-[2]" style={{ background: c.hex, flex: Math.max(0.04, c.weight) }} />
          </Tooltip>
        ))}
      </div>
      {roles.map((role) => {
        const list = p.filter((c) => c.role === role);
        if (!list.length) return null;
        return (
          <section key={role}>
            <div className="panel-title mb-2">{role} palette</div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {list.map((c) => (
                <ColorCard key={c.hex} c={c} />
              ))}
            </div>
          </section>
        );
      })}
      <section>
        <div className="panel-title mb-2">Gradients</div>
        {project.analysis.gradients.length === 0 && <Empty text="No significant gradients — the background is mostly flat." />}
        {project.analysis.gradients.map((g) => (
          <div key={g.id} className="overflow-hidden rounded-xl border border-white/[0.06]">
            <div className="h-20" style={{ background: g.css }} />
            <div className="flex flex-wrap items-center justify-between gap-2 p-3">
              <div className="text-xs text-muted-foreground">
                {g.region} · {g.angle}° · {g.stops.map((s) => s.hex).join(" → ")}
              </div>
              <CopyButton value={`background: ${g.css};`} label="Copy CSS" />
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}

function ColorCard({ c }: { c: PaletteColor }) {
  const white = contrastRatio(hexToRgb(c.hex), [255, 255, 255]);
  const black = contrastRatio(hexToRgb(c.hex), [0, 0, 0]);
  const values = [
    { k: "HEX", v: c.hex },
    { k: "RGB", v: `rgb(${c.rgb.join(", ")})` },
    { k: "HSL", v: `hsl(${c.hsl[0]}, ${c.hsl[1]}%, ${c.hsl[2]}%)` },
  ];
  return (
    <div className="overflow-hidden rounded-xl border border-white/[0.06] bg-surface-sunken/50">
      <div className="flex h-20 items-end justify-between p-3" style={{ background: c.hex, color: white > black ? "#fff" : "#000" }}>
        <span className="text-sm font-semibold">{c.name}</span>
        <span className="text-xs opacity-80">{Math.round(c.weight * 100)}%</span>
      </div>
      <div className="space-y-1 p-3">
        {values.map((v) => (
          <div key={v.k} className="flex items-center justify-between gap-2">
            <span className="w-8 text-[10px] font-semibold text-muted-foreground">{v.k}</span>
            <code className="flex-1 truncate font-mono text-xs text-white">{v.v}</code>
            <CopyButton value={v.v} />
          </div>
        ))}
        <div className="pt-1 text-[10px] text-muted-foreground">
          Contrast · white {white.toFixed(1)}:1 · black {black.toFixed(1)}:1
        </div>
      </div>
    </div>
  );
}

function LayoutTab({ project }: { project: Project }) {
  const a = project.analysis;
  const { width: W, height: H } = a.metadata;
  const l = a.layout;
  const [showImage, setShowImage] = useState(true);
  const stroke = Math.max(W, H) / 400;
  const metrics = [
    { k: "Columns", v: l.columns },
    { k: "Rows", v: l.rows },
    { k: "Gutter", v: `${l.gutter}px` },
    { k: "Padding", v: `${l.padding}px` },
    { k: "Baseline", v: `${l.baseline}px` },
    { k: "Alignment", v: l.alignment },
    { k: "Symmetry", v: `${Math.round(l.symmetry * 100)}%` },
    { k: "Margins", v: `${l.margins.top} / ${l.margins.right} / ${l.margins.bottom} / ${l.margins.left}` },
  ];
  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_280px]">
      <div className="rounded-xl border border-white/[0.06] bg-surface-sunken/50 p-4">
        <div className="mb-3 flex items-center justify-between">
          <span className="panel-title">Wireframe</span>
          <button onClick={() => setShowImage((v) => !v)} className="text-[11px] text-muted-foreground hover:text-white">
            {showImage ? "Hide" : "Show"} poster
          </button>
        </div>
        <svg viewBox={`0 0 ${W} ${H}`} className="mx-auto max-h-[60vh] w-full" style={{ aspectRatio: `${W}/${H}` }}>
          <rect width={W} height={H} fill="#0A1224" />
          {showImage && <image href={project.original} width={W} height={H} opacity={0.18} />}
          {/* margins */}
          <rect
            x={l.margins.left}
            y={l.margins.top}
            width={Math.max(0, W - l.margins.left - l.margins.right)}
            height={Math.max(0, H - l.margins.top - l.margins.bottom)}
            fill="none"
            stroke="#3B82F6"
            strokeDasharray={`${stroke * 6} ${stroke * 4}`}
            strokeWidth={stroke}
          />
          {l.columnGuides.map((x) => (
            <line key={`c${x}`} x1={x} x2={x} y1={0} y2={H} stroke="#A78BFA" strokeWidth={stroke} strokeOpacity={0.7} />
          ))}
          {l.rowGuides.map((y) => (
            <line key={`r${y}`} y1={y} y2={y} x1={0} x2={W} stroke="#FBBF24" strokeWidth={stroke} strokeOpacity={0.55} />
          ))}
          <line x1={W / 2} x2={W / 2} y1={0} y2={H} stroke="#fff" strokeOpacity={0.12} strokeWidth={stroke} />
          {a.objects.filter((o) => o.kind !== "face").map((o) => (
            <g key={o.id}>
              <rect x={o.box.x} y={o.box.y} width={o.box.width} height={o.box.height} fill="#34D399" fillOpacity={0.08} stroke="#34D399" strokeWidth={stroke} />
              <line x1={o.box.x} y1={o.box.y} x2={o.box.x + o.box.width} y2={o.box.y + o.box.height} stroke="#34D399" strokeOpacity={0.3} strokeWidth={stroke} />
              <line x1={o.box.x + o.box.width} y1={o.box.y} x2={o.box.x} y2={o.box.y + o.box.height} stroke="#34D399" strokeOpacity={0.3} strokeWidth={stroke} />
            </g>
          ))}
          {a.texts.map((t) => (
            <rect key={t.id} x={t.box.x} y={t.box.y} width={t.box.width} height={t.box.height} fill="#F472B6" fillOpacity={0.18} stroke="#F472B6" strokeWidth={stroke} rx={stroke * 2} />
          ))}
        </svg>
        <div className="mt-3 flex flex-wrap gap-4 text-[11px] text-muted-foreground">
          <Legend color="#3B82F6" label="Margins" />
          <Legend color="#A78BFA" label="Column gutters" />
          <Legend color="#FBBF24" label="Row gutters" />
          <Legend color="#34D399" label="Image blocks" />
          <Legend color="#F472B6" label="Text blocks" />
        </div>
      </div>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2">
          {metrics.map((m) => (
            <div key={m.k} className={cn("rounded-xl border border-white/[0.06] bg-surface-sunken/50 p-3", m.k === "Margins" && "col-span-2")}>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{m.k}</div>
              <div className="mt-1 font-mono text-sm capitalize text-white">{m.v}</div>
            </div>
          ))}
        </div>
        <div className="rounded-xl border border-white/[0.06] bg-surface-sunken/50 p-3">
          <div className="panel-title mb-2">Layer hierarchy</div>
          <ol className="space-y-2">
            {l.hierarchy.map((h, i) => (
              <li key={h.id} className="flex items-center gap-2 text-xs">
                <span className="w-4 font-mono text-muted-foreground">{i + 1}</span>
                <span className="min-w-0 flex-1 truncate text-white">{h.label}</span>
                <div className="h-1.5 w-16 rounded-full bg-white/[0.06]">
                  <div className="h-full rounded-full bg-brand" style={{ width: `${(h.weight / (l.hierarchy[0]?.weight || 1)) * 100}%` }} />
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}

function MetadataTab({ project }: { project: Project }) {
  const m = project.analysis.metadata;
  const rows = [
    ["Dimensions", `${m.width} × ${m.height}px`],
    ["Aspect ratio", `${m.aspectRatio} (${m.aspectDecimal})`],
    ["Orientation", m.orientation],
    ["Megapixels", `${m.megapixels} MP`],
    ["File", m.fileName],
    ["Size", formatBytes(m.fileSize)],
    ["Format", m.mimeType],
    ["Tone", m.dominantTone],
    ["Colourfulness", String(m.colorfulness)],
    ["Edge density", String(m.edgeDensity)],
  ];
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-4">
        <div className="rounded-xl border border-brand/25 bg-brand/[0.06] p-5">
          <div className="panel-title text-brand/80">Estimated design type</div>
          <div className="mt-2 flex items-baseline justify-between gap-2">
            <span className="font-display text-2xl font-bold text-white">{m.designType.label}</span>
            <span className="font-display text-2xl font-bold text-brand">{Math.round(m.designType.confidence * 100)}%</span>
          </div>
        </div>
        <div className="rounded-xl border border-white/[0.06] bg-surface-sunken/50 p-4">
          <div className="panel-title mb-3">Design category confidence</div>
          <div className="space-y-3">
            {m.categories.map((c) => (
              <div key={c.label}>
                <div className="mb-1 flex justify-between text-xs">
                  <span className="text-white">{c.label}</span>
                  <span className="font-mono text-muted-foreground">{Math.round(c.confidence * 100)}%</span>
                </div>
                <Progress value={c.confidence * 100} />
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="space-y-4">
        <div className="overflow-hidden rounded-xl border border-white/[0.06]">
          {rows.map(([k, v]) => (
            <div key={k} className="flex items-center justify-between gap-4 border-b border-white/[0.04] px-4 py-2.5 text-sm last:border-0">
              <span className="text-muted-foreground">{k}</span>
              <span className="truncate text-right capitalize text-white">{v}</span>
            </div>
          ))}
        </div>
        <div className="rounded-xl border border-white/[0.06] bg-surface-sunken/50 p-4">
          <div className="panel-title mb-3 flex items-center gap-1.5"><Cpu className="h-3 w-3" /> Engines</div>
          <div className="space-y-2">
            {project.analysis.engines.map((e) => (
              <div key={e.id} className="flex items-center justify-between gap-2 text-xs">
                <span className="text-white">{e.label}</span>
                <span className="flex items-center gap-2">
                  {e.status === "ok" && <span className="font-mono text-muted-foreground">{e.durationMs}ms</span>}
                  <Badge variant={e.status === "ok" ? "success" : e.status === "error" ? "danger" : "secondary"}>{e.status}</Badge>
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function DnaTab({ project }: { project: Project }) {
  const d = project.analysis.dna;
  const sections = [
    { k: "Typography", s: d.typography },
    { k: "Colour", s: d.color },
    { k: "Layout", s: d.layout },
  ];
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-4">
        <ScoreRing label="Overall DNA" value={d.overall} big />
        {sections.map((x) => (
          <ScoreRing key={x.k} label={`${x.k} score`} value={x.s.score} />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        {sections.map((x) => (
          <div key={x.k} className="rounded-xl border border-white/[0.06] bg-surface-sunken/50 p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm font-semibold text-white">{x.k}</span>
              <span className="font-mono text-sm text-brand">{x.s.score}</span>
            </div>
            <div className="space-y-3">
              {x.s.checks.map((c) => (
                <div key={c.label}>
                  <div className="mb-1 flex justify-between text-xs">
                    <span className="text-slate-200">{c.label}</span>
                    <span className="font-mono text-muted-foreground">{c.score}</span>
                  </div>
                  <Progress value={c.score} tone="auto" />
                  <p className="mt-1 text-[11px] text-muted-foreground">{c.note}</p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ScoreRing({ label, value, big }: { label: string; value: number; big?: boolean }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  return (
    <div className={cn("flex items-center gap-4 rounded-xl border p-4", big ? "border-brand/30 bg-brand/[0.06]" : "border-white/[0.06] bg-surface-sunken/50")}>
      <svg viewBox="0 0 80 80" className="h-16 w-16 -rotate-90">
        <circle cx="40" cy="40" r={r} fill="none" stroke="rgba(255,255,255,.07)" strokeWidth="7" />
        <motion.circle
          cx="40"
          cy="40"
          r={r}
          fill="none"
          stroke={value >= 80 ? "#34D399" : value >= 60 ? "#FBBF24" : "#FB7185"}
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - value / 100) }}
          transition={{ duration: 1, ease: "easeOut" }}
        />
      </svg>
      <div>
        <div className="font-display text-2xl font-bold text-white">{value}</div>
        <div className="text-xs text-muted-foreground">{label}</div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function CopyButton({ value, label }: { value: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      variant="ghost"
      size={label ? "sm" : "icon-sm"}
      onClick={() => {
        navigator.clipboard?.writeText(value);
        setDone(true);
        setTimeout(() => setDone(false), 1200);
      }}
      aria-label={`Copy ${value}`}
    >
      {done ? <Check className="text-emerald-400" /> : <Copy />}
      {label}
    </Button>
  );
}

function ConfidenceDot({ v }: { v: number }) {
  return (
    <span className="flex items-center gap-1 font-mono text-[10px] text-muted-foreground">
      <span className={cn("h-1.5 w-1.5 rounded-full", v >= 0.75 ? "bg-emerald-400" : v >= 0.55 ? "bg-amber-400" : "bg-rose-400")} />
      {Math.round(v * 100)}%
    </span>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="h-2.5 w-2.5 rounded-sm" style={{ background: color }} /> {label}
    </span>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="rounded-xl border border-dashed border-white/10 px-4 py-8 text-center text-sm text-muted-foreground">{text}</p>;
}
