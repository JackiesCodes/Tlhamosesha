// Design DNA scoring — typography, colour and layout quality heuristics.
import { contrastRatio, hexToRgb } from "../color";
import type { DesignDNA, DnaScore, LayoutAnalysis, PaletteColor, TextElement } from "../types";
import { median } from "./layout";

const clamp100 = (v: number) => Math.round(Math.max(0, Math.min(100, v)));
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

export function scoreDna(
  texts: TextElement[],
  palette: PaletteColor[],
  layout: LayoutAnalysis,
  W: number,
  H: number,
  bgHex: string,
): DesignDNA {
  const typography = scoreTypography(texts);
  const color = scoreColor(texts, palette, bgHex);
  const lay = scoreLayout(layout, texts, W, H);
  return {
    overall: clamp100(typography.score * 0.34 + color.score * 0.33 + lay.score * 0.33),
    typography,
    color,
    layout: lay,
  };
}

function scoreTypography(texts: TextElement[]): DnaScore {
  if (!texts.length)
    return {
      score: 70,
      checks: [{ label: "Text presence", score: 70, note: "No text detected — typography not assessed." }],
    };
  const families = new Set(texts.map((t) => t.font.family));
  const fam = families.size <= 2 ? 96 : families.size === 3 ? 78 : 55;

  const sizes = texts.map((t) => t.font.sizePx).sort((a, b) => b - a);
  const ratio = sizes[0] / Math.max(1, median(sizes));
  const hierarchy = sizes.length === 1 ? 80 : ratio >= 2.2 ? 95 : ratio >= 1.6 ? 82 : ratio >= 1.25 ? 64 : 45;

  const tiers = new Set(sizes.map((s) => Math.round(Math.log(s) / Math.log(1.25)))).size;
  const scale = tiers >= 2 && tiers <= 5 ? 90 : tiers > 5 ? 60 : 72;

  const weights = new Set(texts.map((t) => t.font.weight)).size;
  const weightMix = weights <= 3 ? 90 : 68;

  const checks = [
    { label: "Font consistency", score: fam, note: `${families.size} font famil${families.size === 1 ? "y" : "ies"} detected.` },
    { label: "Hierarchy", score: hierarchy, note: `Headline is ${ratio.toFixed(1)}× the median text size.` },
    { label: "Type scale", score: scale, note: `${tiers} distinct size tier${tiers === 1 ? "" : "s"}.` },
    { label: "Weight discipline", score: weightMix, note: `${weights} weight${weights === 1 ? "" : "s"} in use.` },
  ];
  return { score: clamp100(avg(checks.map((c) => c.score))), checks };
}

function scoreColor(texts: TextElement[], palette: PaletteColor[], bgHex: string): DnaScore {
  const bg = hexToRgb(bgHex);
  const ratios = texts.map((t) => contrastRatio(hexToRgb(t.color), bg));
  const aa = ratios.length ? ratios.filter((r) => r >= 4.5).length / ratios.length : 1;
  const contrast = clamp100(40 + aa * 60);

  // 60-30-10 balance
  const main = palette.filter((p) => p.role !== "accent").map((p) => p.weight);
  const accentW = palette.filter((p) => p.role === "accent").reduce((s, p) => s + p.weight, 0);
  const d = Math.abs((main[0] ?? 0.6) - 0.6) + Math.abs((main[1] ?? 0.3) - 0.3) + Math.abs(accentW - 0.1);
  const balance = clamp100(100 - d * 90);

  const count = palette.length;
  const size = count >= 4 && count <= 7 ? 92 : count <= 3 ? 76 : 62;

  const hues = palette.filter((p) => p.hsl[1] > 25).map((p) => p.hsl[0]);
  let harmony = 80;
  let scheme = "Monochrome";
  if (hues.length >= 2) {
    const diffs: number[] = [];
    for (let i = 0; i < hues.length; i++)
      for (let j = i + 1; j < hues.length; j++) {
        const dd = Math.abs(hues[i] - hues[j]);
        diffs.push(Math.min(dd, 360 - dd));
      }
    const fits = diffs.map((x) =>
      Math.min(Math.abs(x - 0), Math.abs(x - 30), Math.abs(x - 120), Math.abs(x - 150), Math.abs(x - 180)),
    );
    harmony = clamp100(100 - avg(fits) * 1.6);
    const maxDiff = Math.max(...diffs);
    scheme = maxDiff < 45 ? "Analogous" : maxDiff > 150 ? "Complementary" : "Triadic / split";
  }

  const checks = [
    { label: "Contrast", score: contrast, note: `${Math.round(aa * 100)}% of text meets WCAG AA (4.5:1).` },
    { label: "Palette balance", score: balance, note: "Compared with the 60-30-10 distribution." },
    { label: "Harmony", score: harmony, note: `${scheme} colour relationship.` },
    { label: "Palette size", score: size, note: `${count} distinct colours.` },
  ];
  return { score: clamp100(avg(checks.map((c) => c.score))), checks };
}

function scoreLayout(l: LayoutAnalysis, texts: TextElement[], W: number, H: number): DnaScore {
  const m = l.margins;
  const hBal = clamp100(100 - (Math.abs(m.left - m.right) / Math.max(1, W)) * 400);
  const vBal = clamp100(100 - (Math.abs(m.top - m.bottom) / Math.max(1, H)) * 250);
  const alignment = l.alignment === "mixed" ? 62 : 92;

  const ys = texts.map((t) => t.box.y).sort((a, b) => a - b);
  const gapsY = ys.slice(1).map((y, i) => y - ys[i]).filter((g) => g > 2);
  const mean = avg(gapsY);
  const cv = mean ? Math.sqrt(avg(gapsY.map((g) => (g - mean) ** 2))) / mean : 0;
  const spacing = clamp100(100 - cv * 45);

  const w = l.hierarchy.map((h) => h.weight);
  const dominance = w.length >= 2 ? w[0] / Math.max(0.01, w[1]) : 2;
  const hierarchy = dominance >= 1.5 ? 92 : dominance >= 1.15 ? 76 : 58;

  const checks = [
    { label: "Alignment", score: alignment, note: `Predominantly ${l.alignment} aligned.` },
    { label: "Spacing rhythm", score: spacing, note: `Vertical gap variation ${(cv * 100).toFixed(0)}%.` },
    { label: "Visual hierarchy", score: hierarchy, note: `Focal element carries ${dominance.toFixed(1)}× the next weight.` },
    { label: "Margin balance", score: Math.round((hBal + vBal) / 2), note: `L/R ${m.left}/${m.right}px · T/B ${m.top}/${m.bottom}px.` },
    { label: "Symmetry", score: clamp100(50 + l.symmetry * 50), note: `${Math.round(l.symmetry * 100)}% mirrored mass.` },
  ];
  return { score: clamp100(avg(checks.map((c) => c.score))), checks };
}
