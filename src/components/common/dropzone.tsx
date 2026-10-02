"use client";
import { useCallback, useRef, useState } from "react";
import { motion } from "framer-motion";
import { FileImage, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const ACCEPT = ["image/png", "image/jpeg", "image/webp", "image/svg+xml", "image/gif", "image/bmp", "image/avif"];
const MAX_BYTES = 25 * 1024 * 1024;

export function Dropzone({ onFile, compact, className }: { onFile: (f: File) => void; compact?: boolean; className?: string }) {
  const [over, setOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const accept = useCallback(
    (f?: File | null) => {
      if (!f) return;
      if (!ACCEPT.includes(f.type)) return setError("Unsupported file — use PNG, JPG, WEBP, SVG, GIF or AVIF.");
      if (f.size > MAX_BYTES) return setError("File is larger than 25 MB.");
      setError(null);
      onFile(f);
    },
    [onFile],
  );

  return (
    <motion.div
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        accept(e.dataTransfer.files?.[0]);
      }}
      onPaste={(e) => accept(e.clipboardData.files?.[0])}
      animate={{ scale: over ? 1.01 : 1 }}
      className={cn(
        "relative flex flex-col items-center justify-center overflow-hidden rounded-3xl border-2 border-dashed text-center transition-colors",
        over ? "border-brand bg-brand/[0.06]" : "border-white/10 bg-surface-sunken/60 hover:border-brand/40",
        compact ? "gap-3 px-6 py-10" : "gap-5 px-8 py-16 sm:py-20",
        className,
      )}
    >
      <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl border border-brand/30 bg-brand/10">
        <UploadCloud className="h-7 w-7 text-brand" />
      </div>
      <div className="relative">
        <p className="font-display text-lg font-semibold text-white">Drop a poster to break it down</p>
        <p className="mt-1 text-sm text-muted-foreground">Sports graphics, banners, flyers, infographics, ads, magazine pages, diagrams…</p>
      </div>
      <div className="relative flex flex-wrap items-center justify-center gap-3">
        <Button size={compact ? "default" : "lg"} onClick={() => input.current?.click()}>
          <FileImage /> Choose image
        </Button>
        <span className="text-xs text-muted-foreground">or paste · PNG JPG WEBP SVG · up to 25 MB</span>
      </div>
      {error && <p className="relative text-sm text-rose-300">{error}</p>}
      <input
        ref={input}
        type="file"
        accept={ACCEPT.join(",")}
        className="hidden"
        onChange={(e) => {
          accept(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </motion.div>
  );
}
