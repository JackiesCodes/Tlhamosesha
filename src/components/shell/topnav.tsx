"use client";
import Link from "next/link";
import { useEffect } from "react";
import { Bell, Check, ChevronDown, LogOut, Plus, Search, Settings, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Kbd } from "@/components/ui/kbd";
import { useApp } from "@/lib/store/app";
import { cn, timeAgo } from "@/lib/utils";
import { LogoMark } from "./logo";

export function TopNav({ onSearch }: { onSearch: () => void }) {
  const { settings, setSettings, workspaces, notifications, markAllRead } = useApp();
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

  const initials = settings.displayName
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 border-b border-white/[0.06] bg-ink px-4 sm:px-6">
      <Link href="/" className="lg:hidden" aria-label="Home">
        <LogoMark className="h-8 w-8" />
      </Link>

      {/* Workspace switcher */}
      <DropdownMenu>
        <DropdownMenuTrigger className="hidden items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.03] py-1.5 pl-1.5 pr-3 text-sm transition hover:border-white/15 md:flex">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-600 text-[11px] font-bold text-white">
            {settings.workspace.slice(0, 1)}
          </span>
          <span className="max-w-[140px] truncate font-medium">{settings.workspace}</span>
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
          {workspaces.map((w) => (
            <DropdownMenuItem key={w} onSelect={() => setSettings({ workspace: w })}>
              <span className="flex h-6 w-6 items-center justify-center rounded-md bg-white/[0.07] text-[10px] font-bold">{w.slice(0, 1)}</span>
              <span className="flex-1">{w}</span>
              {w === settings.workspace && <Check className="!text-brand" />}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href="/settings#workspace">
              <Plus /> Manage workspaces
            </Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Search */}
      <button
        onClick={onSearch}
        className="group flex h-10 min-w-0 flex-1 items-center gap-3 rounded-xl md:ml-4 md:max-w-md border border-white/[0.06] bg-white/[0.03] px-3 text-sm text-muted-foreground transition hover:border-brand/30"
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

        {/* Notifications */}
        <DropdownMenu onOpenChange={(o) => !o && unread && markAllRead()}>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
              <Bell />
              {unread > 0 && (
                <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-600 px-1 text-[9px] font-bold text-white">
                  {unread}
                </span>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80">
            <DropdownMenuLabel>Notifications</DropdownMenuLabel>
            {notifications.length === 0 && <p className="px-3 py-6 text-center text-sm text-muted-foreground">You’re all caught up.</p>}
            <div className="scrollbar-thin max-h-80 overflow-y-auto">
              {notifications.map((n) => (
                <DropdownMenuItem key={n.id} asChild>
                  <Link href={n.href ?? "#"} className="!items-start">
                    <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", n.read ? "bg-white/15" : "bg-brand")} />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-white">{n.title}</span>
                      <span className="block text-xs leading-snug text-muted-foreground">{n.body}</span>
                      <span className="mt-1 block text-[10px] text-slate-500">{timeAgo(n.at)}</span>
                    </span>
                  </Link>
                </DropdownMenuItem>
              ))}
            </div>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Profile */}
        <DropdownMenu>
          <DropdownMenuTrigger className="flex items-center gap-2 rounded-xl p-1 transition hover:bg-white/[0.05]">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-raised text-xs font-bold ring-1 ring-white/10">
              {initials}
            </span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <div className="px-2.5 py-2">
              <div className="text-sm font-semibold">{settings.displayName}</div>
              <div className="text-xs text-muted-foreground">Pro plan · {settings.workspace}</div>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/settings#profile">
                <User /> Profile
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/settings">
                <Settings /> Settings
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled>
              <LogOut /> Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
