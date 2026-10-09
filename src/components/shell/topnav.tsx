"use client";
import Link from "next/link";
import { useEffect } from "react";
import { Bell, Plus, Search, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Kbd } from "@/components/ui/kbd";
import { Tooltip } from "@/components/ui/tooltip";
import { useApp } from "@/lib/store/app";
import { cn, timeAgo } from "@/lib/utils";
import { LogoMark } from "./logo";
import { ThemeToggle } from "./theme-toggle";

export function TopNav({ onSearch }: { onSearch: () => void }) {
  const { notifications, markAllRead, clearNotifications } = useApp();
  const unread = notifications.filter((n) => !n.read).length;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onSearch();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onSearch]);

  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 border-b border-white/[0.06] bg-ink px-4 sm:px-6">
      <Link href="/home" className="lg:hidden" aria-label="Home">
        <LogoMark className="h-8 w-8" />
      </Link>

      {/* Search */}
      <button
        onClick={onSearch}
        className="group flex h-10 min-w-0 flex-1 items-center gap-3 rounded-xl md:max-w-md border border-white/[0.06] bg-white/[0.03] px-3 text-sm text-muted-foreground transition hover:border-brand/30"
      >
        <Search className="h-4 w-4" />
        <span className="min-w-0 flex-1 truncate text-left"><span className="sm:hidden">Search</span><span className="hidden sm:inline">Smart search — “Show sponsor logos”</span></span>
        <Kbd className="hidden sm:inline-flex">⌘K</Kbd>
      </button>

      <div className="ml-auto flex shrink-0 items-center gap-1.5">
        <Button asChild size="sm" className="hidden md:inline-flex">
          <Link href="/upload">
            <Plus /> New breakdown
          </Link>
        </Button>

        <ThemeToggle />

        {/* Notifications */}
        <DropdownMenu onOpenChange={(o) => !o && unread && markAllRead()}>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
              <Bell />
              {unread > 0 && (
                <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-600 px-1 text-[9px] font-bold text-onbrand">
                  {unread}
                </span>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80">
            <div className="flex items-center justify-between pr-1">
              <DropdownMenuLabel>Notifications</DropdownMenuLabel>
              {notifications.length > 0 && (
                <button onClick={clearNotifications} className="rounded px-1.5 py-0.5 text-[11px] text-muted-foreground hover:text-white">
                  Clear
                </button>
              )}
            </div>
            {notifications.length === 0 && (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">No notifications yet. Finished breakdowns show up here.</p>
            )}
            <div className="scrollbar-thin max-h-80 overflow-y-auto">
              {notifications.map((n) => (
                <DropdownMenuItem key={n.id} asChild>
                  <Link href={n.href ?? "#"} className="!items-start">
                    <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", n.read ? "bg-white/15" : "bg-brand")} />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-white">{n.title}</span>
                      <span className="block text-xs leading-snug text-muted-foreground">{n.body}</span>
                      <span className="mt-1 block text-[10px] text-muted-foreground">{timeAgo(n.at)}</span>
                    </span>
                  </Link>
                </DropdownMenuItem>
              ))}
            </div>
          </DropdownMenuContent>
        </DropdownMenu>

        <Tooltip content="Settings">
          <Button asChild variant="ghost" size="icon" className="hidden sm:inline-flex">
            <Link href="/settings" aria-label="Settings">
              <Settings />
            </Link>
          </Button>
        </Tooltip>
      </div>
    </header>
  );
}
