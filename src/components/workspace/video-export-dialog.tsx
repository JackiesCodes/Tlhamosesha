"use client";
// Renders the rebuilt video (every scene, with its layers, timing and motion)
// and encodes it in the browser.
import { useRef, useState } from "react";
import { Film, Music, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { useApp } from "@/lib/store/app";
import type { Project } from "@/lib/types";
import { cn, downloadBlob, formatBytes } from "@/lib/utils";
import { exportVideo } from "@/lib/video/encode";

export function VideoExportDialog({ project, open, onOpenChange }: { project: Project; open: boolean; onOpenChange: (o: boolean) => void }) {
  const logExport = useApp((s) => s.logExport);
  const [format, setFormat] = useState<"mp4" | "webm">("mp4");
  const [soundtrack, setSoundtrack] = useState<File | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const busy = progress !== null;

  const start = async () => {
    setMessage(null);
    setProgress(0);
    try {
      const r = await exportVideo(project, { format, soundtrack: soundtrack ?? undefined, onProgress: setProgress });
      downloadBlob(r.blob, r.fileName);
      logExport({ projectId: project.id, projectName: project.name, format: r.format === "mp4" ? "video-mp4" : "video-webm", fileName: r.fileName, size: r.blob.size });
      const notes = [
        r.format !== format ? "This browser can't write MP4, so it was saved as WebM." : "",
        soundtrack && !r.audio ? "This browser can't encode sound for this format, so the video is silent." : "",
      ].filter(Boolean);
      setMessage({ tone: "ok", text: `Saved ${r.fileName} (${formatBytes(r.blob.size)}). ${notes.join(" ")}` });
    } catch (e) {
      setMessage({ tone: "error", text: e instanceof Error ? e.message : String(e) });
    } finally {
      setProgress(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent>
        <DialogTitle className="flex items-center gap-2">
          <Film className="h-4 w-4" /> Export the rebuilt video
        </DialogTitle>
        <DialogDescription className="mt-2">
          Renders every scene with its layers, timing and motion, in your browser. Sound isn&apos;t stored with the project: add the original
          video to keep its soundtrack.
        </DialogDescription>

        <div className="mt-5 space-y-4">
          <div className="flex gap-2" role="radiogroup" aria-label="Format">
            {(["mp4", "webm"] as const).map((f) => (
              <button
                key={f}
                role="radio"
                aria-checked={format === f}
                disabled={busy}
                onClick={() => setFormat(f)}
                className={cn(
                  "flex-1 rounded-xl border px-3 py-2 text-left text-sm transition",
                  format === f ? "border-brand bg-brand/[0.06] text-white" : "border-white/[0.08] text-muted-foreground hover:text-white",
                )}
              >
                <span className="block font-medium">{f === "mp4" ? "MP4" : "WebM"}</span>
                <span className="text-xs text-muted-foreground">{f === "mp4" ? "Plays everywhere" : "Smaller, for the web"}</span>
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 rounded-xl border border-white/[0.08] p-3 text-sm">
            <Music className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate text-muted-foreground">{soundtrack ? soundtrack.name : "No soundtrack (silent video)"}</span>
            {soundtrack ? (
              <Button variant="ghost" size="icon-sm" onClick={() => setSoundtrack(null)} disabled={busy} aria-label="Remove soundtrack">
                <X />
              </Button>
            ) : (
              <Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()} disabled={busy}>
                Add soundtrack
              </Button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="video/*,audio/*"
              className="hidden"
              onChange={(e) => {
                setSoundtrack(e.target.files?.[0] ?? null);
                e.target.value = "";
              }}
            />
          </div>

          {busy && (
            <div className="space-y-1" role="status">
              <Progress value={(progress ?? 0) * 100} />
              <p className="text-xs text-muted-foreground">Rendering frames… {Math.round((progress ?? 0) * 100)}%</p>
            </div>
          )}
          {message && (
            <p
              role={message.tone === "error" ? "alert" : "status"}
              className={cn(
                "rounded-lg border px-3 py-2 text-sm",
                message.tone === "ok"
                  ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-700 dark:text-emerald-300"
                  : "border-rose-400/30 bg-rose-400/10 text-rose-700 dark:text-rose-300",
              )}
            >
              {message.text}
            </p>
          )}
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={busy}>
            Close
          </Button>
          <Button onClick={start} disabled={busy}>
            <Film /> {busy ? "Exporting…" : `Export ${format === "mp4" ? "MP4" : "WebM"}`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
