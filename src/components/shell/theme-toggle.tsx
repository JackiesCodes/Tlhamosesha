"use client";
import { Check, Monitor, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useTheme, type ThemePref } from "@/lib/theme";

export const THEME_OPTIONS: { id: ThemePref; label: string; icon: typeof Sun }[] = [
  { id: "light", label: "Light", icon: Sun },
  { id: "dark", label: "Dark", icon: Moon },
  { id: "system", label: "System", icon: Monitor },
];

export function ThemeToggle() {
  const { pref, resolved, setPref } = useTheme();
  const Icon = resolved === "light" ? Sun : Moon;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Change theme">
          <Icon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuLabel>Theme</DropdownMenuLabel>
        {THEME_OPTIONS.map((o) => (
          <DropdownMenuItem key={o.id} onSelect={() => setPref(o.id)}>
            <o.icon /> <span className="flex-1">{o.label}</span>
            {pref === o.id && <Check className="!text-brand" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Segmented control for the Settings page. */
export function ThemeSegmented() {
  const { pref, setPref } = useTheme();
  return (
    <div className="inline-flex rounded-lg border border-white/[0.08] bg-surface-sunken p-0.5" role="radiogroup" aria-label="Theme">
      {THEME_OPTIONS.map((o) => (
        <button
          key={o.id}
          role="radio"
          aria-checked={pref === o.id}
          onClick={() => setPref(o.id)}
          className={cn(
            "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition",
            pref === o.id ? "bg-surface text-white shadow-sm ring-1 ring-white/[0.08]" : "text-muted-foreground hover:text-white",
          )}
        >
          <o.icon className="h-3.5 w-3.5" /> {o.label}
        </button>
      ))}
    </div>
  );
}
