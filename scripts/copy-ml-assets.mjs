// Copies the ONNX Runtime (WebGPU + WASM) build into public/ml so the AI
// models run fully self-hosted (no CDN required).
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const dist = "node_modules/onnxruntime-web/dist";
const files = ["ort.webgpu.min.mjs", "ort-wasm-simd-threaded.asyncify.mjs", "ort-wasm-simd-threaded.asyncify.wasm"];
if (!files.every((f) => existsSync(join(dist, f)))) {
  console.warn("[ml] onnxruntime-web not found — AI cut-outs and background fill will be unavailable.");
  process.exit(0);
}
mkdirSync("public/ml", { recursive: true });
for (const f of files) cpSync(join(dist, f), join("public/ml", f));
console.log("[ml] Copied ONNX Runtime to public/ml");
