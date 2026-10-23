// Runs every fixture through the real app and scores the results.
//
//   node run.mjs <label> [baseUrl=http://localhost:3100] [limit]
//
// Needs the app running (npm run build && npm start). Writes
// eval/results/<label>.json and prints a summary; if a "baseline" result
// exists, prints the change against it.
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const LABEL = process.argv[2] ?? "latest";
const BASE = process.argv[3] ?? "http://localhost:3100";
const LIMIT = +(process.argv[4] ?? 999);
const DIR = import.meta.dirname;
const SET = process.env.EVAL_SET; // e.g. EVAL_SET=heldout reads fixtures-heldout/
const FIX = path.join(DIR, SET ? `fixtures-${SET}` : "fixtures");
const RES = path.join(DIR, "results");
fs.mkdirSync(RES, { recursive: true });

// ---------------------------------------------------------------- metrics helpers
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
const rgb = (s) => (s.startsWith("#") ? [1, 3, 5].map((k) => parseInt(s.slice(k, k + 2), 16)) : s.match(/\d+/g).slice(0, 3).map(Number));
const colorDist = (a, b) => Math.hypot(...a.map((v, k) => v - b[k]));
const mean = (xs) => (xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : NaN);
const median = (xs) => { if (!xs.length) return NaN; const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };

function scorePoster(gt, a) {
  const preds = a.texts;
  const r = { texts: [], objects: [], fpTexts: [], fpObjects: [] };
  // --- text: a GT line is matched by every predicted line that mostly sits on it
  for (const g of gt.texts) {
    const hits = preds.filter((p) => inter(p.box, g.box) / area(p.box) >= 0.5 || inter(p.box, g.box) / area(g.box) >= 0.5);
    const joined = hits.sort((p, q) => p.box.x - q.box.x).map((p) => p.text).join(" ");
    const best = hits.sort((p, q) => inter(q.box, g.box) - inter(p.box, g.box))[0];
    const acc = charAcc(g.text, joined);
    r.texts.push({
      text: g.text,
      role: g.role,
      lowContrast: g.lowContrast,
      found: acc >= 0.8,
      acc,
      pred: joined,
      sizeErr: best ? Math.abs(best.font.sizePx - g.fontSize) / g.fontSize : null,
      fontOk: best ? best.font.family === g.fontFamily.split(",")[0].trim() : null,
      weightOk: best ? Math.abs(best.font.weight - g.fontWeight) <= 100 : null,
      colorOk: best ? colorDist(rgb(best.color), rgb(g.color)) < 60 : null,
      roleOk: best ? best.role === g.role : null,
    });
  }
  const logos = gt.objects.filter((o) => o.kind === "logo");
  for (const p of preds) {
    const onText = gt.texts.some((g) => inter(p.box, g.box) / area(p.box) >= 0.3);
    const inLogo = logos.some((o) => inter(p.box, o.box) / area(p.box) >= 0.6);
    if (!onText && !inLogo) r.fpTexts.push(p.text);
  }
  // headline: is the largest GT line the one labelled headline?
  const gHead = gt.texts.find((g) => g.role === "headline");
  const pHead = preds.find((p) => p.role === "headline");
  r.headlineOk = !!(gHead && pHead && inter(pHead.box, gHead.box) / area(pHead.box) >= 0.5);

  // --- objects: greedy IoU matching
  const pObjs = a.objects.filter((o) => o.kind !== "face");
  const used = new Set();
  for (const g of gt.objects) {
    let best = -1, bestIoU = 0;
    pObjs.forEach((p, k) => { if (used.has(k)) return; const v = iou(p.box, g.box); if (v > bestIoU) { bestIoU = v; best = k; } });
    const found = bestIoU >= 0.5;
    if (found) used.add(best);
    r.objects.push({ kind: g.kind, found, iou: +bestIoU.toFixed(2), predId: found ? pObjs[best].id : null, predKind: best >= 0 ? pObjs[best].kind : null, kindOk: found && pObjs[best].kind === g.kind });
  }
  pObjs.forEach((p, k) => {
    if (used.has(k)) return;
    const isButton = gt.button && iou(p.box, gt.button) >= 0.4;
    if (!isButton) r.fpObjects.push(`${p.kind}:${p.label}`);
  });
  r.designOk = a.metadata.designType.label === gt.designType;
  r.designPred = a.metadata.designType.label;
  return r;
}

function summarize(rows) {
  const T = rows.flatMap((r) => r.score.texts);
  const O = rows.flatMap((r) => r.score.objects);
  const s = {
    posters: rows.length,
    textRecall: mean(T.map((t) => (t.found ? 1 : 0))),
    charAccuracy: mean(T.map((t) => t.acc)),
    falseTextsPerPoster: mean(rows.map((r) => r.score.fpTexts.length)),
    fontSizeErrMedian: median(T.filter((t) => t.sizeErr != null).map((t) => t.sizeErr)),
    colorAccuracy: mean(T.filter((t) => t.colorOk != null).map((t) => (t.colorOk ? 1 : 0))),
    fontAccuracy: mean(T.filter((t) => t.fontOk != null).map((t) => (t.fontOk ? 1 : 0))),
    weightAccuracy: mean(T.filter((t) => t.weightOk != null).map((t) => (t.weightOk ? 1 : 0))),
    headlineAccuracy: mean(rows.map((r) => (r.score.headlineOk ? 1 : 0))),
    objectRecall: mean(O.map((o) => (o.found ? 1 : 0))),
    objectKindAccuracy: mean(O.filter((o) => o.found).map((o) => (o.kindOk ? 1 : 0))),
    falseObjectsPerPoster: mean(rows.map((r) => r.score.fpObjects.length)),
    designTypeAccuracy: mean(rows.map((r) => (r.score.designOk ? 1 : 0))),
    // Pixel truth (fixtures with .plate.png / .obj-N.png): cut-out matte IoU per
    // object (missed objects count as 0) and background error where text and
    // objects were removed (mean |ΔRGB|, 0–255).
    cutoutIoU: mean(O.filter((o) => o.maskIoU != null).map((o) => o.maskIoU)),
    plateError: mean(rows.filter((r) => r.score.plate).map((r) => r.score.plate.hole)),
    secondsPerPoster: mean(rows.map((r) => r.seconds)),
  };
  return s;
}

// ---------------------------------------------------------------- run
const index = JSON.parse(fs.readFileSync(path.join(FIX, "index.json")));
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? "/opt/pw-browsers/chromium" });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
// EVAL_AI=0 runs the classical pipeline (no on-device AI models), for A/B runs.
if (process.env.EVAL_AI === "0") {
  await page.goto(`${BASE}/upload`);
  await page.evaluate(() => {
    const k = "tlhamosesha-app";
    const v = JSON.parse(localStorage.getItem(k) ?? '{"state":{"settings":{}},"version":0}');
    v.state.settings = { ocr: true, ocrInvertPass: true, cloud: false, sensitivity: 0.5, maxObjects: 14, reduceMotion: false, ...v.state.settings, aiModels: false };
    localStorage.setItem(k, JSON.stringify(v));
  });
}
const rows = [];
for (const item of index.posters.slice(0, LIMIT)) {
  const gt = JSON.parse(fs.readFileSync(path.join(FIX, item.file.replace(".png", ".json"))));
  await page.goto(`${BASE}/upload`);
  const t0 = Date.now();
  await page.locator('input[type=file][accept*="image"]').first().setInputFiles(path.join(FIX, item.file));
  await page.waitForURL(/projects\/prj_/, { timeout: 180000 });
  const seconds = (Date.now() - t0) / 1000;
  const id = page.url().split("/projects/")[1].split(/[?#]/)[0];
  const analysis = await page.evaluate(async (id) => {
    const db = await new Promise((r) => { const q = indexedDB.open("tlhamosesha-projects"); q.onsuccess = () => r(q.result); });
    const p = await new Promise((r) => { const q = db.transaction("projects").objectStore("projects").get(id); q.onsuccess = () => r(q.result); });
    const a = p.analysis;
    // Results are in the working image's pixels; rescale to the original size.
    return { texts: a.texts, objects: a.objects.map(({ cutout, crop, ...o }) => o), metadata: a.metadata };
  }, id);
  const k = gt.width / analysis.metadata.width;
  if (Math.abs(k - 1) > 0.001) {
    const sb = (b) => ({ x: b.x * k, y: b.y * k, width: b.width * k, height: b.height * k });
    analysis.texts.forEach((t) => { t.box = sb(t.box); t.font.sizePx *= k; });
    analysis.objects.forEach((o) => (o.box = sb(o.box)));
  }
  const score = scorePoster(gt, analysis);
  const base = path.join(FIX, item.file.replace(".png", ""));
  if (fs.existsSync(`${base}.plate.png`)) {
    const b64 = (f) => "data:image/png;base64," + fs.readFileSync(f).toString("base64");
    const px = await page.evaluate(
      async ({ id, k, plate, masks, pairs, holes }) => {
        const db = await new Promise((r) => { const q = indexedDB.open("tlhamosesha-projects"); q.onsuccess = () => r(q.result); });
        const p = await new Promise((r) => { const q = db.transaction("projects").objectStore("projects").get(id); q.onsuccess = () => r(q.result); });
        const load = (src) => new Promise((r, e) => { const i = new Image(); i.onload = () => r(i); i.onerror = e; i.src = src; });
        const truthPlate = await load(plate);
        const W = truthPlate.naturalWidth, H = truthPlate.naturalHeight;
        const read = (draw) => { const c = document.createElement("canvas"); c.width = W; c.height = H; const x = c.getContext("2d"); draw(x); return x.getImageData(0, 0, W, H).data; };
        const alpha = (d) => { const a = new Uint8Array(W * H); for (let i = 0; i < a.length; i++) a[i] = d[i * 4 + 3] > 127 ? 1 : 0; return a; };
        const region = new Uint8Array(W * H);
        // Truth mattes, and the hole region they plus the text make.
        const truth = [];
        for (const m of masks) {
          const img = await load(m);
          const d = read((x) => x.drawImage(img, 0, 0));
          truth.push(alpha(d));
          for (let i = 0; i < W * H; i++) if (d[i * 4 + 3] > 12) region[i] = 1;
        }
        for (const b of holes) {
          for (let y = Math.max(0, Math.floor(b.y - 3)); y < Math.min(H, Math.ceil(b.y + b.height + 3)); y++)
            for (let x = Math.max(0, Math.floor(b.x - 3)); x < Math.min(W, Math.ceil(b.x + b.width + 3)); x++) region[y * W + x] = 1;
        }
        const objIoU = [];
        for (const [j, pid] of pairs.entries()) {
          if (!pid) { objIoU.push(0); continue; }
          const o = p.analysis.objects.find((q) => q.id === pid);
          const img = await load(o.cutout);
          const pa = alpha(read((x) => x.drawImage(img, o.box.x * k, o.box.y * k, o.box.width * k, o.box.height * k)));
          let I = 0, U = 0;
          for (let i = 0; i < W * H; i++) { I += pa[i] & truth[j][i]; U += pa[i] | truth[j][i]; }
          objIoU.push(U ? I / U : 0);
        }
        const baseLayer = p.analysis.backgrounds.find((b) => b.kind === "base");
        const tp = read((x) => x.drawImage(truthPlate, 0, 0));
        const predImg = await load(baseLayer.image);
        const pd = read((x) => x.drawImage(predImg, 0, 0, W, H));
        let eh = 0, nh = 0, eo = 0, no = 0;
        for (let i = 0; i < W * H; i++) {
          const e = (Math.abs(pd[i * 4] - tp[i * 4]) + Math.abs(pd[i * 4 + 1] - tp[i * 4 + 1]) + Math.abs(pd[i * 4 + 2] - tp[i * 4 + 2])) / 3;
          if (region[i]) { eh += e; nh++; } else { eo += e; no++; }
        }
        return { objIoU, plate: { hole: nh ? eh / nh : 0, rest: no ? eo / no : 0 }, image: baseLayer.image };
      },
      {
        id,
        k: 1 / k,
        plate: b64(`${base}.plate.png`),
        masks: gt.objects.map((_, j) => b64(`${base}.obj-${j}.png`)),
        pairs: score.objects.map((o) => o.predId),
        holes: [...gt.texts.map((t) => t.box), ...(gt.button ? [gt.button] : [])],
      },
    );
    px.objIoU.forEach((v, j) => (score.objects[j].maskIoU = +v.toFixed(3)));
    score.plate = { hole: +px.plate.hole.toFixed(2), rest: +px.plate.rest.toFixed(2) };
    // SAVE_PLATES=<dir> keeps each rebuilt background for inspection.
    if (process.env.SAVE_PLATES) {
      fs.mkdirSync(process.env.SAVE_PLATES, { recursive: true });
      const [, b64] = px.image.split(",");
      fs.writeFileSync(path.join(process.env.SAVE_PLATES, item.file.replace(".png", ".plate.jpg")), Buffer.from(b64, "base64"));
    }
  }
  const pred = { objects: analysis.objects.map((o) => ({ kind: o.kind, label: o.label, box: o.box })), texts: analysis.texts.map((t) => ({ text: t.text, box: t.box, font: t.font, color: t.color })) };
  rows.push({ file: item.file, tier: item.tier, theme: item.theme, seconds, score, pred });
  const tf = score.texts.filter((t) => t.found).length;
  const of = score.objects.filter((o) => o.found).length;
  const pxNote = score.plate ? `  matte ${score.objects.map((o) => o.maskIoU?.toFixed(2)).join(",")}  bgErr ${score.plate.hole}` : "";
  console.log(`${item.file} ${item.tier.padEnd(8)} text ${tf}/${score.texts.length}  objects ${of}/${score.objects.length}  fpT ${score.fpTexts.length} fpO ${score.fpObjects.length}  ${score.designOk ? "✓" : "✗ " + score.designPred}  ${seconds.toFixed(1)}s${pxNote}`);
}
await browser.close();

const overall = summarize(rows);
const TIERS = SET === "real" ? ["real"] : ["clean", "textured", "photo"];
const byTier = Object.fromEntries(TIERS.map((t) => [t, summarize(rows.filter((r) => r.tier === t))]));
fs.writeFileSync(path.join(RES, `${SET ? SET + "-" : ""}${LABEL}.json`), JSON.stringify({ label: LABEL, at: new Date().toISOString(), overall, byTier, rows }, null, 2));

const pct = (v) => (Number.isNaN(v) ? "  –  " : (v * 100).toFixed(1).padStart(5) + "%");
const num = (v) => (Number.isNaN(v) ? "  –  " : v.toFixed(2).padStart(6));
const baseFile = path.join(RES, SET ? `${SET}-baseline.json` : "baseline.json");
const base = LABEL !== "baseline" && fs.existsSync(baseFile) ? JSON.parse(fs.readFileSync(baseFile)) : null;
const metrics = [
  ["Text lines found", "textRecall", pct, true],
  ["Character accuracy", "charAccuracy", pct, true],
  ["False text / poster", "falseTextsPerPoster", num, false],
  ["Font size error (median)", "fontSizeErrMedian", pct, false],
  ["Text colour correct", "colorAccuracy", pct, true],
  ["Font family correct", "fontAccuracy", pct, true],
  ["Font weight within 100", "weightAccuracy", pct, true],
  ["Headline identified", "headlineAccuracy", pct, true],
  ["Objects found", "objectRecall", pct, true],
  ["Object type correct", "objectKindAccuracy", pct, true],
  ["False objects / poster", "falseObjectsPerPoster", num, false],
  ["Design type correct", "designTypeAccuracy", pct, true],
  ["Cut-out matte IoU", "cutoutIoU", pct, true],
  ["Background error (holes)", "plateError", num, false],
  ["Seconds / poster", "secondsPerPoster", num, false],
];
console.log(`\n${LABEL} — ${rows.length} posters`);
console.log("metric".padEnd(28), "all".padStart(7), ...TIERS.map((t) => t.padStart(9)), base ? "  vs baseline" : "");
for (const [name, key, fmt, up] of metrics) {
  let delta = "";
  if (base) {
    const d = overall[key] - base.overall[key];
    const good = up ? d > 0.0005 : d < -0.0005;
    const bad = up ? d < -0.0005 : d > 0.0005;
    delta = `  ${good ? "▲" : bad ? "▼" : "·"} ${fmt === pct ? (d * 100).toFixed(1) + " pts" : d.toFixed(2)}`;
  }
  console.log(name.padEnd(28), fmt(overall[key]).padStart(7), ...TIERS.map((t) => fmt(byTier[t][key]).padStart(9)), delta);
}
