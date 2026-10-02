import { cn } from "@/lib/utils";

export function Progress({ value, className, tone = "brand" }: { value: number; className?: string; tone?: "brand" | "auto" }) {
  const v = Math.max(0, Math.min(100, value));
  const color =
    tone === "auto" ? (v >= 80 ? "bg-emerald-400" : v >= 60 ? "bg-amber-400" : "bg-rose-400") : "bg-brand";
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-white/[0.07]", className)}>
      <div className={cn("h-full rounded-full transition-[width] duration-700 ease-out", color)} style={{ width: `${v}%` }} />
    </div>
  );
}
