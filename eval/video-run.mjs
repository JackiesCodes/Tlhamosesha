// Runs every test video through the video lab page and scores the result.
//
//   node video-run.mjs <label> [baseUrl=http://localhost:3100] [limit]
//   EVAL_SET=heldout node video-run.mjs <label>     # reads videos-heldout/
//
// Needs the app running (npm run build && npx next start -p 3100). Writes
// eval/results/video-<label>.json and prints a summary against the Phase 0
// targets. Peak memory is the summed resident memory of the browser's
// processes while a video is analysed.
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { chromium } from "playwright-core";

const LABEL = process.argv[2] ?? "latest";
const BASE = process.argv[3] ?? "http://localhost:3100";
const LIMIT = +(process.argv[4] ?? 999);
const SET = process.env.EVAL_SET;
const DIR = import.meta.dirname;
const VID = path.join(DIR, SET ? `videos-${SET}` : "videos");
const RES = path.join(DIR, "results");
fs.mkdirSync(RES, { recursive: true });

// ---------------------------------------------------------------- helpers
const norm = (s) => s.toLowerCase().replace(/[^\p{L}\p{N}%]+/gu, " ").trim();
function lev(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
const charAcc = (gt, pred) => {
  const a = norm(gt), b = norm(pred);
  if (!a.length) return 1;
  return Math.max(0, 1 - lev(a, b) / Math.max(a.length, b.length));
};
const inter = (a, b) => Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
const area = (b) => b.width * b.height;
const iou = (a, b) => { const i = inter(a, b); return i / (area(a) + area(b) - i || 1); };
const mean = (xs) => (xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : NaN);
const median = (xs) => { if (!xs.length) return NaN; const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
const overlap = (a0, a1, b0, b1) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));

// Resident memory of this run's browser: the process launched with TAG and all its children.
const TAG = `--revvisual-eval=${process.pid}`;
function browserRssMB() {
  try {
    const rows = execSync("ps -eo pid=,ppid=,rss=,args=", { encoding: "utf8" })
      .trim()
      .split("\n")
      .map((l) => {
        const [pid, ppid, rss, ...args] = l.trim().split(/\s+/);
        return { pid: +pid, ppid: +ppid, rss: +rss, args: args.join(" ") };
      });
    const root = rows.find((r) => r.args.includes(TAG) && !rows.some((q) => q.pid === r.ppid && q.args.includes(TAG)));
    if (!root) return NaN;
    const tree = new Set([root.pid]);
    for (let grew = true; grew; ) {
      grew = false;
      for (const r of rows) {
        if (tree.has(r.pid) || !tree.has(r.ppid)) continue;
        tree.add(r.pid);
        grew = true;
      }
    }
    return rows.filter((r) => tree.has(r.pid)).reduce((s, r) => s + r.rss, 0) / 1024;
  } catch {
    return NaN;
  }
}

function scoreVideo(gt, pred) {
  const fps = gt.fps;
  // --- cuts: a cut matches within 2 frames, a fade within half its length
  const used = new Set();
  const cuts = gt.cuts.map((c) => {
    const tol = c.type === "cut" ? 2 / fps + 1e-3 : 0.3;
    let best = -1, bestD = Infinity;
    pred.cuts.forEach((p, k) => { const d = Math.abs(p.time - c.time); if (!used.has(k) && d <= tol && d < bestD) { best = k; bestD = d; } });
    if (best >= 0) used.add(best);
    return { type: c.type, found: best >= 0, error: best >= 0 ? bestD : null, typeOk: best >= 0 && pred.cuts[best].type === c.type };
  });
  const falseCuts = pred.cuts.length - used.size;

  // --- layers: each answer-key scene is compared with the predicted scene it overlaps most
  const texts = [];
  const objects = [];
  for (const g of gt.scenes) {
    const ps = pred.scenes.reduce((a, b) => (overlap(b.start, b.end, g.start, g.end) > overlap(a.start, a.end, g.start, g.end) ? b : a));
    for (const t of g.texts) {
      const hits = ps.texts.filter((p) => inter(p.box, t.box) / area(p.box) >= 0.5 || inter(p.box, t.box) / area(t.box) >= 0.5);
      const joined = [...hits].sort((p, q) => p.box.x - q.box.x).map((p) => p.text).join(" ");
      const acc = charAcc(t.text, joined);
      const best = [...hits].sort((p, q) => inter(q.box, t.box) - inter(p.box, t.box))[0];
      texts.push({ text: t.text, role: t.role, motion: t.motion, found: acc >= 0.8, acc, pred: joined, inErr: best ? Math.abs(best.in - t.in) : null, outErr: best ? Math.abs(best.out - t.out) : null });
    }
    const taken = new Set();
    for (const o of g.objects) {
      let best = -1, bestIoU = 0;
      ps.objects.forEach((p, k) => { if (taken.has(k)) return; const v = iou(p.box, o.box); if (v > bestIoU) { bestIoU = v; best = k; } });
      const found = bestIoU >= 0.5;
      if (found) taken.add(best);
      objects.push({ kind: o.kind, found, inErr: found ? Math.abs(ps.objects[best].in - o.in) : null, outErr: found ? Math.abs(ps.objects[best].out - o.out) : null });
    }
  }
  return { cuts, falseCuts, texts, objects, scenesOk: pred.scenes.length === gt.scenes.length };
}

function summarize(rows) {
  const C = rows.flatMap((r) => r.score.cuts);
  const T = rows.flatMap((r) => r.score.texts);
  const O = rows.flatMap((r) => r.score.objects);
  const timing = [...T, ...O].flatMap((x) => (x.inErr == null ? [] : [x.inErr, x.outErr]));
  const textTiming = T.flatMap((x) => (x.inErr == null ? [] : [x.inErr, x.outErr]));
  return {
    videos: rows.length,
    cutRecall: mean(C.map((c) => (c.found ? 1 : 0))),
    hardCutRecall: mean(C.filter((c) => c.type === "cut").map((c) => (c.found ? 1 : 0))),
    fadeRecall: mean(C.filter((c) => c.type === "fade").map((c) => (c.found ? 1 : 0))),
    falseCutsPerVideo: mean(rows.map((r) => r.score.falseCuts)),
    sceneCountOk: mean(rows.map((r) => (r.score.scenesOk ? 1 : 0))),
    textRecall: mean(T.map((t) => (t.found ? 1 : 0))),
    charAccuracy: mean(T.map((t) => t.acc)),
    objectRecall: mean(O.map((o) => (o.found ? 1 : 0))),
    textTimingMedian: median(textTiming),
    textTimingWithin025: mean(textTiming.map((e) => (e <= 0.25 ? 1 : 0))),
    layerTimingWithin025: mean(timing.map((e) => (e <= 0.25 ? 1 : 0))),
    speedRatio: mean(rows.map((r) => r.seconds / r.duration)),
    worstSpeedRatio: Math.max(...rows.map((r) => r.seconds / r.duration)),
    peakMemoryMB: Math.max(...rows.map((r) => r.peakMB)),
    idleMemoryMB: Math.round(mean(rows.map((r) => r.baseMB))),
  };
}

// ---------------------------------------------------------------- run
const indexFile = path.join(VID, "index.json");
const index = fs.existsSync(indexFile)
  ? JSON.parse(fs.readFileSync(indexFile))
  : { videos: fs.readdirSync(VID).filter((f) => /^video-\d+\.json$/.test(f)).sort().map((f) => ({ file: f.replace(".json", ".webm"), tier: JSON.parse(fs.readFileSync(path.join(VID, f))).tier })) };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? "/opt/pw-browsers/chromium", args: ["--autoplay-policy=no-user-gesture-required", TAG] });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const rows = [];
for (const item of index.videos.slice(0, LIMIT)) {
  const gt = JSON.parse(fs.readFileSync(path.join(VID, item.file.replace(".webm", ".json"))));
  await page.goto(`${BASE}/labs/video`);
  await page.evaluate(() => (window.__videoBreakdown = undefined));
  const baseMB = browserRssMB();
  let peakMB = baseMB;
  const sampler = setInterval(() => (peakMB = Math.max(peakMB, browserRssMB())), 500);
  const t0 = Date.now();
  await page.locator('input[type=file][accept*="video"]').setInputFiles(path.join(VID, item.file));
  await page.waitForFunction(() => window.__videoBreakdown !== undefined, null, { timeout: 15 * 60 * 1000, polling: 250 });
  const seconds = (Date.now() - t0) / 1000;
  clearInterval(sampler);
  const pred = await page.evaluate(() => {
    const r = window.__videoBreakdown;
    if (r.error) return r;
    // Layers are stored in each scene's working-image pixels; score in video pixels.
    const strip = (s) => (x) => {
      const k = r.width / s.analysis.metadata.width;
      const b = x.box;
      return { text: x.text, label: x.label, kind: x.kind, role: x.role, box: { x: b.x * k, y: b.y * k, width: b.width * k, height: b.height * k }, ...s.timing[x.id] };
    };
    return {
      duration: r.duration,
      framesAnalysed: r.framesAnalysed,
      timings: r.timings,
      stepMs: r.stepMs,
      cuts: r.cuts,
      scenes: r.scenes.map((s) => ({ start: s.start, end: s.end, keyframes: s.keyframes, texts: s.analysis.texts.map(strip(s)), objects: s.analysis.objects.map(strip(s)) })),
    };
  });
  if (pred.error) {
    console.log(`${item.file} ERROR ${pred.error}`);
    continue;
  }
  const score = scoreVideo(gt, pred);
  rows.push({ file: item.file, tier: item.tier, duration: gt.duration, seconds, peakMB: Math.round(peakMB), baseMB: Math.round(baseMB), frames: pred.framesAnalysed, timings: pred.timings, stepMs: pred.stepMs, pred: { cuts: pred.cuts, scenes: pred.scenes.map((s) => ({ start: s.start, end: s.end, keyframes: s.keyframes })) }, score });
  const cf = score.cuts.filter((c) => c.found).length;
  const tf = score.texts.filter((t) => t.found).length;
  console.log(
    `${item.file} ${item.tier.padEnd(8)} ${gt.duration.toFixed(1)}s  cuts ${cf}/${score.cuts.length} (+${score.falseCuts} false)  text ${tf}/${score.texts.length}  frames ${pred.framesAnalysed}  ${seconds.toFixed(1)}s (${(seconds / gt.duration).toFixed(2)}×)  ${Math.round(peakMB)} MB (idle ${Math.round(baseMB)})`,
  );
}
await browser.close();

const overall = summarize(rows);
const byTier = Object.fromEntries(["clean", "textured", "photo"].map((t) => [t, rows.some((r) => r.tier === t) ? summarize(rows.filter((r) => r.tier === t)) : null]));
fs.writeFileSync(path.join(RES, `video-${SET ? SET + "-" : ""}${LABEL}.json`), JSON.stringify({ label: LABEL, at: new Date().toISOString(), overall, byTier, rows }, null, 2));

const pct = (v) => (Number.isNaN(v) ? "–" : (v * 100).toFixed(1) + "%");
const lines = [
  ["Scene cuts found (≤2 frames)", pct(overall.hardCutRecall), "≥ 95%", overall.hardCutRecall >= 0.95],
  ["Crossfades found (≤0.3 s)", pct(overall.fadeRecall), "≥ 95%", overall.fadeRecall >= 0.95],
  ["False cuts per video", overall.falseCutsPerVideo.toFixed(2), "–", null],
  ["Text lines found per scene", pct(overall.textRecall), "≥ 85%", overall.textRecall >= 0.85],
  ["Character accuracy", pct(overall.charAccuracy), "–", null],
  ["Objects found per scene", pct(overall.objectRecall), "–", null],
  ["Text in/out within 0.25 s", pct(overall.textTimingWithin025), "most", null],
  ["Text in/out error (median)", `${overall.textTimingMedian.toFixed(2)} s`, "≤ 0.25 s", overall.textTimingMedian <= 0.25],
  ["Processing time ÷ video length", `${overall.speedRatio.toFixed(2)}× (worst ${overall.worstSpeedRatio.toFixed(2)}×)`, "≤ 3×", overall.worstSpeedRatio <= 3],
  ["Peak browser memory", `${overall.peakMemoryMB} MB (idle ${overall.idleMemoryMB})`, "< 1500 MB", overall.peakMemoryMB < 1500],
];
console.log(`\nvideo ${SET ? SET + " " : ""}${LABEL} — ${rows.length} videos`);
for (const [name, val, target, ok] of lines) console.log(`${name.padEnd(32)} ${val.padStart(22)}   target ${target.padEnd(9)} ${ok == null ? "" : ok ? "PASS" : "FAIL"}`);
