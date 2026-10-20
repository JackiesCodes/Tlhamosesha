"use client";
import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { BRAND } from "@/lib/brand";

// RevVisual needs IndexedDB (saving projects), WebAssembly (text recognition) and
// canvas (image processing). Warn up front instead of failing mid-breakdown.
export function BrowserCheck() {
  const [missing, setMissing] = useState<string[]>([]);
  useEffect(() => {
    const m: string[] = [];
    if (typeof indexedDB === "undefined") m.push("saving projects");
    if (typeof WebAssembly === "undefined") m.push("text recognition");
    try {
      if (!document.createElement("canvas").getContext("2d")) m.push("image processing");
    } catch {
      m.push("image processing");
    }
    setMissing(m);
  }, []);
  if (!missing.length) return null;
  return (
    <div role="alert" className="flex items-start gap-2 border-b border-amber-400/30 bg-amber-400/10 px-4 py-2.5 text-sm text-amber-800 dark:text-amber-200 sm:px-6">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <span>
        This browser doesn&apos;t support {missing.join(", ")}, so parts of {BRAND.name} won&apos;t work. Try the latest Chrome, Edge, Firefox or Safari.
      </span>
    </div>
  );
}
