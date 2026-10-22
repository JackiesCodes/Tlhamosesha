// Generates a deterministic set of synthetic posters with exact ground truth.
//
//   node generate.mjs [count=36] [seed=7]
//
// Each poster is rendered as HTML in Chromium and screenshotted to PNG. Text
// and object boxes come from the DOM, so the answer key is exact. Output goes
// to eval/fixtures/ (PNG + one ground-truth JSON per poster + index.json).
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";
import { createPosterKit, fitPoster, posterTruth } from "./posters.mjs";

const COUNT = +(process.argv[2] ?? 36);
const SEED = +(process.argv[3] ?? 7);
// EVAL_SET=heldout writes to fixtures-heldout/ (a second set, never tuned on).
const OUT = path.join(import.meta.dirname, process.env.EVAL_SET ? `fixtures-${process.env.EVAL_SET}` : "fixtures");
fs.mkdirSync(OUT, { recursive: true });

const { buildPoster, posterHTML, fxScript } = createPosterKit(SEED);

// ---------------------------------------------------------------- render
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? "/opt/pw-browsers/chromium" });
const index = [];
for (let i = 0; i < COUNT; i++) {
  const P = buildPoster(i);
  const page = await browser.newPage({ viewport: { width: P.fmt.w, height: P.fmt.h }, deviceScaleFactor: 1 });
  await page.setContent(posterHTML(P), { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  await fitPoster(page);
  await page.evaluate(fxScript(P.tier, SEED * 1000 + i, P.p));
  const gt = await posterTruth(page);
  // Roles come from the builder (DOM order: block a, block b, cta).
  const roles = [...P.texts.map((t) => t.role), ...(P.cta ? ["cta"] : [])];
  gt.texts.forEach((t, k) => (t.role = roles[k]));
  const file = `poster-${String(i).padStart(2, "0")}.png`;
  await page.locator("#poster").screenshot({ path: path.join(OUT, file) });
  const truth = { file, width: P.fmt.w, height: P.fmt.h, tier: P.tier, theme: P.themeKey, designType: P.theme.type, ...gt };
  fs.writeFileSync(path.join(OUT, file.replace(".png", ".json")), JSON.stringify(truth, null, 2));
  index.push({ file, tier: P.tier, theme: P.themeKey, format: `${P.fmt.w}x${P.fmt.h}`, texts: gt.texts.length, objects: gt.objects.length });
  await page.close();
}
fs.writeFileSync(path.join(OUT, "index.json"), JSON.stringify({ seed: SEED, count: COUNT, posters: index }, null, 2));
await browser.close();
