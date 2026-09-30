"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Download, FolderKanban, Home, UploadCloud, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { isActive } from "./nav-items";

const ITEMS = [
  { href: "/", label: "Home", icon: Home },
  { href: "/projects", label: "Projects", icon: FolderKanban },
  { href: "/upload", label: "Upload", icon: UploadCloud, primary: true },
  { href: "/downloads", label: "Downloads", icon: Download },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function MobileNav() {
  const pathname = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-white/[0.06] bg-ink/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden">
      <div className="mx-auto grid max-w-md grid-cols-5">
        {ITEMS.map((it) => {
          const active = isActive(pathname, it.href);
          return (
            <Link key={it.href} href={it.href} className="flex flex-col items-center gap-1 py-2.5 text-[10px] font-medium">
              {it.primary ? (
                <span className="-mt-6 flex h-12 w-12 items-center justify-center rounded-2xl bg-gold-sheen text-ink shadow-glow">
                  <it.icon className="h-5 w-5" />
                </span>
              ) : (
                <it.icon className={cn("h-5 w-5", active ? "text-gold" : "text-muted-foreground")} />
              )}
              <span className={cn(active ? "text-white" : "text-muted-foreground")}>{it.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
