"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { ChevronsLeft, ChevronsRight, Sparkles } from "lucide-react";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { Logo } from "./logo";
import { NAV_ITEMS, isActive } from "./nav-items";

export function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const pathname = usePathname();
  return (
    <motion.aside
      animate={{ width: collapsed ? 76 : 248 }}
      transition={{ type: "spring", stiffness: 320, damping: 34 }}
      className="relative hidden shrink-0 flex-col border-r border-white/[0.06] bg-surface/60 backdrop-blur-xl lg:flex"
    >
      <div className={cn("flex h-16 items-center", collapsed ? "justify-center" : "px-5")}>
        <Link href="/" aria-label="Tlhamosesha AI home">
          <Logo collapsed={collapsed} />
        </Link>
      </div>

      <nav className="mt-4 flex flex-1 flex-col gap-1 px-3">
        {!collapsed && <div className="panel-title mb-2 px-3">Workspace</div>}
        {NAV_ITEMS.map((item) => {
          const active = isActive(pathname, item.href);
          const link = (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "group relative flex h-10 items-center gap-3 rounded-xl text-sm font-medium transition-colors",
                collapsed ? "justify-center" : "px-3",
                active ? "text-white" : "text-muted-foreground hover:bg-white/[0.04] hover:text-white",
              )}
            >
              {active && (
                <motion.span
                  layoutId="nav-active"
                  className="absolute inset-0 rounded-xl border border-brand/25 bg-gradient-to-r from-brand/15 to-transparent"
                  transition={{ type: "spring", stiffness: 400, damping: 36 }}
                />
              )}
              <item.icon className={cn("relative h-[18px] w-[18px]", active && "text-brand")} />
              {!collapsed && <span className="relative">{item.label}</span>}
            </Link>
          );
          return collapsed ? (
            <Tooltip key={item.href} content={item.label} side="right">
              {link}
            </Tooltip>
          ) : (
            link
          );
        })}
      </nav>

      {!collapsed && (
        <div className="mx-3 mb-3 rounded-2xl border border-brand/20 bg-gradient-to-br from-brand/10 via-plasma/[0.06] to-transparent p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-white">
            <Sparkles className="h-4 w-4 text-brand" /> Vision Ensemble
          </div>
          <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
            Connect OpenAI, Gemini or Claude Vision to improve detection and font matching.
          </p>
          <Link href="/settings" className="mt-3 inline-block text-xs font-semibold text-brand hover:underline">
            Configure engines →
          </Link>
        </div>
      )}

      <button
        onClick={onToggle}
        className="mx-3 mb-4 flex h-9 items-center justify-center gap-2 rounded-lg text-xs text-muted-foreground transition hover:bg-white/[0.05] hover:text-white"
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        {collapsed ? <ChevronsRight className="h-4 w-4" /> : (<><ChevronsLeft className="h-4 w-4" /> Collapse</>)}
      </button>
    </motion.aside>
  );
}
