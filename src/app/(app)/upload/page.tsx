"use client";
import { Suspense, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, ArrowRight, Check, Circle, Loader2, MinusCircle, RotateCcw } from "lucide-react";
import { Dropzone } from "@/components/common/dropzone";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { SAMPLES } from "@/lib/samples";
import { fileToInput, urlToInput, useAnalyze } from "@/lib/store/analyze";
import { cn, formatBytes } from "@/lib/utils";
import { PIPELINE_STEPS } from "@/lib/vision/pipeline";

export default function UploadPage() {
  return (
    <Suspense>
      <UploadView />
    </Suspense>
  );
}

function UploadView() {
  const router = useRouter();
  const params = useSearchParams();
  const { input, setInput, start, running, steps, error, resultId, reset } = useAnalyze();
  const kicked = useRef(false);

  // Entry points: ?sample=<id> or ?autostart=1 (file handed over from Home).
  useEffect(() => {
    if (kicked.current) return;
    const sample = SAMPLES.find((s) => s.id === params.get("sample"));
    if (sample) {
      kicked.current = true;
      urlToInput(sample.src, `${sample.name}.svg`).then((i) => {
        setInput(i);
        useAnalyze.getState().start();
      });
    } else if (params.get("autostart") && input && !running && !resultId) {
      kicked.current = true;
      start();
    }
  }, [params, input, running, resultId, setInput, start]);

  useEffect(() => {
    if (resultId) {
      const t = setTimeout(() => {
        router.push(`/projects/${resultId}`);
        reset();
      }, 900);
      return () => clearTimeout(t);
    }
  }, [resultId, router, reset]);

  const onFile = async (f: File) => {
    setInput(await fileToInput(f));
    await useAnalyze.getState().start();
  };

  const doneCount = PIPELINE_STEPS.filter((s) => ["done", "skipped", "error"].includes(steps[s.id].status)).length;
  const pct = Math.round((doneCount / PIPELINE_STEPS.length) * 100);

  return (
    <div className="mx-auto max-w-[1200px] space-y-8 px-4 py-8 sm:px-8">
      <PageHeader
        eyebrow="Upload"
        title="New poster breakdown"
        description="Everything runs on your device first. Connected vision models (OpenAI, Gemini, Claude, or a YOLO/SAM service) refine the result when configured."
      />

      <AnimatePresence mode="wait">
        {!input ? (
          <motion.div key="drop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <Dropzone onFile={onFile} />
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              {SAMPLES.map((s) => (
                <button
                  key={s.id}
                  onClick={async () => {
                    setInput(await urlToInput(s.src, `${s.name}.svg`));
                    useAnalyze.getState().start();
                  }}
                  className="flex items-center gap-3 rounded-2xl border border-white/[0.06] bg-surface/70 p-3 text-left text-sm transition hover:border-brand/30"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={s.src} alt="" className="h-12 w-12 rounded-lg object-cover" />
                  <span>
                    <span className="block font-medium text-white">{s.name}</span>
                    <span className="text-xs text-muted-foreground">Use sample</span>
                  </span>
                </button>
              ))}
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="run"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="grid gap-6 lg:grid-cols-[1fr_420px]"
          >
            {/* Preview with scan animation */}
            <div className="panel relative flex items-center justify-center overflow-hidden p-6">
              <div className="relative max-h-[70vh]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={input.src} alt="Uploaded poster" className="max-h-[66vh] w-auto rounded-xl object-contain shadow-panel" />
                {running && (
                  <>
                    <div className="absolute inset-0 rounded-xl bg-grid-faint [background-size:24px_24px]" />
                    <div className="absolute inset-x-0 h-24 -translate-y-1/2 animate-scan">
                      <div className="absolute inset-x-0 top-1/2 h-px bg-brand" />
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Steps */}
            <div className="panel flex flex-col p-6">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-white">{input.fileName}</div>
                  <div className="text-xs text-muted-foreground">{formatBytes(input.fileSize)} · {input.mimeType}</div>
                </div>
                <div className="font-display text-2xl font-bold text-brand">{pct}%</div>
              </div>
              <Progress value={pct} className="mt-4" />

              <ol className="mt-6 space-y-1">
                {PIPELINE_STEPS.map((s, i) => {
                  const st = steps[s.id];
                  return (
                    <motion.li
                      key={s.id}
                      initial={{ opacity: 0, x: 8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.03 }}
                      className={cn(
                        "flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition",
                        st.status === "active" && "bg-brand/[0.07]",
                      )}
                    >
                      <StepIcon status={st.status} />
                      <span className={cn("flex-1", st.status === "pending" ? "text-muted-foreground" : "text-white")}>{s.label}</span>
                      {st.status === "active" && st.progress !== undefined && (
                        <span className="font-mono text-[11px] text-brand">{Math.round(st.progress * 100)}%</span>
                      )}
                      {st.note && st.status !== "active" && <span className="max-w-[45%] truncate text-right text-[11px] text-muted-foreground">{st.note}</span>}
                    </motion.li>
                  );
                })}
              </ol>

              <div className="mt-auto pt-6">
                {error ? (
                  <div className="space-y-3">
                    <div className="flex items-start gap-2 rounded-xl border border-rose-400/30 bg-rose-400/10 p-3 text-sm text-rose-800 dark:text-rose-200">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
                    </div>
                    <Button variant="secondary" className="w-full" onClick={() => reset()}>
                      <RotateCcw /> Try another image
                    </Button>
                  </div>
                ) : resultId ? (
                  <Button className="w-full" onClick={() => router.push(`/projects/${resultId}`)}>
                    Open workspace <ArrowRight />
                  </Button>
                ) : !running ? (
                  <div className="flex gap-2">
                    <Button className="flex-1" onClick={() => start()}>
                      Start breakdown
                    </Button>
                    <Button variant="secondary" onClick={() => reset()}>
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <p className="text-center text-xs text-muted-foreground">Analysing locally — keep this tab open.</p>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function StepIcon({ status }: { status: string }) {
  if (status === "done") return <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />;
  if (status === "active") return <Loader2 className="h-4 w-4 animate-spin text-brand" />;
  if (status === "skipped") return <MinusCircle className="h-4 w-4 text-muted-foreground" />;
  if (status === "error") return <AlertTriangle className="h-4 w-4 text-rose-600 dark:text-rose-400" />;
  return <Circle className="h-4 w-4 text-muted-foreground" />;
}
