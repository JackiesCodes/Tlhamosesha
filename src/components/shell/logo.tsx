import { MARK_PATH, MARK_VIEWBOX } from "@/lib/brand-mark";
import { BRAND } from "@/lib/brand";
import { cn } from "@/lib/utils";

/** The Decon mark. Uses the current text colour, so it follows the theme. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox={MARK_VIEWBOX} className={cn("h-9 w-9 text-white", className)} aria-hidden>
      <path d={MARK_PATH} fill="currentColor" />
    </svg>
  );
}

export function Logo({ collapsed }: { collapsed?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <LogoMark className="h-8 w-8" />
      {!collapsed && (
        <div className="leading-none">
          <div className="font-display text-[17px] font-bold tracking-tight text-white">{BRAND.name}</div>
          <div className="mt-1 whitespace-nowrap text-[11px] font-medium text-muted-foreground">{BRAND.tagline}</div>
        </div>
      )}
    </div>
  );
}
