"use client";
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { BarChart3 } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { hueFamily } from "@/lib/color";
import { allProjects } from "@/lib/store/db";
import type { Project } from "@/lib/types";

type Row = { label: string; value: number; display?: string; swatch?: string };

export default function AnalyticsPage() {
  const [projects, setProjects] = useState<Project[] | null>(null);
  useEffect(() => {
    allProjects().then(setProjects);
  }, []);

  const stats = useMemo(() => {
    const ps = projects ?? [];
    const count = <T,>(items: T[], key: (t: T) => string) => {
      const m = new Map<string, number>();
      for (const it of items) m.set(key(it), (m.get(key(it)) ?? 0) + 1);
      return [...m.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
    };
    const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0);
    const objects = ps.flatMap((p) => p.analysis.objects);
    const texts = ps.flatMap((p) => p.analysis.texts);
    const colors = ps.flatMap((p) => p.analysis.palette.map((c) => ({ ...c, fam: hueFamily(c.hex) })));
    const famSwatch = new Map<string, string>();
    for (const c of colors) if (!famSwatch.has(c.fam)) famSwatch.set(c.fam, c.hex);
    return {
      total: ps.length,
      assets: objects.length,
      texts: texts.length,
      avgDna: avg(ps.map((p) => p.analysis.dna.overall)),
      types: count(ps, (p) => p.analysis.metadata.designType.label),
      objectKinds: count(objects, (o) => o.kind),
      fonts: count(texts, (t) => t.font.family).slice(0, 6),
      hues: count(colors, (c) => c.fam).slice(0, 8).map((r) => ({ ...r, swatch: famSwatch.get(r.label) })),
      dna: [
        { label: "Typography", value: avg(ps.map((p) => p.analysis.dna.typography.score)) },
        { label: "Colour", value: avg(ps.map((p) => p.analysis.dna.color.score)) },
        { label: "Layout", value: avg(ps.map((p) => p.analysis.dna.layout.score)) },
      ],
    };
  }, [projects]);

  return (
    <div className="mx-auto max-w-[1400px] space-y-6 px-4 py-8 sm:px-8">
      <PageHeader eyebrow="Analytics" title="Design intelligence" description="Patterns across every poster you have broken down." />

      {projects && projects.length === 0 ? (
        <div className="panel flex flex-col items-center gap-3 px-6 py-16 text-center">
          <BarChart3 className="h-10 w-10 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Analytics appear once you have analysed a poster.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {[
              { k: "Posters analysed", v: stats.total },
              { k: "Assets extracted", v: stats.assets },
              { k: "Text layers read", v: stats.texts },
              { k: "Average DNA score", v: stats.avgDna },
            ].map((s, i) => (
              <motion.div key={s.k} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="panel p-5">
                <div className="text-xs text-muted-foreground">{s.k}</div>
                <div className="mt-2 font-display text-3xl font-bold text-white">{s.v}</div>
              </motion.div>
            ))}
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <BarCard title="Design types" description="Top classification per poster" rows={stats.types} />
            <BarCard title="Average Design DNA" description="Mean score out of 100" rows={stats.dna} max={100} />
            <BarCard title="Extracted asset kinds" description="Objects isolated as transparent PNGs" rows={stats.objectKinds} />
            <BarCard title="Estimated typefaces" description="Most frequent font families across text layers" rows={stats.fonts} />
            <BarCard title="Colour families" description="Palette entries grouped by hue" rows={stats.hues} />
          </div>
        </>
      )}
    </div>
  );
}

function BarCard({ title, description, rows, max }: { title: string; description: string; rows: Row[]; max?: number }) {
  const top = max ?? Math.max(1, ...rows.map((r) => r.value));
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {rows.length === 0 && <p className="text-sm text-muted-foreground">No data yet.</p>}
        {rows.map((r) => (
          <div key={r.label} className="group grid grid-cols-[120px_1fr_40px] items-center gap-3 text-sm" title={`${r.label}: ${r.value}`}>
            <span className="flex items-center gap-2 truncate capitalize text-slate-300">
              {r.swatch && <span className="h-2.5 w-2.5 shrink-0 rounded-full border border-white/20" style={{ background: r.swatch }} />}
              {r.label}
            </span>
            <div className="h-2.5 rounded-full bg-white/[0.04]">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${(r.value / top) * 100}%` }}
                transition={{ duration: 0.7, ease: "easeOut" }}
                className="h-full rounded-full bg-gold transition group-hover:brightness-125"
              />
            </div>
            <span className="text-right font-mono text-xs text-white">{r.value}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
