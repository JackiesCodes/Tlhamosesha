// Generates synthetic designed videos (animated poster scenes joined by cuts
// and fades) with an exact answer key.
//
//   node video-generate.mjs [count=12] [seed=101] [minScenes=3] [maxScenes=5]
//   EVAL_SET=long node video-generate.mjs 3 303 13 16    # ~60-second videos
//
// Each scene is a poster from posters.mjs whose text and objects animate in
// (fade, slide or scale) and sometimes out again, driven frame by frame with
// the Web Animations API and screenshotted in Chromium. ffmpeg joins the scenes
// with cuts or crossfades. Because every frame is rendered from known
// keyframes, scene boundaries, element boxes and in/out times are exact.
//
// Output: eval/videos/ (or videos-<EVAL_SET>/): video-NN.webm (VP9, what the
// eval plays), video-NN.mp4 (H.264, for manual checks in Chrome or Safari),
// video-NN.json (answer key) and index.json.
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { chromium } from "playwright-core";
import { createPosterKit, fitPoster, posterTruth } from "./posters.mjs";

const COUNT = +(process.argv[2] ?? 12);
const SEED = +(process.argv[3] ?? 101);
const MIN_SCENES = +(process.argv[4] ?? 3);
const MAX_SCENES = +(process.argv[5] ?? 5);
const FPS = 25;
const OUT = path.join(import.meta.dirname, process.env.EVAL_SET ? `videos-${process.env.EVAL_SET}` : "videos");
const TMP = path.join(OUT, ".tmp");
fs.mkdirSync(TMP, { recursive: true });

const kit = createPosterKit(SEED);
const { pick, between, rnd, buildPoster, posterHTML, fxScript, THEMES, PALETTES } = kit;
const FORMATS = [
  { w: 1080, h: 1920 },
  { w: 1920, h: 1080 },
  { w: 1080, h: 1080 },
];
const ENTER = 0.5; // seconds
const EXIT = 0.3;
const FADE = 0.6; // crossfade length between scenes

function run(cmd, args, input) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: [input ? "pipe" : "ignore", "ignore", "pipe"] });
    let err = "";
    p.stderr.on("data", (d) => (err += d));
    p.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}: ${err.slice(-800)}`))));
    if (input) input(p.stdin);
  });
}

/** Plans the animation of one scene: when each element enters and leaves, and how. */
function planScene(nText, nObj, dur) {
  const order = [...Array(nText + nObj).keys()].sort(() => rnd() - 0.5);
  const stagger = between(0.2, 0.4);
  return order.map((_, k) => {
    const tin = Math.min(dur - 1.4, 0.15 + order.indexOf(k) * stagger + between(0, 0.1));
    const leaves = rnd() < 0.25;
    const tout = leaves ? Math.max(tin + ENTER + 0.6, dur - between(0.7, 1.2)) : null;
    return { tin, tout, type: pick(["fade", "slide-up", "slide-left", "scale"]) };
  });
}

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? "/opt/pw-browsers/chromium" });
const index = [];
for (let v = 0; v < COUNT; v++) {
  const fmt = FORMATS[v % FORMATS.length];
  const tier = ["clean", "textured", "photo"][Math.floor(v / FORMATS.length) % 3];
  const themeKey = pick(Object.keys(THEMES));
  const palette = pick(PALETTES);
  const nScenes = Math.floor(between(MIN_SCENES, MAX_SCENES + 1));
  const scenes = [];
  const parts = [];

  for (let s = 0; s < nScenes; s++) {
    const P = buildPoster(v * 10 + s, { fmt, tier, themeKey, palette });
    const dur = Math.round(between(2.6, 5) * FPS) / FPS;
    const page = await browser.newPage({ viewport: { width: fmt.w, height: fmt.h }, deviceScaleFactor: 1 });
    await page.setContent(posterHTML(P), { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    await fitPoster(page);
    await page.evaluate(fxScript(P.tier, SEED * 1000 + v * 10 + s, P.p));
    const gt = await posterTruth(page);
    const roles = [...P.texts.map((t) => t.role), ...(P.cta ? ["cta"] : [])];
    gt.texts.forEach((t, k) => (t.role = roles[k]));

    // Animate the elements: text spans (the CTA as its whole button) and objects.
    const plan = planScene(gt.texts.length, gt.objects.length, dur);
    await page.evaluate(
      ({ plan, ENTER, EXIT }) => {
        const els = [
          ...[...document.querySelectorAll("[data-t]")].map((el) => el.closest("[data-cta]") ?? el),
          ...document.querySelectorAll(".obj"),
        ];
        const from = { fade: "none", "slide-up": "translateY(48px)", "slide-left": "translateX(64px)", scale: "scale(0.82)" };
        els.forEach((el, k) => {
          const a = plan[k];
          if (getComputedStyle(el).display === "inline") el.style.display = "inline-block";
          el.animate([{ opacity: 0, transform: from[a.type] }, { opacity: 1, transform: "none" }], {
            duration: ENTER * 1000,
            delay: a.tin * 1000,
            fill: "both",
            easing: "cubic-bezier(0.2, 0.8, 0.2, 1)",
          });
          if (a.tout != null) el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: EXIT * 1000, delay: a.tout * 1000, fill: "forwards" });
        });
        document.getAnimations().forEach((x) => x.pause());
      },
      { plan, ENTER, EXIT },
    );

    // Render every frame into an intermediate clip.
    const part = path.join(TMP, `v${v}-s${s}.mkv`);
    const frames = Math.round(dur * FPS);
    const poster = page.locator("#poster");
    await run("ffmpeg", ["-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(FPS), "-i", "-", "-c:v", "libx264", "-crf", "10", "-preset", "veryfast", "-pix_fmt", "yuv420p", part], async (stdin) => {
      for (let f = 0; f < frames; f++) {
        await page.evaluate((t) => document.getAnimations().forEach((x) => (x.currentTime = t)), (f / FPS) * 1000);
        stdin.write(await poster.screenshot({ type: "jpeg", quality: 92 }));
      }
      stdin.end();
    });
    parts.push(part);
    await page.close();

    const nT = gt.texts.length;
    scenes.push({
      dur,
      transitionIn: s === 0 ? null : rnd() < 0.3 ? "fade" : "cut",
      texts: gt.texts.map((t, k) => ({ ...t, anim: plan[k] })),
      objects: gt.objects.map((o, k) => ({ ...o, anim: plan[nT + k] })),
    });
  }

  // Join the scenes. A cut is a one-frame crossfade, so every join uses xfade.
  let start = 0;
  const filters = [];
  let prev = "[0:v]";
  scenes.forEach((sc, s) => {
    if (s > 0) {
      const len = sc.transitionIn === "fade" ? FADE : 1 / FPS;
      start = start + scenes[s - 1].dur - len;
      const out = s === scenes.length - 1 ? "[vout]" : `[x${s}]`;
      filters.push(`${prev}[${s}:v]xfade=transition=fade:duration=${len.toFixed(3)}:offset=${start.toFixed(3)}${out}`);
      prev = out;
      sc.transitionLength = len;
    }
    sc.start = +start.toFixed(3);
    sc.end = +(start + sc.dur).toFixed(3);
  });
  const duration = scenes[scenes.length - 1].end;
  const name = `video-${String(v).padStart(2, "0")}`;
  const inputs = parts.flatMap((p) => ["-i", p]);
  const map = scenes.length > 1 ? ["-filter_complex", filters.join(";"), "-map", "[vout]"] : [];
  await run("ffmpeg", ["-y", "-loglevel", "error", ...inputs, ...map, "-r", String(FPS), "-c:v", "libvpx-vp9", "-b:v", "0", "-crf", "30", "-deadline", "good", "-cpu-used", "5", "-row-mt", "1", "-pix_fmt", "yuv420p", path.join(OUT, `${name}.webm`)]);
  await run("ffmpeg", ["-y", "-loglevel", "error", ...inputs, ...map, "-r", String(FPS), "-c:v", "libx264", "-crf", "20", "-preset", "fast", "-pix_fmt", "yuv420p", "-movflags", "+faststart", path.join(OUT, `${name}.mp4`)]);
  parts.forEach((p) => fs.rmSync(p));

  // Answer key in video time. "in" is the middle of the entrance; "out" is the
  // middle of the exit, or the scene end (middle of a crossfade).
  const truth = {
    file: `${name}.webm`,
    width: fmt.w,
    height: fmt.h,
    fps: FPS,
    duration,
    tier,
    theme: themeKey,
    cuts: scenes.slice(1).map((sc) => ({ time: +(sc.start + sc.transitionLength / 2).toFixed(3), type: sc.transitionIn })),
    scenes: scenes.map((sc, s) => {
      const next = scenes[s + 1];
      const sceneOut = next ? next.start + next.transitionLength / 2 : sc.end;
      const timing = (a) => ({
        in: +(sc.start + a.tin + ENTER / 2).toFixed(3),
        out: +(a.tout != null ? sc.start + a.tout + EXIT / 2 : sceneOut).toFixed(3),
        motion: a.type,
      });
      return {
        start: sc.start,
        end: +sceneOut.toFixed(3),
        texts: sc.texts.map(({ anim, ...t }) => ({ ...t, ...timing(anim) })),
        objects: sc.objects.map(({ anim, ...o }) => ({ ...o, ...timing(anim) })),
      };
    }),
  };
  fs.writeFileSync(path.join(OUT, `${name}.json`), JSON.stringify(truth, null, 2));
  index.push({ file: truth.file, tier, format: `${fmt.w}x${fmt.h}`, duration, scenes: scenes.length, cuts: truth.cuts.map((c) => c.type).join(",") });
  console.log(`${name} ${tier.padEnd(8)} ${fmt.w}x${fmt.h} ${duration.toFixed(1)}s ${scenes.length} scenes (${truth.cuts.map((c) => c.type).join(", ")})`);
}
fs.rmSync(TMP, { recursive: true, force: true });
fs.writeFileSync(path.join(OUT, "index.json"), JSON.stringify({ seed: SEED, count: COUNT, fps: FPS, videos: index }, null, 2));
await browser.close();
