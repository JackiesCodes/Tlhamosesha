// Smart Search — natural-language queries over a project's breakdown.
// "Find all player images", "Show all blue colors", "Show all text layers",
// "Show sponsor logos", "headlines", "fonts over 60px", "gradients"…
import { hueFamily } from "./color";
import type { Project } from "./types";

export type SearchHit =
  | { type: "object"; id: string; title: string; subtitle: string; image?: string }
  | { type: "text"; id: string; title: string; subtitle: string }
  | { type: "color"; id: string; title: string; subtitle: string; hex: string }
  | { type: "background"; id: string; title: string; subtitle: string; image: string }
  | { type: "layer"; id: string; title: string; subtitle: string };

export interface SearchResult {
  intent: string;
  hits: SearchHit[];
  tab?: "elements" | "layers" | "typography" | "colors" | "layout" | "metadata";
}

const COLOR_WORDS = ["red", "orange", "yellow", "green", "teal", "blue", "purple", "pink", "brown", "black", "white", "grey", "gray", "gold"];

const OBJECT_SYNONYMS: [RegExp, (kind: string, label: string) => boolean, string][] = [
  [/\b(player|athlete|people|person|persons|human|model|figure)s?\b/, (k) => k === "person", "People & players"],
  [/\bfaces?\b/, (k) => k === "face", "Faces"],
  [/\bsponsors?\b/, (k, l) => k === "logo" && /sponsor/i.test(l), "Sponsor logos"],
  [/\b(badge|crest|team logo)s?\b/, (k, l) => k === "logo" && /badge|crest|team/i.test(l), "Team badges"],
  [/\b(logo|brand|brand ?mark)s?\b/, (k) => k === "logo", "Logos & brand marks"],
  [/\bicons?\b/, (k) => k === "icon", "Icons"],
  [/\bproducts?\b/, (k) => k === "product", "Products"],
  [/\b(vehicle|car|bike|truck)s?\b/, (k) => k === "vehicle", "Vehicles"],
  [/\b(building|architecture|stadium)s?\b/, (k) => k === "building", "Buildings"],
  [/\b(image|images|object|objects|asset|assets|cut ?outs?|pngs?)\b/, () => true, "All image assets"],
];

const TEXT_ROLES: [RegExp, string, string][] = [
  [/\bheadlines?\b|\btitles?\b/, "headline", "Headlines"],
  [/\bsub-?headlines?\b|\bsubtitles?\b/, "subheadline", "Sub-headlines"],
  [/\bcaptions?\b/, "caption", "Captions"],
  [/\bstat(istic)?s?\b|\bnumbers?\b/, "statistic", "Statistics"],
  [/\bscores?\b|\bresults?\b/, "score", "Scores"],
  [/\bdates?\b|\bwhen\b/, "date", "Dates"],
  [/\bnames?\b/, "name", "Names"],
  [/\bbody\b|\bparagraphs?\b/, "body", "Body text"],
  [/\bcta\b|\bbuttons?\b|call to action/, "cta", "Calls to action"],
];

export function smartSearch(p: Project, raw: string): SearchResult {
  const q = raw.toLowerCase().trim();
  const a = p.analysis;
  if (!q) return { intent: "Type a query", hits: [] };

  // Colours
  const colorWord = COLOR_WORDS.find((c) => new RegExp(`\\b${c}\\b`).test(q));
  if (/\bcolou?rs?\b|\bpalette\b|\bhex\b|\bshades?\b/.test(q) || (colorWord && !/\btext\b/.test(q))) {
    const fam = colorWord === "gray" ? "grey" : colorWord === "gold" ? "yellow" : colorWord;
    const list = a.palette.filter((c) => !fam || hueFamily(c.hex) === fam || (colorWord === "gold" && hueFamily(c.hex) === "brown"));
    return {
      intent: fam ? `${capitalise(colorWord!)} colours` : "All colours",
      tab: "colors",
      hits: list.map((c) => ({ type: "color", id: c.hex, title: `${c.name} ${c.hex}`, subtitle: `${c.role} · ${Math.round(c.weight * 100)}%`, hex: c.hex })),
    };
  }

  if (/\bgradients?\b/.test(q))
    return {
      intent: "Gradients",
      tab: "colors",
      hits: a.gradients.map((g) => ({ type: "color", id: g.id, title: g.css, subtitle: g.region, hex: g.stops[0].hex })),
    };

  if (/\b(backgrounds?|textures?|blur|overlay|lighting)\b/.test(q)) {
    const kw = q.match(/\b(texture|blur|overlay|lighting|gradient)\b/)?.[1];
    return {
      intent: kw ? `${capitalise(kw)} layers` : "Background layers",
      tab: "elements",
      hits: a.backgrounds
        .filter((b) => !kw || b.kind === kw)
        .map((b) => ({ type: "background", id: b.id, title: b.label, subtitle: `${b.kind} · ${Math.round(b.confidence * 100)}%`, image: b.image })),
    };
  }

  // Text roles
  for (const [re, role, label] of TEXT_ROLES)
    if (re.test(q))
      return {
        intent: label,
        tab: "typography",
        hits: a.texts.filter((t) => t.role === role).map((t) => ({ type: "text", id: t.id, title: t.text, subtitle: `${t.font.family} ${t.font.weight} · ${t.font.sizePx}px` })),
      };

  const sizeMatch = q.match(/\b(fonts?|text).*\b(over|above|larger than|>)\s*(\d+)/);
  if (sizeMatch) {
    const min = +sizeMatch[3];
    return {
      intent: `Text larger than ${min}px`,
      tab: "typography",
      hits: a.texts.filter((t) => t.font.sizePx > min).map((t) => ({ type: "text", id: t.id, title: t.text, subtitle: `${t.font.sizePx}px ${t.font.family}` })),
    };
  }

  if (/\b(text|words|copy|typography|fonts?)\b/.test(q)) {
    const layers = p.scene.layers.filter((l) => l.type === "text");
    return {
      intent: "All text layers",
      tab: "layers",
      hits: layers.map((l) => ({ type: "layer", id: l.id, title: l.name, subtitle: "text layer" })),
    };
  }

  if (/\blayers?\b/.test(q))
    return {
      intent: "All layers",
      tab: "layers",
      hits: [...p.scene.layers].reverse().map((l) => ({ type: "layer", id: l.id, title: l.name, subtitle: `${l.type} layer` })),
    };

  for (const [re, match, label] of OBJECT_SYNONYMS)
    if (re.test(q))
      return {
        intent: label,
        tab: "elements",
        hits: a.objects
          .filter((o) => match(o.kind, o.label))
          .map((o) => ({ type: "object", id: o.id, title: o.label, subtitle: `${o.kind} · ${Math.round(o.confidence * 100)}%`, image: o.cutout })),
      };

  // Fallback: full-text match over everything.
  const hits: SearchHit[] = [
    ...a.texts.filter((t) => t.text.toLowerCase().includes(q)).map((t) => ({ type: "text" as const, id: t.id, title: t.text, subtitle: t.role })),
    ...a.objects
      .filter((o) => o.label.toLowerCase().includes(q) || o.kind.includes(q))
      .map((o) => ({ type: "object" as const, id: o.id, title: o.label, subtitle: o.kind, image: o.cutout })),
    ...a.palette
      .filter((c) => c.hex.toLowerCase().includes(q) || c.name.toLowerCase().includes(q))
      .map((c) => ({ type: "color" as const, id: c.hex, title: `${c.name} ${c.hex}`, subtitle: c.role, hex: c.hex })),
  ];
  return { intent: `Matches for “${raw.trim()}”`, hits };
}

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export const SEARCH_SUGGESTIONS = [
  "Find all player images",
  "Show all blue colors",
  "Show all text layers",
  "Show sponsor logos",
  "Headlines",
  "Gradients",
];
