// Copies the Tesseract worker, WASM cores and English language data into
// public/ocr so OCR runs fully self-hosted (no CDN required).
import { cpSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";

const out = "public/ocr";
mkdirSync(join(out, "lang"), { recursive: true });

const worker = "node_modules/tesseract.js/dist/worker.min.js";
const coreDir = "node_modules/tesseract.js-core";
const lang = "node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz";

if (!existsSync(worker) || !existsSync(coreDir) || !existsSync(lang)) {
  console.warn("[ocr] Tesseract assets not found — OCR will fall back to the CDN.");
  process.exit(0);
}
cpSync(worker, join(out, "worker.min.js"));
for (const f of readdirSync(coreDir)) if (f.endsWith(".wasm.js")) cpSync(join(coreDir, f), join(out, f));
cpSync(lang, join(out, "lang", "eng.traineddata.gz"));
console.log("[ocr] Copied Tesseract assets to public/ocr");
