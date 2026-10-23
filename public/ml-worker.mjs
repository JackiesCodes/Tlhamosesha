// Runs the self-hosted AI models (ONNX Runtime, WebGPU with a WASM fallback)
// off the main thread. Model files are cached in Cache Storage after the
// first download.
//
// Messages in:  { id, type: "load", model, url }
//               { id, type: "run", model, feeds: { name: { data, dims } }, outputs?: string[] }
// Messages out: { id, type: "progress", loaded, total }
//               { id, type: "ready", backend }
//               { id, type: "result", outputs: { name: { data, dims } } }
//               { id, type: "error", message }
const CACHE = "revvisual-models-v1";
let ort;
const sessions = new Map();
let backend = null;

async function runtime() {
  if (ort) return ort;
  ort = await import("/ml/ort.webgpu.min.mjs");
  ort.env.wasm.wasmPaths = "/ml/";
  ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.min(4, Math.max(1, (navigator.hardwareConcurrency || 2) - 1)) : 1;
  ort.env.logLevel = "error";
  return ort;
}

async function hasWebGPU() {
  try {
    const adapter = await navigator.gpu?.requestAdapter();
    return !!adapter;
  } catch {
    return false;
  }
}

async function fetchModel(id, url) {
  let cache = null;
  try {
    cache = await caches.open(CACHE);
    const hit = await cache.match(url);
    if (hit) return new Uint8Array(await hit.arrayBuffer());
  } catch {
    cache = null; // private mode or storage blocked: download every time
  }
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`Couldn't download the AI model (${res.status}).`);
  const total = +(res.headers.get("content-length") || 0);
  const reader = res.body.getReader();
  const chunks = [];
  let loaded = 0;
  let last = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.length;
    if (loaded - last > 1 << 20) {
      last = loaded;
      self.postMessage({ id, type: "progress", loaded, total });
    }
  }
  const bytes = new Uint8Array(loaded);
  let o = 0;
  for (const c of chunks) {
    bytes.set(c, o);
    o += c.length;
  }
  try {
    await cache?.put(url, new Response(bytes, { headers: { "content-type": "application/octet-stream" } }));
  } catch {
    /* quota: fine, it's only a cache */
  }
  return bytes;
}

async function load(id, model, url) {
  if (sessions.has(model)) return sessions.get(model);
  const o = await runtime();
  const bytes = await fetchModel(id, url);
  const tryCreate = (ep) => o.InferenceSession.create(bytes, { executionProviders: [ep], graphOptimizationLevel: "all" });
  let session = null;
  if (backend !== "wasm" && (await hasWebGPU())) {
    try {
      session = await tryCreate("webgpu");
      backend = "webgpu";
    } catch {
      session = null;
    }
  }
  if (!session) {
    session = await tryCreate("wasm");
    backend = backend ?? "wasm";
  }
  sessions.set(model, session);
  return session;
}

self.onmessage = async ({ data: msg }) => {
  const { id } = msg;
  try {
    if (msg.type === "load") {
      await load(id, msg.model, msg.url);
      self.postMessage({ id, type: "ready", backend });
    } else if (msg.type === "run") {
      const session = sessions.get(msg.model);
      if (!session) throw new Error(`Model ${msg.model} isn't loaded.`);
      const feeds = {};
      for (const [k, v] of Object.entries(msg.feeds)) feeds[k] = new ort.Tensor("float32", v.data, v.dims);
      const res = await session.run(feeds, msg.outputs);
      const outputs = {};
      const transfer = [];
      for (const [k, t] of Object.entries(res)) {
        const data = t.location && t.location !== "cpu" ? await t.getData(true) : t.data;
        outputs[k] = { data, dims: t.dims };
        transfer.push(data.buffer);
      }
      self.postMessage({ id, type: "result", outputs }, transfer);
    }
  } catch (e) {
    self.postMessage({ id, type: "error", message: e instanceof Error ? e.message : String(e) });
  }
};
