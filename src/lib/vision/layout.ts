// Grid, spacing, alignment and hierarchy analysis from element boxes.
import type { Box, DetectedObject, LayoutAnalysis, TextElement } from "../types";

const ROLE_WEIGHT: Record<string, number> = {
  headline: 1,
  score: 0.95,
  subheadline: 0.7,
  statistic: 0.6,
  name: 0.55,
  date: 0.5,
  cta: 0.6,
  body: 0.35,
  caption: 0.25,
};

export function analyzeLayout(texts: TextElement[], objects: DetectedObject[], W: number, H: number): LayoutAnalysis {
  const elements: { id: string; label: string; box: Box; weight: number }[] = [
    ...texts.map((t) => ({
      id: t.id,
      label: `“${t.text.slice(0, 28)}${t.text.length > 28 ? "…" : ""}”`,
      box: t.box,
      weight: (ROLE_WEIGHT[t.role] ?? 0.3) * Math.sqrt((t.box.width * t.box.height) / (W * H)) * 3,
    })),
    ...objects
      .filter((o) => o.kind !== "face")
      .map((o) => ({
        id: o.id,
        label: o.label,
        box: o.box,
        weight: 0.8 * Math.sqrt((o.box.width * o.box.height) / (W * H)) * 2,
      })),
  ];

  if (!elements.length)
    return {
      columns: 1,
      rows: 1,
      gutter: 0,
      margins: { top: 0, right: 0, bottom: 0, left: 0 },
      padding: 0,
      alignment: "center",
      columnGuides: [],
      rowGuides: [],
      baseline: 8,
      symmetry: 1,
      hierarchy: [],
    };

  const left = Math.min(...elements.map((e) => e.box.x));
  const top = Math.min(...elements.map((e) => e.box.y));
  const right = W - Math.max(...elements.map((e) => e.box.x + e.box.width));
  const bottom = H - Math.max(...elements.map((e) => e.box.y + e.box.height));
  const margins = {
    top: Math.max(0, Math.round(top)),
    right: Math.max(0, Math.round(right)),
    bottom: Math.max(0, Math.round(bottom)),
    left: Math.max(0, Math.round(left)),
  };

  const content = elements.filter((e) => e.box.width < W * 0.9); // full-bleed items don't define columns
  const colGaps = gaps(content.map((e) => [e.box.x, e.box.x + e.box.width]), margins.left, W - margins.right, W * 0.02);
  const rowGaps = gaps(elements.map((e) => [e.box.y, e.box.y + e.box.height]), margins.top, H - margins.bottom, H * 0.012);

  const columns = Math.min(6, colGaps.length + 1);
  const rows = Math.min(12, rowGaps.length + 1);
  const gutter = colGaps.length ? Math.round(median(colGaps.map(([a, b]) => b - a))) : Math.round(W * 0.04);
  const padding = rowGaps.length ? Math.round(median(rowGaps.map(([a, b]) => b - a))) : Math.round(H * 0.03);

  // Alignment votes
  const votes = { left: 0, center: 0, right: 0 };
  for (const e of elements) {
    const cx = e.box.x + e.box.width / 2;
    if (Math.abs(cx - W / 2) < W * 0.04) votes.center++;
    else if (Math.abs(e.box.x - margins.left) < W * 0.03) votes.left++;
    else if (Math.abs(e.box.x + e.box.width - (W - margins.right)) < W * 0.03) votes.right++;
  }
  const total = votes.left + votes.center + votes.right || 1;
  const topVote = (Object.entries(votes) as [keyof typeof votes, number][]).sort((a, b) => b[1] - a[1])[0];
  const alignment = topVote[1] / total > 0.55 ? topVote[0] : "mixed";

  // Symmetry: mirrored mass comparison on a coarse grid.
  const G = 12;
  const grid = new Float32Array(G * G);
  for (const e of elements) {
    for (let gy = 0; gy < G; gy++)
      for (let gx = 0; gx < G; gx++) {
        const cell = { x: (gx * W) / G, y: (gy * H) / G, width: W / G, height: H / G };
        const ix = Math.max(0, Math.min(cell.x + cell.width, e.box.x + e.box.width) - Math.max(cell.x, e.box.x));
        const iy = Math.max(0, Math.min(cell.y + cell.height, e.box.y + e.box.height) - Math.max(cell.y, e.box.y));
        grid[gy * G + gx] += (ix * iy) / (cell.width * cell.height);
      }
  }
  let diff = 0;
  let mass = 0;
  for (let gy = 0; gy < G; gy++)
    for (let gx = 0; gx < G / 2; gx++) {
      const a = Math.min(1, grid[gy * G + gx]);
      const b = Math.min(1, grid[gy * G + (G - 1 - gx)]);
      diff += Math.abs(a - b);
      mass += a + b;
    }
  const symmetry = mass ? Math.max(0, 1 - diff / mass) : 1;

  const sizes = texts.map((t) => t.font.sizePx).sort((a, b) => a - b);
  const bodySize = sizes.length ? sizes[Math.floor(sizes.length / 3)] : 16;
  const baseline = Math.max(4, Math.round((bodySize * 1.25) / 4) * 4);

  return {
    columns,
    rows,
    gutter,
    margins,
    padding,
    alignment,
    columnGuides: colGaps.map(([a, b]) => Math.round((a + b) / 2)),
    rowGuides: rowGaps.map(([a, b]) => Math.round((a + b) / 2)),
    baseline,
    symmetry: Math.round(symmetry * 100) / 100,
    hierarchy: elements
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 10)
      .map((e) => ({ id: e.id, label: e.label, weight: Math.round(e.weight * 100) / 100 })),
  };
}

/** Empty strips along one axis given occupied spans. */
function gaps(spans: number[][], start: number, end: number, minGap: number): [number, number][] {
  const sorted = spans.map(([a, b]) => [a, b]).sort((a, b) => a[0] - b[0]);
  const out: [number, number][] = [];
  let cursor = start;
  for (const [a, b] of sorted) {
    if (a - cursor > minGap && cursor > start) out.push([cursor, a]);
    cursor = Math.max(cursor, b);
  }
  return out.filter(([a, b]) => b <= end && a >= start);
}

export const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
