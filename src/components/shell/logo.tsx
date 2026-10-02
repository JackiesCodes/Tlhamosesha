import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={cn("h-9 w-9", className)} aria-hidden>
      <rect width="64" height="64" rx="16" fill="#18181B" stroke="rgba(255,255,255,.1)" />
      {/* A "D" split into stem and bowl: the mark itself is deconstructed. */}
      <rect x="14" y="14" width="8" height="36" rx="1.5" fill="#3B82F6" />
      <path d="M27 14h7a18 18 0 0 1 0 36h-7v-8h7a10 10 0 0 0 0-20h-7z" fill="#3B82F6" />
    </svg>
  );
}

export function Logo({ collapsed }: { collapsed?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <LogoMark />
      {!collapsed && (
        <div className="leading-none">
          <div className="font-display text-[17px] font-bold tracking-tight text-white">Decon</div>
          <div className="mt-1 whitespace-nowrap text-[11px] font-medium text-muted-foreground">Visual Reverse Engineering</div>
        </div>
      )}
    </div>
  );
}
