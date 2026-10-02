"use client";
import { useCallback, useEffect, useState } from "react";
import { MotionConfig } from "framer-motion";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useApp, useLibrary } from "@/lib/store/app";
import { CommandPalette } from "./command-palette";
import { MobileNav } from "./mobile-nav";
import { Sidebar } from "./sidebar";
import { TopNav } from "./topnav";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const refresh = useLibrary((s) => s.refresh);
  const reduceMotion = useApp((s) => s.settings.reduceMotion);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const openSearch = useCallback(() => setSearchOpen(true), []);

  return (
    <MotionConfig reducedMotion={reduceMotion ? "always" : "user"}>
      <TooltipProvider>
        <div className="flex min-h-dvh bg-ink">
          <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(34,211,238,0.09),transparent_50%),radial-gradient(ellipse_at_bottom_left,rgba(139,92,246,0.10),transparent_55%)]" />
          <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
          <div className="relative flex min-w-0 flex-1 flex-col">
            <TopNav onSearch={openSearch} />
            <main className="flex-1 pb-24 lg:pb-0">{children}</main>
          </div>
          <MobileNav />
          <CommandPalette open={searchOpen} onOpenChange={setSearchOpen} />
        </div>
      </TooltipProvider>
    </MotionConfig>
  );
}
