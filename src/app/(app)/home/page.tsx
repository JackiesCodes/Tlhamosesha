"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowRight, Boxes, Layers, Shapes, Type } from "lucide-react";
import { Dropzone } from "@/components/common/dropzone";
import { ProjectCard } from "@/components/common/project-card";
import { Button } from "@/components/ui/button";
import { SAMPLES } from "@/lib/samples";
import { fileToInput, useAnalyze } from "@/lib/store/analyze";
import { useLibrary } from "@/lib/store/app";

export default function HomePage() {
  const router = useRouter();
  const { summaries, loaded } = useLibrary();
  const setInput = useAnalyze((s) => s.setInput);

  const onFile = async (f: File) => {
    setInput(await fileToInput(f));
    router.push("/upload?autostart=1");
  };

  const totals = summaries.reduce(
    (acc, p) => ({ objects: acc.objects + p.counts.objects, texts: acc.texts + p.counts.texts, layers: acc.layers + p.counts.layers }),
    { objects: 0, texts: 0, layers: 0 },
  );
  const hasProjects = loaded && summaries.length > 0;

  return (
    <div className="mx-auto max-w-[1400px] space-y-10 px-4 py-8 sm:px-8">
      <section className="grid items-stretch gap-6 lg:grid-cols-[1fr_1.15fr]">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="panel flex flex-col justify-between p-7 sm:p-9"
        >
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight text-white sm:text-3xl">
              {hasProjects ? "Welcome back" : "Break down your first design"}
            </h1>
            <p className="mt-3 max-w-lg text-sm leading-relaxed text-muted-foreground">
              Drop in a poster, banner, flyer or social graphic. Decon separates its text, images, logos, background, colours and
              layout, then rebuilds it as layers you can edit and export.
            </p>
          </div>
          <div className="mt-8 grid grid-cols-3 gap-3">
            {[
              { k: "Projects", v: summaries.length, icon: Boxes },
              { k: "Assets extracted", v: totals.objects, icon: Shapes },
              { k: "Text layers", v: totals.texts, icon: Type },
            ].map((s) => (
              <div key={s.k} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                <s.icon className="h-4 w-4 text-muted-foreground" />
                <div className="mt-2 font-display text-2xl font-bold text-white">{s.v}</div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">{s.k}</div>
              </div>
            ))}
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: 0.05 }}>
          <Dropzone onFile={onFile} className="h-full" />
        </motion.div>
      </section>

      <section>
        <div className="mb-4 flex items-end justify-between">
          <div>
            <h2 className="font-display text-lg font-semibold text-white">Recent projects</h2>
            <p className="text-sm text-muted-foreground">Saved in this browser.</p>
          </div>
          {hasProjects && (
            <Button variant="ghost" size="sm" asChild>
              <Link href="/projects">
                All projects <ArrowRight />
              </Link>
            </Button>
          )}
        </div>
        {loaded && summaries.length === 0 ? (
          <div className="panel flex flex-col items-center gap-2 px-6 py-12 text-center">
            <Layers className="h-7 w-7 text-muted-foreground" />
            <p className="text-sm font-medium text-white">No projects yet</p>
            <p className="max-w-sm text-sm text-muted-foreground">Upload an image above, or open one of the examples below to see how a breakdown works.</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {summaries.slice(0, 4).map((p, i) => (
              <ProjectCard key={p.id} p={p} index={i} />
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="mb-4 flex items-end justify-between">
          <div>
            <h2 className="font-display text-lg font-semibold text-white">Examples</h2>
            <p className="text-sm text-muted-foreground">Open an example to explore a finished breakdown.</p>
          </div>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/templates">
              Browse templates <ArrowRight />
            </Link>
          </Button>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          {SAMPLES.map((s) => (
            <button
              key={s.id}
              onClick={() => router.push(`/upload?sample=${s.id}`)}
              className="group flex items-center gap-4 rounded-xl border border-white/[0.06] bg-surface p-3 text-left transition hover:border-white/15"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={s.src} alt="" className="h-16 w-16 shrink-0 rounded-lg object-cover" />
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-white">{s.name}</div>
                <div className="text-xs text-muted-foreground">{s.category}</div>
              </div>
              <ArrowRight className="ml-auto h-4 w-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-white" />
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
