import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={cn("h-9 w-9", className)} aria-hidden>
      <defs>
        <linearGradient id="lm" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#A5F3FC" />
          <stop offset=".45" stopColor="#22D3EE" />
          <stop offset="1" stopColor="#8B5CF6" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill="#0A0F1E" stroke="rgba(34,211,238,.4)" />
      <path d="M14 16h36v8H36v26h-8V24H14z" fill="url(#lm)" />
      <path d="M14 30h10v6H14zM40 30h10v6H40zM14 42h10v6H14zM40 42h10v6H40z" fill="#8B5CF6" opacity=".6" />
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
          <div className="mt-1 text-[10px] font-semibold uppercase tracking-[0.28em] text-brand">AI Studio</div>
        </div>
      )}
    </div>
  );
}
