"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowRight, Boxes, Eraser, Grid3X3, Palette, ScanText, Shapes, Sparkles, Wand2 } from "lucide-react";
import { Dropzone } from "@/components/common/dropzone";
import { ProjectCard } from "@/components/common/project-card";
import { Button } from "@/components/ui/button";
import { SAMPLES } from "@/lib/samples";
import { fileToInput, useAnalyze } from "@/lib/store/analyze";
import { useApp, useLibrary } from "@/lib/store/app";

const CAPABILITIES = [
  { icon: ScanText, title: "Text & typography", body: "OCR every line, then estimate font family, weight, size and role." },
  { icon: Shapes, title: "Objects & logos", body: "Players, products, badges and sponsor marks isolated as PNGs." },
  { icon: Eraser, title: "Background plates", body: "Clean background, gradient, texture, blur, overlay and lighting." },
  { icon: Palette, title: "Colour system", body: "Primary, secondary and accent palettes in HEX, RGB and HSL." },
  { icon: Grid3X3, title: "Layout & grid", body: "Columns, rows, margins, spacing and a wireframe of the hierarchy." },
  { icon: Wand2, title: "Editable rebuild", body: "A layered scene you can edit, then export to PNG, SVG, PDF or JSON." },
];

export default function HomePage() {
  const router = useRouter();
  const { summaries, loaded } = useLibrary();
  const name = useApp((s) => s.settings.displayName.split(" ")[0]);
  const setInput = useAnalyze((s) => s.setInput);

  const onFile = async (f: File) => {
    setInput(await fileToInput(f));
    router.push("/upload?autostart=1");
  };

  const totals = summaries.reduce(
    (acc, p) => ({
      objects: acc.objects + p.counts.objects,
      texts: acc.texts + p.counts.texts,
      colors: acc.colors + p.counts.colors,
    }),
    { objects: 0, texts: 0, colors: 0 },
  );

  return (
    <div className="mx-auto max-w-[1400px] space-y-10 px-4 py-8 sm:px-8">
      {/* Hero */}
      <section className="grid items-stretch gap-6 lg:grid-cols-[1.1fr_1fr]">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="panel relative flex flex-col justify-between overflow-hidden p-7 sm:p-10"
        >
          <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-brand/10 blur-3xl" />
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-brand/25 bg-brand/10 px-3 py-1 text-xs font-medium text-brand-200">
              <Sparkles className="h-3.5 w-3.5" /> Good to see you, {name}
            </div>
            <h1 className="mt-5 font-display text-3xl font-bold leading-[1.1] tracking-tight text-white sm:text-5xl">
              Reverse-engineer <span className="text-brand-gradient">any poster</span> into editable layers.
            </h1>
            <p className="mt-4 max-w-xl text-base text-muted-foreground">
              Tlhamosesha AI reads the text, isolates every object, rebuilds the background and maps the grid, then hands you a fully
              editable reconstruction.
            </p>
          </div>
          <div className="mt-8 grid grid-cols-3 gap-3">
            {[
              { k: "Projects", v: summaries.length },
              { k: "Assets extracted", v: totals.objects },
              { k: "Text layers", v: totals.texts },
            ].map((s) => (
              <div key={s.k} className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
                <div className="font-display text-2xl font-bold text-white">{s.v}</div>
                <div className="mt-1 text-[11px] uppercase tracking-wider text-muted-foreground">{s.k}</div>
              </div>
            ))}
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.08 }}>
          <Dropzone onFile={onFile} className="h-full" />
        </motion.div>
      </section>

      {/* Samples */}
      <section>
        <div className="mb-4 flex items-end justify-between">
          <div>
            <h2 className="font-display text-lg font-semibold text-white">Try a sample poster</h2>
            <p className="text-sm text-muted-foreground">See the full pipeline without uploading anything.</p>
          </div>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/templates">
              All templates <ArrowRight />
            </Link>
          </Button>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          {SAMPLES.map((s, i) => (
            <motion.button
              key={s.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 + i * 0.05 }}
              onClick={() => router.push(`/upload?sample=${s.id}`)}
              className="group flex items-center gap-4 rounded-2xl border border-white/[0.06] bg-surface/70 p-3 text-left transition hover:border-brand/30"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={s.src} alt={s.name} className="h-20 w-20 shrink-0 rounded-xl object-cover" />
              <div className="min-w-0">
                <div className="truncate font-medium text-white">{s.name}</div>
                <div className="text-xs text-brand/90">{s.category}</div>
                <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">{s.blurb}</div>
              </div>
              <ArrowRight className="ml-auto h-4 w-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-brand" />
            </motion.button>
          ))}
        </div>
      </section>

      {/* Recent */}
      <section>
        <div className="mb-4 flex items-end justify-between">
          <div>
            <h2 className="font-display text-lg font-semibold text-white">Recent breakdowns</h2>
            <p className="text-sm text-muted-foreground">Pick up where you left off.</p>
          </div>
          {summaries.length > 0 && (
            <Button variant="ghost" size="sm" asChild>
              <Link href="/projects">
                View all <ArrowRight />
              </Link>
            </Button>
          )}
        </div>
        {loaded && summaries.length === 0 ? (
          <div className="panel flex flex-col items-center gap-3 px-6 py-12 text-center">
            <Boxes className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No projects yet. Drop a poster above or try a sample to get started.</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {summaries.slice(0, 4).map((p, i) => (
              <ProjectCard key={p.id} p={p} index={i} />
            ))}
          </div>
        )}
      </section>

      {/* Capabilities */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {CAPABILITIES.map((c, i) => (
          <motion.div
            key={c.title}
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.04 }}
            className="panel p-5"
          >
            <c.icon className="h-5 w-5 text-brand" />
            <div className="mt-3 font-medium text-white">{c.title}</div>
            <p className="mt-1 text-sm text-muted-foreground">{c.body}</p>
          </motion.div>
        ))}
      </section>
    </div>
  );
}
