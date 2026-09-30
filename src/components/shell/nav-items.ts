import { BarChart3, Download, FolderKanban, Home, LayoutTemplate, Settings, UploadCloud } from "lucide-react";

export const NAV_ITEMS = [
  { href: "/", label: "Home", icon: Home },
  { href: "/upload", label: "Upload", icon: UploadCloud },
  { href: "/projects", label: "Projects", icon: FolderKanban },
  { href: "/templates", label: "Templates", icon: LayoutTemplate },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/downloads", label: "Downloads", icon: Download },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

export const isActive = (pathname: string, href: string) =>
  href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");
