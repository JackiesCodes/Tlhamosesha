// Server-only vision provider adapters. Each returns the shared VisionResponse
// contract; the client merges them with the on-device pipeline.
import "server-only";
import { VISION_PROMPT, VisionResponseSchema, type ProviderResult, type VisionResponse } from "./schema";

export interface ProviderInfo {
  id: ProviderResult["provider"];
  label: string;
  enabled: boolean;
  model?: string;
}

export function providerStatus(): ProviderInfo[] {
  return [
    { id: "openai", label: "OpenAI Vision", enabled: !!process.env.OPENAI_API_KEY, model: process.env.OPENAI_VISION_MODEL || "gpt-4o" },
    { id: "gemini", label: "Gemini Vision", enabled: !!process.env.GEMINI_API_KEY, model: process.env.GEMINI_VISION_MODEL || "gemini-2.0-flash" },
    { id: "claude", label: "Claude Vision", enabled: !!process.env.ANTHROPIC_API_KEY, model: process.env.ANTHROPIC_VISION_MODEL || "claude-sonnet-5-5" },
    { id: "vision-service", label: "CV service (YOLO · SAM · rembg)", enabled: !!process.env.VISION_SERVICE_URL },
  ];
}

function splitDataUrl(dataUrl: string) {
  const m = /^data:(image\/[a-z+]+);base64,(.+)$/i.exec(dataUrl);
  if (!m) throw new Error("Expected a base64 image data URL");
  return { mediaType: m[1], base64: m[2] };
}

function parseJson(text: string): VisionResponse {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("Provider returned no JSON");
  const parsed = VisionResponseSchema.safeParse(JSON.parse(text.slice(start, end + 1)));
  if (!parsed.success) throw new Error("Provider JSON did not match schema");
  return parsed.data;
}

async function withTimeout<T>(p: (signal: AbortSignal) => Promise<T>, ms = 60_000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await p(ctrl.signal);
  } finally {
    clearTimeout(t);
  }
}

async function callOpenAI(image: string, model: string, signal: AbortSignal) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    signal,
    headers: { "content-type": "application/json", authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({
      model,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: VISION_PROMPT },
            { type: "image_url", image_url: { url: image, detail: "high" } },
          ],
        },
      ],
    }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}`);
  const json = await res.json();
  return parseJson(json.choices?.[0]?.message?.content ?? "");
}

async function callGemini(image: string, model: string, signal: AbortSignal) {
  const { mediaType, base64 } = splitDataUrl(image);
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      signal,
      headers: { "content-type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY! },
      body: JSON.stringify({
        contents: [{ parts: [{ text: VISION_PROMPT }, { inline_data: { mime_type: mediaType, data: base64 } }] }],
        generationConfig: { responseMimeType: "application/json" },
      }),
    },
  );
  if (!res.ok) throw new Error(`Gemini ${res.status}`);
  const json = await res.json();
  return parseJson(json.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? "");
}

async function callClaude(image: string, model: string, signal: AbortSignal) {
  const { mediaType, base64 } = splitDataUrl(image);
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    signal,
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
            { type: "text", text: VISION_PROMPT },
          ],
        },
      ],
    }),
  });
  if (!res.ok) throw new Error(`Claude ${res.status}`);
  const json = await res.json();
  return parseJson(
    (json.content ?? []).filter((b: { type: string }) => b.type === "text").map((b: { text: string }) => b.text).join(""),
  );
}

async function callVisionService(image: string, signal: AbortSignal) {
  const res = await fetch(`${process.env.VISION_SERVICE_URL!.replace(/\/$/, "")}/analyze`, {
    method: "POST",
    signal,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ image }),
  });
  if (!res.ok) throw new Error(`Vision service ${res.status}`);
  const parsed = VisionResponseSchema.safeParse(await res.json());
  if (!parsed.success) throw new Error("Vision service response did not match schema");
  return parsed.data;
}

export async function runProviders(image: string): Promise<ProviderResult[]> {
  const jobs = providerStatus().map(async (p): Promise<ProviderResult> => {
    if (!p.enabled) return { provider: p.id, label: p.label, status: "skipped", durationMs: 0 };
    const t = Date.now();
    try {
      const data = await withTimeout((signal) => {
        switch (p.id) {
          case "openai":
            return callOpenAI(image, p.model!, signal);
          case "gemini":
            return callGemini(image, p.model!, signal);
          case "claude":
            return callClaude(image, p.model!, signal);
          case "vision-service":
            return callVisionService(image, signal);
        }
      });
      return { provider: p.id, label: p.label, status: "ok", durationMs: Date.now() - t, data };
    } catch (e) {
      return {
        provider: p.id,
        label: p.label,
        status: "error",
        durationMs: Date.now() - t,
        error: e instanceof Error ? e.message : "Unknown error",
      };
    }
  });
  return Promise.all(jobs);
}

/**
 * Ensemble: the CV service owns object geometry when present; LLMs vote on
 * design type and contribute text/typography. Duplicate boxes are collapsed.
 */
export function mergeProviders(results: ProviderResult[]): { merged: VisionResponse | null; primary: ProviderResult["provider"] | null } {
  const ok = results.filter((r) => r.status === "ok" && r.data);
  if (!ok.length) return { merged: null, primary: null };
  const order = ["vision-service", "claude", "openai", "gemini"] as const;
  ok.sort((a, b) => order.indexOf(a.provider) - order.indexOf(b.provider));

  const votes = new Map<string, number[]>();
  for (const r of ok)
    for (const c of [r.data!.designType, ...(r.data!.categories ?? [])].filter(Boolean) as { label: string; confidence: number }[])
      votes.set(c.label, [...(votes.get(c.label) ?? []), c.confidence]);
  const categories = [...votes.entries()]
    .map(([label, cs]) => ({ label, confidence: (cs.reduce((a, b) => a + b, 0) / cs.length) * Math.min(1, 0.8 + 0.1 * cs.length) }))
    .sort((a, b) => b.confidence - a.confidence);

  const iou = (a: number[], b: number[]) => {
    const x0 = Math.max(a[0], b[0]);
    const y0 = Math.max(a[1], b[1]);
    const x1 = Math.min(a[0] + a[2], b[0] + b[2]);
    const y1 = Math.min(a[1] + a[3], b[1] + b[3]);
    const inter = Math.max(0, x1 - x0) * Math.max(0, y1 - y0);
    return inter / (a[2] * a[3] + b[2] * b[3] - inter || 1);
  };
  const texts: NonNullable<VisionResponse["texts"]> = [];
  const objects: NonNullable<VisionResponse["objects"]> = [];
  for (const r of ok) {
    for (const t of r.data!.texts ?? []) if (!texts.some((x) => iou(x.box, t.box) > 0.4)) texts.push(t);
    for (const o of r.data!.objects ?? []) if (!objects.some((x) => iou(x.box, o.box) > 0.4)) objects.push(o);
  }
  return {
    merged: { designType: categories[0], categories: categories.slice(1, 5), texts, objects, notes: ok[0].data!.notes },
    primary: ok[0].provider,
  };
}
