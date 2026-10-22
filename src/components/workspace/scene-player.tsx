"use client";
// Plays a video scene's rebuilt layers with their fitted motion and timing,
// looping the scene, so the reconstruction can be checked against the video.
import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import type { LayerTiming, Project, SceneLayer } from "@/lib/types";
import { cssEasing, sampleMotion, type MotionState } from "@/lib/video/easing";
import { formatTime } from "@/lib/video/project";
import { LayerContent } from "./scene-view";

const css = (m: MotionState) => ({ transform: `translate(${m.dx}px, ${m.dy}px) scale(${m.scale})`, opacity: m.opacity });

/** Web Animations keyframes covering the whole scene for one layer. */
function frames(timing: LayerTiming | undefined, start: number, end: number): Keyframe[] | null {
  if (!timing) return null;
  const span = end - start;
  const at = (t: number) => Math.min(1, Math.max(0, (t - start) / span));
  if (timing.motion?.length) {
    const keys = timing.motion;
    const out: Keyframe[] = [{ offset: 0, ...css(sampleMotion(keys, start)), easing: "linear" }];
    for (const k of keys) out.push({ offset: at(k.t), ...css(k), easing: cssEasing(k.easing) });
    const last: Keyframe = { offset: 1, ...css(sampleMotion(keys, end)) };
    // Layers without a fitted exit still leave when their time is up.
    if (timing.out < end - 0.05 && keys[keys.length - 1].opacity > 0.5) {
      out.push({ offset: at(timing.out), opacity: 1 }, { offset: at(timing.out), opacity: 0 });
      last.opacity = 0;
    }
    out.push(last);
    return out.sort((a, b) => (a.offset as number) - (b.offset as number));
  }
  if (timing.in <= start + 0.05 && timing.out >= end - 0.05) return null;
  return [
    { offset: 0, opacity: timing.in <= start + 0.05 ? 1 : 0 },
    { offset: at(timing.in), opacity: timing.in <= start + 0.05 ? 1 : 0 },
    { offset: at(timing.in), opacity: 1 },
    { offset: at(timing.out), opacity: 1 },
    { offset: at(timing.out), opacity: timing.out >= end - 0.05 ? 1 : 0 },
    { offset: 1, opacity: timing.out >= end - 0.05 ? 1 : 0 },
  ];
}

export function ScenePlayer({ project, scale }: { project: Project; scale: number }) {
  const video = project.video!;
  const current = video.scenes[video.active];
  const { start, end } = current;
  const root = useRef<HTMLDivElement>(null);
  const anims = useRef<Animation[]>([]);
  const [playing, setPlaying] = useState(true);
  const [time, setTime] = useState(start);
  const scene = project.scene;

  useEffect(() => {
    const els = root.current?.querySelectorAll<HTMLElement>("[data-motion]") ?? [];
    anims.current = [...els].flatMap((el) => {
      const layer = scene.layers.find((l) => l.id === el.dataset.motion);
      const kf = frames(layer?.sourceId ? current.timing[layer.sourceId] : undefined, start, end);
      return kf ? [el.animate(kf, { duration: (end - start) * 1000, iterations: Infinity })] : [];
    });
    // A clock that runs even when no layer animates.
    const clock = root.current!.animate([{ opacity: 1 }, { opacity: 1 }], { duration: (end - start) * 1000, iterations: Infinity });
    anims.current.push(clock);
    let raf = 0;
    const tick = () => {
      setTime(start + (((clock.currentTime as number) ?? 0) / 1000) % (end - start));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      anims.current.forEach((a) => a.cancel());
      anims.current = [];
    };
  }, [scene, current, start, end]);

  const toggle = () => {
    anims.current.forEach((a) => (playing ? a.pause() : a.play()));
    setPlaying(!playing);
  };

  return (
    <div className="flex flex-col items-start gap-2">
      <div className="relative overflow-hidden rounded-xl shadow-panel" style={{ width: scene.width * scale, height: scene.height * scale }}>
        <div ref={root} className="absolute left-0 top-0 origin-top-left overflow-hidden" style={{ width: scene.width, height: scene.height, transform: `scale(${scale})`, background: scene.background }}>
          {scene.layers.map((l: SceneLayer) =>
            l.visible ? (
              <div
                key={l.id}
                className="absolute"
                style={{ left: l.x, top: l.y, width: l.width, height: l.height, opacity: l.opacity, transform: l.rotation ? `rotate(${l.rotation}deg)` : undefined }}
              >
                <div data-motion={l.id} className="h-full w-full" style={{ transformOrigin: "center" }}>
                  <LayerContent layer={l} editing={false} onCommitText={() => {}} />
                </div>
              </div>
            ) : null,
          )}
        </div>
      </div>
      <button
        onClick={toggle}
        className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] px-2.5 py-1.5 font-mono text-[11px] text-white hover:bg-white/[0.04]"
        aria-label={playing ? "Pause" : "Play"}
      >
        {playing ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
        {formatTime(time)} / {formatTime(end)}
      </button>
    </div>
  );
}
