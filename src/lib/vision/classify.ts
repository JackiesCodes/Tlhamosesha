// Design-type classification from pipeline features.
import type { DesignCategory, DetectedObject, PaletteColor, TextElement } from "../types";

interface Features {
  texts: TextElement[];
  objects: DetectedObject[];
  palette: PaletteColor[];
  aspect: number;
  colorfulness: number;
  edgeDensity: number;
}

const has = (re: RegExp, s: string) => (s.match(re) ?? []).length;

export function classifyDesign(f: Features): DesignCategory[] {
  const all = f.texts.map((t) => t.text).join(" ").toLowerCase();
  const people = f.objects.filter((o) => o.kind === "person").length;
  const logos = f.objects.filter((o) => o.kind === "logo").length;
  const products = f.objects.filter((o) => o.kind === "product").length;
  const scores = f.texts.filter((t) => t.role === "score").length;
  const stats = f.texts.filter((t) => t.role === "statistic").length;
  const dates = f.texts.filter((t) => t.role === "date").length;
  const lines = f.texts.length;
  const square = Math.abs(f.aspect - 1) < 0.08;
  const wide = f.aspect > 1.6;
  const tall = f.aspect < 0.85;

  const s: Record<string, number> = {
    "Sports Poster":
      2.2 * has(/\b(vs|v\.|match|fc|cup|league|final|goal|derby|champion|game ?day|season|tournament|united|rugby|soccer|football|basketball|cricket|kick ?off|full ?time|ft)\b/g, all) +
      1.5 * scores + 1.1 * people + 0.4 * logos,
    "Marketing Banner":
      1.4 * has(/\b(sale|offer|discount|off|deal|shop|join|sign up|subscribe|free|limited|today|now|learn more)\b/g, all) +
      (wide ? 2 : 0) + 0.3 * logos,
    "Product Advertisement":
      1.6 * has(/\b(new|buy|order|price|only|launch|introducing|available|\$|r\d|€|£)\b/g, all) + 1.4 * products + (people ? 0 : 0.5),
    "Event Flyer":
      1.3 * has(/\b(live|concert|festival|tickets?|venue|doors|party|night|tour|presents|rsvp|register|summit|conference)\b/g, all) +
      1.2 * dates + (tall ? 0.6 : 0),
    "Social Media Graphic": (square ? 2.2 : 0) + (f.aspect > 0.75 && f.aspect < 0.85 ? 1.2 : 0) + has(/[#@]\w+/g, all),
    Infographic: 0.9 * stats + (lines > 10 ? 1.4 : 0) + (f.edgeDensity > 0.12 ? 0.6 : 0),
    "Magazine Page": (lines > 14 ? 2 : lines > 9 ? 1 : 0) + (tall ? 0.8 : 0) + 0.4 * people,
    "Technical Diagram": (f.colorfulness < 18 ? 1.2 : 0) + (f.edgeDensity > 0.14 ? 1.2 : 0) + 0.8 * has(/\b(fig|diagram|input|output|api|server|flow|step|module)\b/g, all),
    "Visual Artwork": (lines <= 2 ? 1.6 : 0) + (f.colorfulness > 45 ? 1 : 0) + (f.objects.length <= 2 ? 0.5 : 0),
  };

  const entries = Object.entries(s).sort((a, b) => b[1] - a[1]);
  const top = entries[0][1];
  const second = entries[1][1];
  // Convert raw evidence into calibrated-looking confidences.
  const margin = top - second;
  const topConf = top <= 0.2 ? 0.52 : Math.min(0.97, 0.62 + Math.min(0.2, top * 0.035) + Math.min(0.15, margin * 0.05));
  return entries.slice(0, 5).map(([label, v], i) => ({
    label,
    confidence:
      i === 0 ? round(topConf) : round(Math.max(0.05, Math.min(topConf - 0.02, topConf * (top > 0 ? v / top : 0.5) * 0.95))),
  }));
}

const round = (v: number) => Math.round(v * 100) / 100;
