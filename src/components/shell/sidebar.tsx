"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { ChevronsLeft, ChevronsRight, ShieldCheck } from "lucide-react";
import { Tooltip } from "@/components/ui/tooltip";
import { BRAND } from "@/lib/brand";
import { cn } from "@/lib/utils";
import { Logo } from "./logo";
import { NAV_ITEMS, isActive } from "./nav-items";

export function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const pathname = usePathname();
  return (
    <motion.aside
      animate={{ width: collapsed ? 76 : 248 }}
      transition={{ type: "spring", stiffness: 320, damping: 34 }}
      className="relative hidden shrink-0 flex-col border-r border-white/[0.06] bg-surface lg:flex"
    >
      <div className={cn("flex h-16 items-center", collapsed ? "justify-center" : "px-5")}>
        <Link href="/home" aria-label={`${BRAND.name} home`}>
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
                  className="absolute inset-0 rounded-xl bg-white/[0.07]"
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
        <div className="mx-3 mb-3 space-y-2 px-3 text-[11px] leading-relaxed text-muted-foreground">
          <p className="flex items-start gap-2">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Projects are saved in this browser only. Back them up from Settings.
          </p>
          <p className="flex gap-3">
            <Link href="/privacy" className="hover:text-white">Privacy</Link>
            <Link href="/terms" className="hover:text-white">Terms</Link>
          </p>
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
