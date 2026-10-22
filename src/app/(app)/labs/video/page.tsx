"use client";
// Phase 0 prototype of video breakdowns. Not linked from the app; used to
// measure whether video is feasible (see eval/video-run.mjs).
import { useState } from "react";
import { Film, Loader2 } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useApp } from "@/lib/store/app";
import { analyzeVideo, VIDEO_STEPS, type VideoBreakdown } from "@/lib/video/analyze";

const fmt = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(2).padStart(5, "0")}`;

declare global {
  interface Window {
    __videoBreakdown?: VideoBreakdown | { error: string };
  }
}

export default function VideoLabPage() {
  const settings = useApp((s) => s.settings);
  const [status, setStatus] = useState<{ stage: string; progress: number } | null>(null);
  const [result, setResult] = useState<VideoBreakdown | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (file?: File) => {
    if (!file) return;
    setResult(null);
    setError(null);
    window.__videoBreakdown = undefined;
    const url = URL.createObjectURL(file);
    try {
      const out = await analyzeVideo(url, file.name, {
        ocr: settings.ocr,
        ocrInvertPass: settings.ocrInvertPass,
        sensitivity: settings.sensitivity,
        maxObjects: settings.maxObjects,
        onStep: (id, st) => st === "active" && setStatus({ stage: VIDEO_STEPS.find((x) => x.id === id)!.label, progress: 0 }),
        onProgress: (id, progress, note) =>
          setStatus({ stage: `${VIDEO_STEPS.find((x) => x.id === id)!.label}${note ? ` · ${note}` : ""}`, progress }),
      });
      window.__videoBreakdown = out;
      setResult(out);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      window.__videoBreakdown = { error: message };
      setError(message);
    } finally {
      URL.revokeObjectURL(url);
      setStatus(null);
    }
  };

  return (
    <div className="mx-auto max-w-[1100px] space-y-6 px-4 py-8 sm:px-8">
      <PageHeader eyebrow="Labs" title="Video breakdown (prototype)" description="Splits a video into scenes, breaks down each scene and times every layer. Runs on this device; nothing is uploaded or saved." />

      <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed border-white/[0.15] p-8 text-center text-sm text-muted-foreground hover:bg-white/[0.03]">
        <Film className="h-6 w-6" />
        <span className="text-white">Choose a video</span>
        <span>MP4 or WebM, up to 60 seconds works best</span>
        <input type="file" accept="video/*" className="sr-only" disabled={!!status} onChange={(e) => run(e.target.files?.[0])} />
      </label>

      {status && (
        <div className="space-y-2" role="status">
          <div className="flex items-center gap-2 text-sm text-white"><Loader2 className="h-4 w-4 animate-spin" /> {status.stage}</div>
          <Progress value={status.progress * 100} />
        </div>
      )}
      {error && <p role="alert" className="rounded-lg border border-rose-400/30 bg-rose-400/10 px-3 py-2 text-sm text-rose-700 dark:text-rose-300">{error}</p>}

      {result && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {result.width}×{result.height} · {result.duration.toFixed(1)} s · {result.scenes.length} scenes · {result.framesAnalysed} frames read ·
            processed in {result.timings.total.toFixed(1)} s (frames {result.timings.decode.toFixed(1)} s, scenes {result.timings.cuts.toFixed(1)} s, keyframes{" "}
            {result.timings.keyframes.toFixed(1)} s, timing {result.timings.timing.toFixed(1)} s)
          </p>
          {result.scenes.map((sc, i) => (
            <Card key={i}>
              <CardContent className="grid gap-4 p-4 sm:grid-cols-[180px_1fr]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={sc.thumbnail} alt={`Scene ${i + 1} keyframe`} className="w-full rounded-md border border-white/[0.08]" />
                <div className="min-w-0 space-y-3">
                  <div className="flex flex-wrap items-center gap-2 text-sm text-white">
                    <span className="font-medium">Scene {i + 1}</span>
                    <span className="font-mono text-xs text-muted-foreground">{fmt(sc.start)} – {fmt(sc.end)}</span>
                    {i > 0 && <Badge>{result.cuts[i - 1].type}</Badge>}
                    <span className="text-xs text-muted-foreground">{sc.keyframes.length} keyframe{sc.keyframes.length > 1 ? "s" : ""}</span>
                  </div>
                  <ul className="space-y-1 text-sm">
                    {sc.analysis.texts.map((t) => (
                      <li key={t.id} className="flex gap-3">
                        <span className="w-28 shrink-0 font-mono text-xs text-muted-foreground">{fmt(sc.timing[t.id].in)} – {fmt(sc.timing[t.id].out)}</span>
                        <span className="min-w-0 break-words text-white">{t.text}</span>
                        <span className="text-xs text-muted-foreground">{t.role}</span>
                      </li>
                    ))}
                    {sc.analysis.objects.map((o) => (
                      <li key={o.id} className="flex gap-3">
                        <span className="w-28 shrink-0 font-mono text-xs text-muted-foreground">{fmt(sc.timing[o.id].in)} – {fmt(sc.timing[o.id].out)}</span>
                        <span className="text-muted-foreground">{o.label}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
