"use client";
// Video scenes: one bar per layer from when it appears to when it leaves.
// Drag a bar's ends to retime it, its middle to move it; diamonds are motion
// keyframes. The ruler moves the playhead; the canvas shows that moment.
import { useEffect, useRef } from "react";
import { Pause, Play, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { useEditor } from "@/lib/store/editor";
import type { LayerTiming, Project, SceneLayer } from "@/lib/types";
import { cn } from "@/lib/utils";
import { retime } from "@/lib/video/presets";
import { formatTime } from "@/lib/video/project";

const MIN_SPAN = 0.1; // seconds a layer stays on screen at least
const snap = (s: number) => Math.round(s * 20) / 20; // 0.05 s

export function Timeline({ project }: { project: Project }) {
  const { time, setTime, playing, setPlaying, selectedId, select, updateLayer, commit } = useEditor();
  const video = project.video!;
  const { start, end } = video.scenes[video.active];
  const span = end - start;
  const track = useRef<HTMLDivElement>(null);
  const layers = [...project.scene.layers].reverse();
  const pct = (t: number) => `${((t - start) / span) * 100}%`;

  // Playback loops the scene.
  useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const cur = useEditor.getState().time ?? start;
      let next = cur + (now - last) / 1000;
      if (next > end) next = start;
      last = now;
      setTime(next);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, start, end, setTime]);

  const timeAt = (clientX: number) => {
    const r = track.current!.getBoundingClientRect();
    return Math.min(end, Math.max(start, start + ((clientX - r.left) / r.width) * span));
  };

  const scrub = (e: React.PointerEvent) => {
    setPlaying(false);
    setTime(timeAt(e.clientX));
    const move = (ev: PointerEvent) => setTime(timeAt(ev.clientX));
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const drag = (e: React.PointerEvent, l: SceneLayer, edge: "in" | "out" | "both") => {
    e.stopPropagation();
    select(l.id);
    if (l.locked) return;
    commit();
    const base: LayerTiming = l.timing ?? { in: start, out: end };
    const x0 = e.clientX;
    const width = track.current!.getBoundingClientRect().width;
    const move = (ev: PointerEvent) => {
      let d = snap(((ev.clientX - x0) / width) * span);
      if (edge === "in") d = Math.min(Math.max(d, start - base.in), base.out - MIN_SPAN - base.in);
      else if (edge === "out") d = Math.max(Math.min(d, end - base.out), base.in + MIN_SPAN - base.out);
      else d = Math.min(Math.max(d, start - base.in), end - base.out);
      updateLayer(l.id, { timing: retime(base, edge, d) }, { commit: false });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const ticks: number[] = [];
  const step = span > 8 ? 2 : span > 3 ? 1 : 0.5;
  for (let t = Math.ceil(start / step) * step; t <= end + 1e-6; t += step) ticks.push(t);

  return (
    <div className="flex max-h-[38%] min-h-[150px] flex-col border-t border-white/[0.06]">
      <div className="flex items-center gap-2 px-3 py-1.5">
        <Tooltip content={playing ? "Pause" : "Play scene"}>
          <Button variant="ghost" size="icon-sm" onClick={() => setPlaying(!playing)} aria-label={playing ? "Pause" : "Play scene"}>
            {playing ? <Pause /> : <Play />}
          </Button>
        </Tooltip>
        <span className="font-mono text-[11px] text-white">{time == null ? "—" : formatTime(time)}</span>
        <span className="font-mono text-[11px] text-muted-foreground">
          Scene {video.active + 1} · {formatTime(start)}–{formatTime(end)}
        </span>
        <Tooltip content="Show every layer at rest (where it sits once it has arrived)">
          <Button variant="ghost" size="sm" className="ml-auto h-7 text-[11px]" onClick={() => {
            setPlaying(false);
            setTime(null);
          }} disabled={time == null}>
            <RotateCcw className="h-3 w-3" /> Layout view
          </Button>
        </Tooltip>
      </div>

      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-3 pb-2">
        <div className="relative">
          <div className="grid grid-cols-[130px_1fr] gap-x-2">
            <div />
            <div ref={track} onPointerDown={scrub} className="relative h-5 cursor-ew-resize select-none border-b border-white/[0.08]" aria-label="Timeline ruler">
              {ticks.map((t) => (
                <span key={t} className="absolute top-0 -translate-x-1/2 font-mono text-[9px] text-muted-foreground" style={{ left: pct(t) }}>
                  {formatTime(t)}
                </span>
              ))}
            </div>

            {layers.map((l) => {
              const tm = l.timing;
              const fixed = l.type === "background";
              const a = tm?.in ?? start;
              const b = tm?.out ?? end;
              const active = selectedId === l.id;
              return (
                <div key={l.id} className="contents">
                  <button
                    onClick={() => select(l.id)}
                    className={cn("truncate py-1 text-left text-[11px]", active ? "text-white" : "text-muted-foreground hover:text-white")}
                  >
                    {l.name}
                  </button>
                  <div className="relative h-6">
                    <div
                      onPointerDown={(e) => !fixed && drag(e, l, "both")}
                      className={cn(
                        "absolute inset-y-1 rounded-md border",
                        fixed ? "border-white/[0.06] bg-white/[0.04]" : "cursor-grab border-white/20 bg-white/[0.08] active:cursor-grabbing",
                        active && !fixed && "border-brand bg-brand/[0.18]",
                      )}
                      style={{ left: pct(Math.max(start, a)), width: `calc(${pct(Math.min(end, b))} - ${pct(Math.max(start, a))})` }}
                      title={`${formatTime(a)}–${formatTime(b)}`}
                    >
                      {!fixed && (
                        <>
                          <span onPointerDown={(e) => drag(e, l, "in")} className="absolute inset-y-0 left-0 w-2 cursor-ew-resize rounded-l-md hover:bg-white/30" aria-label="Drag to change when it appears" />
                          <span onPointerDown={(e) => drag(e, l, "out")} className="absolute inset-y-0 right-0 w-2 cursor-ew-resize rounded-r-md hover:bg-white/30" aria-label="Drag to change when it leaves" />
                        </>
                      )}
                    </div>
                    {tm?.motion?.map((k, i) =>
                      k.t >= start && k.t <= end ? (
                        <span
                          key={i}
                          className="pointer-events-none absolute top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rotate-45 border border-white bg-ink"
                          style={{ left: pct(k.t) }}
                        />
                      ) : null,
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          {time != null && (
            <div className="pointer-events-none absolute inset-0 grid grid-cols-[130px_1fr] gap-x-2" aria-hidden>
              <div />
              <div className="relative">
                <div className="absolute inset-y-0 w-px bg-brand" style={{ left: pct(time) }} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
