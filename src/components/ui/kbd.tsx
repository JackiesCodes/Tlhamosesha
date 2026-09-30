import { cn } from "@/lib/utils";

export function Kbd({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <kbd className={cn("inline-flex h-5 items-center rounded border border-white/10 bg-white/[0.05] px-1.5 font-mono text-[10px] text-muted-foreground", className)}>
      {children}
    </kbd>
  );
}
