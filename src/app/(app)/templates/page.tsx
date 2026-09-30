"use client";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Wand2 } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SAMPLES } from "@/lib/samples";
import { useLibrary } from "@/lib/store/app";

export default function TemplatesPage() {
  const router = useRouter();
  const summaries = useLibrary((s) => s.summaries);
  const best = [...summaries].sort((a, b) => b.dnaOverall - a.dnaOverall).slice(0, 4);

  return (
    <div className="mx-auto max-w-[1400px] space-y-10 px-4 py-8 sm:px-8">
      <PageHeader
        eyebrow="Templates"
        title="Start from a template"
        description="Break down a curated sample, or reuse one of your highest-scoring reconstructions as a starting point."
      />

      <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {SAMPLES.map((s, i) => (
          <motion.div
            key={s.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06 }}
            className="panel group overflow-hidden"
          >
            <div className="relative flex aspect-[4/3] items-center justify-center overflow-hidden bg-surface-sunken p-6">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={s.src} alt={s.name} className="max-h-full rounded-lg object-contain shadow-panel transition duration-500 group-hover:scale-[1.03]" />
            </div>
            <div className="space-y-3 p-5">
              <div className="flex items-center justify-between gap-2">
                <div className="font-display font-semibold text-white">{s.name}</div>
                <Badge variant="secondary">{s.size}</Badge>
              </div>
              <p className="text-sm text-muted-foreground">{s.blurb}</p>
              <div className="flex items-center justify-between">
                <Badge>{s.category}</Badge>
                <Button size="sm" onClick={() => router.push(`/upload?sample=${s.id}`)}>
                  <Wand2 /> Break down
                </Button>
              </div>
            </div>
          </motion.div>
        ))}
      </section>

      {best.length > 0 && (
        <section>
          <h2 className="mb-4 font-display text-lg font-semibold text-white">From your library</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {best.map((p) => (
              <button
                key={p.id}
                onClick={() => router.push(`/projects/${p.id}?mode=reconstruct`)}
                className="panel group overflow-hidden text-left transition hover:border-gold/30"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.thumbnail} alt="" className="aspect-[4/3] w-full object-cover" />
                <div className="p-4">
                  <div className="truncate text-sm font-medium text-white">{p.name}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {p.designType} · DNA {p.dnaOverall} · {p.counts.layers} layers
                  </div>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
