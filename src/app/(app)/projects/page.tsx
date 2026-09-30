"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { FolderOpen, Plus, Search, Star } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { ProjectCard } from "@/components/common/project-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getProject } from "@/lib/store/db";
import { useLibrary } from "@/lib/store/app";
import { cn } from "@/lib/utils";

type Sort = "recent" | "name" | "dna";

export default function ProjectsPage() {
  const { summaries, loaded, remove, save } = useLibrary();
  const [q, setQ] = useState("");
  const [type, setType] = useState<string>("All");
  const [sort, setSort] = useState<Sort>("recent");
  const [starredOnly, setStarredOnly] = useState(false);

  const types = useMemo(() => ["All", ...new Set(summaries.map((s) => s.designType))], [summaries]);
  const list = useMemo(() => {
    const s = q.toLowerCase();
    return summaries
      .filter((p) => (type === "All" || p.designType === type) && (!starredOnly || p.starred))
      .filter((p) => !s || p.name.toLowerCase().includes(s) || p.designType.toLowerCase().includes(s))
      .sort((a, b) => (sort === "name" ? a.name.localeCompare(b.name) : sort === "dna" ? b.dnaOverall - a.dnaOverall : b.updatedAt.localeCompare(a.updatedAt)));
  }, [summaries, q, type, sort, starredOnly]);

  const toggleStar = async (id: string) => {
    const p = await getProject(id);
    if (p) await save({ ...p, starred: !p.starred });
  };

  return (
    <div className="mx-auto max-w-[1400px] space-y-6 px-4 py-8 sm:px-8">
      <PageHeader
        eyebrow="Library"
        title="Projects"
        description="Every breakdown with its assets, analysis and editable reconstruction."
        actions={
          <Button asChild>
            <Link href="/upload">
              <Plus /> New breakdown
            </Link>
          </Button>
        }
      />

      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search projects" className="pl-9" />
        </div>
        <div className="scrollbar-thin flex gap-1.5 overflow-x-auto">
          {types.map((t) => (
            <button
              key={t}
              onClick={() => setType(t)}
              className={cn(
                "whitespace-nowrap rounded-full border px-3 py-1.5 text-xs transition",
                type === t ? "border-gold/50 bg-gold/10 text-gold-200" : "border-white/[0.08] text-muted-foreground hover:text-white",
              )}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <Button variant={starredOnly ? "outline" : "ghost"} size="sm" onClick={() => setStarredOnly((v) => !v)}>
            <Star className={cn(starredOnly && "fill-gold text-gold")} /> Starred
          </Button>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as Sort)}
            className="h-8 rounded-lg border border-white/[0.08] bg-surface-sunken px-2 text-xs text-white"
          >
            <option value="recent">Most recent</option>
            <option value="name">Name</option>
            <option value="dna">DNA score</option>
          </select>
        </div>
      </div>

      {loaded && list.length === 0 ? (
        <div className="panel flex flex-col items-center gap-3 px-6 py-16 text-center">
          <FolderOpen className="h-10 w-10 text-muted-foreground" />
          <p className="font-medium text-white">{summaries.length ? "No projects match your filters" : "No projects yet"}</p>
          <p className="text-sm text-muted-foreground">Upload a poster to create your first breakdown.</p>
          <Button asChild className="mt-2">
            <Link href="/upload">Upload a poster</Link>
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {list.map((p, i) => (
            <ProjectCard
              key={p.id}
              p={p}
              index={i}
              onStar={() => toggleStar(p.id)}
              onDelete={() => {
                if (confirm(`Delete “${p.name}”? This cannot be undone.`)) remove(p.id);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
