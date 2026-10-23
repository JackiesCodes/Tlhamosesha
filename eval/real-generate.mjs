// Posters built around real photographs: a photographic cut-out (person,
// animal, car, product) over a real photo background, with the usual text,
// logos and icons on top. The cut-out's own matte is the answer key, so
// cut-out quality and background fill can be scored exactly.
//
//   REALKIT=/path/to/kit node real-generate.mjs [count=24] [seed=21]
//
// The kit holds subj-<name>.png (RGBA cut-outs) and bg-<name>.jpg (photos with
// their subject removed); see README for how it was made. Output goes to
// eval/fixtures-real/.
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";
import { captureLayerTruth, createPosterKit, fitPoster, mulberry32, posterTruth } from "./posters.mjs";

const COUNT = +(process.argv[2] ?? 24);
const SEED = +(process.argv[3] ?? 21);
const KIT = process.env.REALKIT;
if (!KIT) throw new Error("Set REALKIT to the folder with subj-*.png and bg-*.jpg");
const OUT = path.join(import.meta.dirname, "fixtures-real");
fs.mkdirSync(OUT, { recursive: true });

const kindOf = (name) => (/girl|person|astronaut/.test(name) ? "person" : /car|coffee|product|shoe/.test(name) ? "product" : "object");
const dataUrl = (f, type) => `data:${type};base64,${fs.readFileSync(path.join(KIT, f)).toString("base64")}`;
const subjects = fs
  .readdirSync(KIT)
  .filter((f) => f.startsWith("subj-"))
  .sort()
  .map((f) => {
    const png = fs.readFileSync(path.join(KIT, f));
    return { name: f.slice(5, -4), url: dataUrl(f, "image/png"), w: png.readUInt32BE(16), h: png.readUInt32BE(20), kind: kindOf(f) };
  });
const backgrounds = fs.readdirSync(KIT).filter((f) => f.startsWith("bg-")).sort();

const rnd = mulberry32(SEED * 7919);
const { buildPoster, posterHTML, fxScript } = createPosterKit(SEED);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? "/opt/pw-browsers/chromium" });
const index = [];
for (let i = 0; i < COUNT; i++) {
  const subject = subjects[i % subjects.length];
  // A background from a different photo than the subject.
  const others = backgrounds.filter((b) => b !== `bg-${subject.name}.jpg`);
  const bg = others[Math.floor(rnd() * others.length)];
  const themeKey = subject.kind === "person" ? (rnd() < 0.5 ? "sports" : "event") : rnd() < 0.5 ? "product" : "sale";
  const P = buildPoster(i, { real: { subject, bg: dataUrl(bg, "image/jpeg") }, themeKey });
  const page = await browser.newPage({ viewport: { width: P.fmt.w, height: P.fmt.h }, deviceScaleFactor: 1 });
  await page.setContent(posterHTML(P), { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  await fitPoster(page);
  await page.evaluate(fxScript(P.tier, SEED * 1000 + i, P.p));
  const gt = await posterTruth(page);
  const roles = [...P.texts.map((t) => t.role), ...(P.cta ? ["cta"] : [])];
  gt.texts.forEach((t, k) => (t.role = roles[k]));
  const file = `poster-${String(i).padStart(2, "0")}.png`;
  await page.locator("#poster").screenshot({ path: path.join(OUT, file) });
  await captureLayerTruth(page, path.join(OUT, file.replace(".png", "")));
  const truth = { file, width: P.fmt.w, height: P.fmt.h, tier: "real", theme: themeKey, designType: P.theme.type, subject: subject.name, background: bg, blur: P.blur, ...gt };
  fs.writeFileSync(path.join(OUT, file.replace(".png", ".json")), JSON.stringify(truth, null, 2));
  index.push({ file, tier: "real", theme: themeKey, format: `${P.fmt.w}x${P.fmt.h}`, texts: gt.texts.length, objects: gt.objects.length });
  await page.close();
}
fs.writeFileSync(path.join(OUT, "index.json"), JSON.stringify({ seed: SEED, count: COUNT, posters: index }, null, 2));
await browser.close();
