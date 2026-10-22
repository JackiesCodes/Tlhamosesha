// On-screen text as subtitle files. Lines that appear and leave together form
// one cue, read top to bottom.
import type { Project } from "../types";
import { syncedScenes } from "./project";

export interface Cue {
  start: number;
  end: number;
  lines: string[];
}

export function captionCues(p: Project): Cue[] {
  const cues: (Cue & { ys: number[] })[] = [];
  // From the rebuilt text layers, so edits to wording and timing carry through.
  for (const s of syncedScenes(p)) {
    for (const l of s.scene.layers) {
      if (l.type !== "text" || !l.visible || !l.text.trim()) continue;
      const tm = l.timing ?? (l.sourceId ? s.timing[l.sourceId] : undefined);
      const start = Math.max(s.start, tm?.in ?? s.start);
      const end = Math.min(s.end, tm?.out ?? s.end);
      if (end - start < 0.1) continue;
      const text = l.uppercase ? l.text.toUpperCase() : l.text;
      const same = cues.find((c) => Math.abs(c.start - start) < 0.15 && Math.abs(c.end - end) < 0.15);
      if (same) {
        same.lines.push(text);
        same.ys.push(l.y);
      } else cues.push({ start, end, lines: [text], ys: [l.y] });
    }
  }
  return cues
    .map(({ ys, lines, ...c }) => ({ ...c, lines: lines.map((l, i) => [l, ys[i]] as const).sort((a, b) => a[1] - b[1]).map(([l]) => l) }))
    .sort((a, b) => a.start - b.start || a.end - b.end);
}

const stamp = (s: number, sep: "," | ".") => {
  const ms = Math.round(s * 1000);
  const hh = String(Math.floor(ms / 3600000)).padStart(2, "0");
  const mm = String(Math.floor(ms / 60000) % 60).padStart(2, "0");
  const ss = String(Math.floor(ms / 1000) % 60).padStart(2, "0");
  return `${hh}:${mm}:${ss}${sep}${String(ms % 1000).padStart(3, "0")}`;
};

export function toSrt(cues: Cue[]) {
  return cues.map((c, i) => `${i + 1}\n${stamp(c.start, ",")} --> ${stamp(c.end, ",")}\n${c.lines.join("\n")}\n`).join("\n");
}

export function toVtt(cues: Cue[]) {
  return `WEBVTT\n\n${cues.map((c) => `${stamp(c.start, ".")} --> ${stamp(c.end, ".")}\n${c.lines.join("\n")}\n`).join("\n")}`;
}
