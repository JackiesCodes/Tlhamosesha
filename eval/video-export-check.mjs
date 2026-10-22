// Checks the rebuilt-video export: uploads each test video, exports it through
// the app's dialog (with a soundtrack), then compares the export with the
// original frame by frame.
//
//   node video-export-check.mjs [limit=4] [baseUrl=http://localhost:3100]
//
// Reports the file's format, streams and duration, and per video the mean
// absolute difference (0–255, greyscale, 320 px wide) and PSNR between the
// original and the rebuilt video at 4 frames per second.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { chromium } from "playwright-core";

const LIMIT = +(process.argv[2] ?? 4);
const BASE = process.argv[3] ?? "http://localhost:3100";
const DIR = import.meta.dirname;
const VID = path.join(DIR, "videos");
const OUT = path.join(DIR, "results", "exports");
fs.mkdirSync(OUT, { recursive: true });

const index = JSON.parse(fs.readFileSync(path.join(VID, "index.json")));
const gray = (file, w, h) =>
  execFileSync("ffmpeg", ["-loglevel", "error", "-i", file, "-vf", `fps=4,scale=${w}:${h}`, "-f", "rawvideo", "-pix_fmt", "gray", "-"], { maxBuffer: 1 << 30 });
const probe = (file) => JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_entries", "stream=codec_type,codec_name:format=duration,format_name", "-of", "json", file]).toString());

/** Renders the Lottie with lottie-web at the same 4 fps and compares it with the rebuilt video's frames. */
async function compareLottie(file, videoFrames, w, h, duration) {
  const page = await browser.newPage();
  await page.setContent("<body style='margin:0'></body>");
  await page.addScriptTag({ path: path.join(DIR, "node_modules/lottie-web/build/player/lottie_canvas.min.js") });
  const frames = await page.evaluate(
    async ({ json, w, h, duration }) => {
      const data = JSON.parse(json);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      document.body.append(canvas);
      const ctx = canvas.getContext("2d");
      const anim = lottie.loadAnimation({ renderer: "canvas", loop: false, autoplay: false, animationData: data, rendererSettings: { context: ctx, clearCanvas: true } });
      await new Promise((r) => anim.addEventListener("loaded_images", r));
      const out = [];
      for (let t = 0; t < duration - 1e-6; t += 0.25) {
        anim.goToAndStop(t * data.fr, true);
        const d = ctx.getImageData(0, 0, w, h).data;
        const g = new Array(w * h);
        for (let p = 0, i = 0; p < g.length; p++, i += 4) g[p] = Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
        out.push(g);
      }
      return out;
    },
    { json: fs.readFileSync(file, "utf8"), w, h, duration },
  );
  await page.close();
  let sad = 0, se = 0, n = 0;
  frames.forEach((g, f) => {
    for (let p = 0; p < g.length; p++) {
      const v = videoFrames[f * w * h + p];
      if (v === undefined) continue;
      const d = g[p] - v;
      sad += Math.abs(d);
      se += d * d;
      n++;
    }
  });
  return { mad: +(sad / n).toFixed(2), psnr: +(10 * Math.log10((255 * 255) / (se / n))).toFixed(1) };
}

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? "/opt/pw-browsers/chromium", args: ["--autoplay-policy=no-user-gesture-required"] });
const rows = [];
for (const item of index.videos.slice(0, LIMIT)) {
  const src = path.join(VID, item.file);
  // A copy of the video with a tone as its soundtrack, to check sound is carried over.
  const withSound = path.join(OUT, item.file.replace(".webm", "-sound.webm"));
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", src, "-f", "lavfi", "-i", "sine=frequency=440", "-shortest", "-c:v", "copy", "-c:a", "libopus", withSound]);

  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/upload`);
  await page.locator("input[type=file]").first().setInputFiles(src);
  await page.waitForURL(/projects\/prj_/, { timeout: 600000 });
  await page.getByRole("button", { name: /Export/ }).first().click();
  await page.getByText("Rebuilt video").click();
  await page.locator('input[type=file][accept*="audio"]').setInputFiles(withSound);
  const t0 = Date.now();
  const [dl] = await Promise.all([
    page.waitForEvent("download", { timeout: 600000 }),
    page.getByRole("button", { name: /^Export (MP4|WebM)$/ }).click(),
  ]);
  const seconds = (Date.now() - t0) / 1000;
  const file = path.join(OUT, dl.suggestedFilename().replace(/^/, item.file.replace(".webm", "") + "-"));
  await dl.saveAs(file);
  const note = await page.locator('[role="status"]').last().innerText().catch(() => "");
  // Lottie from the same project, to compare with the rebuilt video.
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Close" }).click().catch(() => {});
  await page.getByRole("button", { name: /Export/ }).first().click();
  await page.waitForTimeout(500);
  if (process.env.DEBUG_SHOT) await page.screenshot({ path: process.env.DEBUG_SHOT });
  const [lottieDl] = await Promise.all([page.waitForEvent("download", { timeout: 300000 }), page.getByText("Lottie animation").click()]);
  const lottieFile = path.join(OUT, item.file.replace(".webm", "") + "-lottie.json");
  await lottieDl.saveAs(lottieFile);
  await ctx.close();

  const info = probe(file);
  const gt = JSON.parse(fs.readFileSync(src.replace(".webm", ".json")));
  const w = 320, h = Math.round((320 * gt.height) / gt.width / 2) * 2;
  const a = gray(src, w, h), b = gray(file, w, h);
  const n = Math.min(a.length, b.length);
  let sad = 0, se = 0;
  for (let i = 0; i < n; i++) { const d = a[i] - b[i]; sad += Math.abs(d); se += d * d; }
  const mad = sad / n, psnr = 10 * Math.log10((255 * 255) / (se / n));
  const lottie = await compareLottie(lottieFile, b, w, h, gt.duration);
  const row = {
    file: item.file,
    duration: gt.duration,
    exportSeconds: seconds,
    format: info.format.format_name,
    exportDuration: +(+info.format.duration).toFixed(2),
    streams: info.streams.map((s) => `${s.codec_type}:${s.codec_name}`).join(" "),
    meanAbsDiff: +mad.toFixed(2),
    psnr: +psnr.toFixed(1),
    lottieVsVideoDiff: lottie.mad,
    lottieVsVideoPsnr: lottie.psnr,
    lottieKB: Math.round(fs.statSync(lottieFile).size / 1024),
    note,
  };
  rows.push(row);
  console.log(`${row.file} ${gt.duration.toFixed(1)}s → ${row.format} ${row.streams} ${row.exportDuration}s in ${seconds.toFixed(1)}s · vs original: diff ${row.meanAbsDiff}, PSNR ${row.psnr} dB · Lottie (${row.lottieKB} KB) vs video: diff ${row.lottieVsVideoDiff}, PSNR ${row.lottieVsVideoPsnr} dB`);
}
await browser.close();
fs.writeFileSync(path.join(DIR, "results", "video-export-check.json"), JSON.stringify(rows, null, 2));
const mean = (k) => rows.reduce((s, r) => s + r[k], 0) / rows.length;
console.log(`\nmean difference ${mean("meanAbsDiff").toFixed(2)} (0–255) · mean PSNR ${mean("psnr").toFixed(1)} dB · export time ${(mean("exportSeconds") / mean("duration")).toFixed(2)}× video length`);
