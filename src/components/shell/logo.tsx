import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={cn("h-9 w-9", className)} aria-hidden>
      <rect width="64" height="64" rx="16" fill="#18181B" stroke="rgba(255,255,255,.1)" />
      <path d="M14 16h36v8H36v26h-8V24H14z" fill="#3B82F6" />
      <path d="M14 30h10v6H14zM40 30h10v6H40zM14 42h10v6H14zM40 42h10v6H40z" fill="#FAFAFA" opacity=".35" />
    </svg>
  );
}

export function Logo({ collapsed }: { collapsed?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <LogoMark />
      {!collapsed && (
        <div className="leading-none">
          <div className="font-display text-[15px] font-bold tracking-tight text-white">Tlhamosesha</div>
          <div className="mt-1 text-[10px] font-semibold uppercase tracking-[0.28em] text-muted-foreground">AI Studio</div>
        </div>
      )}
    </div>
  );
}
