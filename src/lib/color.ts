import type { ColorRole, PaletteColor } from "./types";

export type RGB = [number, number, number];

export const toHex = ([r, g, b]: RGB) =>
  "#" + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("").toUpperCase();

export function hexToRgb(hex: string): RGB {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full.slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHsl([r, g, b]: RGB): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return [Math.round(h), Math.round(s * 100), Math.round(l * 100)];
}

export function relativeLuminance([r, g, b]: RGB) {
  const f = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

export function contrastRatio(a: RGB, b: RGB) {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

export function colorDistance(a: RGB, b: RGB) {
  // "redmean" weighted Euclidean — cheap and perceptually decent.
  const rm = (a[0] + b[0]) / 2;
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return Math.sqrt((2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db);
}

const HUE_NAMES: [number, string][] = [
  [15, "Red"],
  [40, "Orange"],
  [65, "Yellow"],
  [80, "Lime"],
  [160, "Green"],
  [190, "Teal"],
  [210, "Cyan"],
  [250, "Blue"],
  [280, "Indigo"],
  [320, "Purple"],
  [345, "Magenta"],
  [360, "Red"],
];

export function colorName(rgb: RGB) {
  const [h, s, l] = rgbToHsl(rgb);
  if (l < 8) return "Black";
  if (l > 94) return "White";
  if (s < 12) return l < 30 ? "Charcoal" : l < 60 ? "Slate Grey" : "Silver";
  const hue = HUE_NAMES.find(([max]) => h < max)?.[1] ?? "Red";
  if (hue === "Orange" && l < 40) return "Brown";
  if (hue === "Yellow" && s < 70 && l < 60) return "Gold";
  const tone = l < 25 ? "Deep " : l < 42 ? "Dark " : l > 75 ? "Light " : s > 80 ? "Vivid " : "";
  return tone + hue;
}

export function hueFamily(hex: string) {
  const [h, s, l] = rgbToHsl(hexToRgb(hex));
  if (l < 10) return "black";
  if (l > 92) return "white";
  if (s < 12) return "grey";
  if (h < 15 || h >= 345) return "red";
  if (h < 40) return l < 40 ? "brown" : "orange";
  if (h < 70) return "yellow";
  if (h < 160) return "green";
  if (h < 200) return "teal";
  if (h < 255) return "blue";
  if (h < 290) return "purple";
  return "pink";
}

/** k-means++ over an RGB sample. Returns clusters sorted by population. */
export function kmeans(samples: RGB[], k: number, iterations = 12) {
  if (samples.length === 0) return [] as { center: RGB; count: number }[];
  k = Math.min(k, samples.length);
  const centers: RGB[] = [samples[Math.floor(samples.length / 2)]];
  // Deterministic k-means++: take the farthest-weighted sample each step.
  while (centers.length < k) {
    let best = 0;
    let bestD = -1;
    for (let i = 0; i < samples.length; i += 3) {
      let d = Infinity;
      for (const c of centers) d = Math.min(d, colorDistance(samples[i], c));
      if (d > bestD) {
        bestD = d;
        best = i;
      }
    }
    centers.push([...samples[best]] as RGB);
  }
  const assign = new Int32Array(samples.length);
  for (let it = 0; it < iterations; it++) {
    const sums = centers.map(() => [0, 0, 0, 0]);
    for (let i = 0; i < samples.length; i++) {
      let bi = 0;
      let bd = Infinity;
      for (let c = 0; c < centers.length; c++) {
        const d = colorDistance(samples[i], centers[c]);
        if (d < bd) {
          bd = d;
          bi = c;
        }
      }
      assign[i] = bi;
      const s = sums[bi];
      s[0] += samples[i][0];
      s[1] += samples[i][1];
      s[2] += samples[i][2];
      s[3]++;
    }
    for (let c = 0; c < centers.length; c++) {
      const s = sums[c];
      if (s[3]) centers[c] = [s[0] / s[3], s[1] / s[3], s[2] / s[3]];
    }
  }
  const counts = new Array(centers.length).fill(0);
  for (let i = 0; i < samples.length; i++) counts[assign[i]]++;
  return centers
    .map((center, i) => ({ center: center.map(Math.round) as RGB, count: counts[i] }))
    .filter((c) => c.count > 0)
    .sort((a, b) => b.count - a.count);
}

export function buildPalette(samples: RGB[], k = 10): PaletteColor[] {
  const clusters = kmeans(samples, k);
  // Merge near-duplicates.
  const merged: { center: RGB; count: number }[] = [];
  for (const c of clusters) {
    const twin = merged.find((m) => colorDistance(m.center, c.center) < 40);
    if (twin) twin.count += c.count;
    else merged.push({ ...c });
  }
  const total = merged.reduce((s, c) => s + c.count, 0) || 1;
  const withMeta = merged.map((c) => {
    const hsl = rgbToHsl(c.center);
    return { ...c, hsl, weight: c.count / total };
  });

  // Accent = most saturated colour that is not dominant.
  const bySat = [...withMeta].sort((a, b) => b.hsl[1] * (1 - Math.abs(b.hsl[2] - 50) / 60) - a.hsl[1] * (1 - Math.abs(a.hsl[2] - 50) / 60));
  const accentSet = new Set(bySat.filter((c) => c.hsl[1] > 45 && c.weight < 0.25).slice(0, 2));

  let primaryAssigned = 0;
  return withMeta
    .sort((a, b) => b.weight - a.weight)
    .map((c) => {
      let role: ColorRole;
      if (accentSet.has(c)) role = "accent";
      else if (primaryAssigned < 2) {
        role = "primary";
        primaryAssigned++;
      } else if (c.hsl[1] < 10) role = "neutral";
      else role = "secondary";
      return {
        hex: toHex(c.center),
        rgb: c.center,
        hsl: c.hsl,
        name: colorName(c.center),
        weight: Math.round(c.weight * 1000) / 1000,
        role,
      } satisfies PaletteColor;
    });
}
