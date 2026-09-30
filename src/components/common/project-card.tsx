"use client";
import Link from "next/link";
import { motion } from "framer-motion";
import { Layers, MoreHorizontal, Palette, Shapes, Star, Trash2, Type } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { ProjectSummary } from "@/lib/types";
import { cn, timeAgo } from "@/lib/utils";

export function ProjectCard({
  p,
  onDelete,
  onStar,
  index = 0,
}: {
  p: ProjectSummary;
  onDelete?: () => void;
  onStar?: () => void;
  index?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.04, 0.4), duration: 0.35 }}
      className="group relative overflow-hidden rounded-2xl border border-white/[0.06] bg-surface/70 transition hover:border-gold/30 hover:shadow-glow"
    >
      <Link href={`/projects/${p.id}`} className="block">
        <div className="relative aspect-[4/3] overflow-hidden bg-surface-sunken">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={p.thumbnail} alt={p.name} className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.04]" />
          <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/10 to-transparent" />
          <Badge className="absolute left-3 top-3 border-white/10 bg-ink/70 text-white backdrop-blur">
            {p.designType} · {Math.round(p.confidence * 100)}%
          </Badge>
          <div className="absolute bottom-3 right-3 flex h-10 w-10 items-center justify-center rounded-full border border-gold/40 bg-ink/80 text-xs font-bold text-gold backdrop-blur">
            {p.dnaOverall}
          </div>
        </div>
        <div className="p-4">
          <div className="truncate font-medium text-white">{p.name}</div>
          <div className="mt-1 text-xs text-muted-foreground">
            {p.width}×{p.height} · edited {timeAgo(p.updatedAt)}
          </div>
          <div className="mt-3 flex items-center gap-3 text-[11px] text-slate-400">
            <span className="flex items-center gap-1"><Type className="h-3 w-3" />{p.counts.texts}</span>
            <span className="flex items-center gap-1"><Shapes className="h-3 w-3" />{p.counts.objects}</span>
            <span className="flex items-center gap-1"><Palette className="h-3 w-3" />{p.counts.colors}</span>
            <span className="flex items-center gap-1"><Layers className="h-3 w-3" />{p.counts.layers}</span>
          </div>
        </div>
      </Link>
      {(onDelete || onStar) && (
        <div className="absolute right-2 top-2 flex gap-1">
          {onStar && (
            <button
              onClick={onStar}
              aria-label="Star project"
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-lg bg-ink/70 backdrop-blur transition",
                p.starred ? "text-gold" : "text-white/60 opacity-0 hover:text-white group-hover:opacity-100",
              )}
            >
              <Star className={cn("h-4 w-4", p.starred && "fill-gold")} />
            </button>
          )}
          {onDelete && (
            <DropdownMenu>
              <DropdownMenuTrigger className="flex h-8 w-8 items-center justify-center rounded-lg bg-ink/70 text-white/70 opacity-0 backdrop-blur transition hover:text-white group-hover:opacity-100 data-[state=open]:opacity-100">
                <MoreHorizontal className="h-4 w-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={onDelete} className="text-rose-300 focus:text-rose-200">
                  <Trash2 className="!text-rose-300" /> Delete project
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      )}
    </motion.div>
  );
}
