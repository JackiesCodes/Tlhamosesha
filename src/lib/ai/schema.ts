// Shared contract between the server vision providers and the client pipeline.
import { z } from "zod";

const nbox = z.tuple([z.number(), z.number(), z.number(), z.number()]); // x, y, w, h normalised 0..1

export const VisionResponseSchema = z.object({
  designType: z.object({ label: z.string(), confidence: z.number() }).optional(),
  categories: z.array(z.object({ label: z.string(), confidence: z.number() })).optional(),
  texts: z
    .array(
      z.object({
        text: z.string(),
        role: z.string().optional(),
        box: nbox,
        fontFamily: z.string().optional(),
        fontWeight: z.number().optional(),
        color: z.string().optional(),
      }),
    )
    .optional(),
  objects: z
    .array(
      z.object({
        kind: z.string(),
        label: z.string(),
        box: nbox,
        confidence: z.number().optional(),
        mask: z.string().optional(), // optional PNG data URL from a segmentation service
      }),
    )
    .optional(),
  notes: z.string().optional(),
});

export type VisionResponse = z.infer<typeof VisionResponseSchema>;

export interface ProviderResult {
  provider: "openai" | "gemini" | "claude" | "vision-service";
  label: string;
  status: "ok" | "skipped" | "error";
  durationMs: number;
  data?: VisionResponse;
  error?: string;
}

export const VISION_PROMPT = `You are the vision engine of Tlhamosesha AI, a poster reverse-engineering tool.
Analyse the attached design (poster, sports graphic, banner, flyer, infographic, ad, diagram or artwork).
Return ONLY a JSON object, no prose, matching exactly:
{
  "designType": {"label": string, "confidence": number 0..1},
  "categories": [{"label": string, "confidence": number}],  // up to 4 alternatives, e.g. "Sports Poster", "Marketing Banner", "Product Advertisement", "Event Flyer", "Infographic", "Magazine Page", "Technical Diagram", "Social Media Graphic", "Visual Artwork"
  "texts": [{"text": string, "role": "headline"|"subheadline"|"caption"|"statistic"|"score"|"date"|"name"|"cta"|"body", "box": [x,y,w,h], "fontFamily": string (closest Google Font), "fontWeight": number 100..900, "color": "#RRGGBB"}],
  "objects": [{"kind": "person"|"face"|"product"|"vehicle"|"building"|"object"|"logo"|"icon", "label": string (specific, e.g. "Player", "Team badge", "Sponsor logo", "Sneaker"), "box": [x,y,w,h], "confidence": number 0..1}],
  "notes": string
}
All boxes are normalised to the image: x,y = top-left corner, w,h = size, each 0..1.
Be exhaustive for text lines and logos. Keep boxes tight.`;
