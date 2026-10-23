// AI background plate: removes the detected text and objects from the
// original and fills what they covered with the inpainting model.
import { colorDistance, hexToRgb, type RGB } from "../color";
import type { DetectedObject, TextElement } from "../types";
import { inpaint, matteAt, type Matte } from "./ml";
import { dilate, makeCanvas } from "./raster";

/**
 * Pixels to fill (W×H, 1 = fill). Text contributes only its letters (plus a
 * margin for anti-aliasing, outlines and shadows), not its whole box, so the
 * background between and around letters stays original. Objects contribute
 * their matte where the matte covers them, else their box.
 */
export function holeMask(px: Uint8ClampedArray, W: number, H: number, texts: TextElement[], objects: DetectedObject[], matte?: Matte) {
  const hole = new Uint8Array(W * H);
  const at = (x: number, y: number): RGB => {
    const i = (y * W + x) * 4;
    return [px[i], px[i + 1], px[i + 2]];
  };
  for (const t of texts) {
    const b = t.box;
    const pad = Math.max(3, Math.round(b.height * 0.2));
    const x0 = Math.max(0, Math.floor(b.x - pad));
    const y0 = Math.max(0, Math.floor(b.y - pad));
    const x1 = Math.min(W - 1, Math.ceil(b.x + b.width + pad));
    const y1 = Math.min(H - 1, Math.ceil(b.y + b.height + pad));
    // Background colour around the line: median of its padded border ring.
    const ring: RGB[] = [];
    for (let x = x0; x <= x1; x += 2) ring.push(at(x, y0), at(x, y1));
    for (let y = y0; y <= y1; y += 2) ring.push(at(x0, y), at(x1, y));
    const med = (k: number) => ring.map((c) => c[k]).sort((a, b) => a - b)[ring.length >> 1];
    const bg: RGB = [med(0), med(1), med(2)];
    // Letters are the pixels near the text colour (anti-aliased edges are
    // caught by the dilation below). On flat backgrounds anything that isn't
    // background counts too, which also takes outlines and shadows.
    const fg = hexToRgb(t.color);
    const contrast = colorDistance(fg, bg);
    const spread = ring.map((c) => colorDistance(c, bg)).sort((a, b) => a - b)[Math.floor(ring.length * 0.8)];
    const flat = spread < 25;
    const local = new Uint8Array((x1 - x0 + 1) * (y1 - y0 + 1));
    const lw = x1 - x0 + 1;
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const inBox = x >= b.x - pad * 0.3 && x <= b.x + b.width + pad * 0.3 && y >= b.y - pad * 0.5 && y <= b.y + b.height + pad * 0.5;
        if (!inBox) continue;
        const c = at(x, y);
        const nearInk = colorDistance(c, fg) < Math.max(30, contrast * 0.55);
        if (nearInk || (flat && colorDistance(c, bg) > 32)) local[(y - y0) * lw + (x - x0)] = 1;
      }
    const grown = dilate(local, lw, y1 - y0 + 1, Math.max(2, Math.round(b.height * 0.07)));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (grown[(y - y0) * lw + (x - x0)]) hole[y * W + x] = 1;
  }
  const grow = Math.max(2, Math.round(Math.min(W, H) * 0.006));
  for (const o of objects) {
    if (o.kind === "face") continue;
    const b = o.box;
    const x0 = Math.max(0, Math.floor(b.x));
    const y0 = Math.max(0, Math.floor(b.y));
    const x1 = Math.min(W - 1, Math.ceil(b.x + b.width));
    const y1 = Math.min(H - 1, Math.ceil(b.y + b.height));
    let useMatte = false;
    if (matte) {
      let on = 0;
      let tot = 0;
      for (let y = y0; y <= y1; y += 4)
        for (let x = x0; x <= x1; x += 4) {
          tot++;
          if (matteAt(matte, x / W, y / H) > 0.5) on++;
        }
      useMatte = on / Math.max(1, tot) > 0.12;
    }
    const lw = x1 - x0 + 1;
    const local = new Uint8Array(lw * (y1 - y0 + 1));
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) if (!useMatte || matteAt(matte!, x / W, y / H) > 0.25) local[(y - y0) * lw + (x - x0)] = 1;
    // Grow inside a frame slightly larger than the box, so soft edges go too.
    const fx0 = Math.max(0, x0 - grow);
    const fy0 = Math.max(0, y0 - grow);
    const fx1 = Math.min(W - 1, x1 + grow);
    const fy1 = Math.min(H - 1, y1 + grow);
    const fw = fx1 - fx0 + 1;
    const frame = new Uint8Array(fw * (fy1 - fy0 + 1));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) frame[(y - fy0) * fw + (x - fx0)] = local[(y - y0) * lw + (x - x0)];
    const g = dilate(frame, fw, fy1 - fy0 + 1, grow);
    for (let y = fy0; y <= fy1; y++) for (let x = fx0; x <= fx1; x++) if (g[(y - fy0) * fw + (x - fx0)]) hole[y * W + x] = 1;
  }
  return hole;
}

/** Full-resolution background plate with text and objects removed. */
export async function aiPlate(
  img: HTMLImageElement,
  texts: TextElement[],
  objects: DetectedObject[],
  matte: Matte | undefined,
  onProgress?: (p: number) => void,
) {
  const W = img.naturalWidth;
  const H = img.naturalHeight;
  const { canvas, ctx } = makeCanvas(W, H);
  ctx.drawImage(img, 0, 0);
  const px = ctx.getImageData(0, 0, W, H).data;
  const hole = holeMask(px, W, H, texts, objects, matte);
  const known = new Uint8Array(W * H);
  for (let i = 0; i < hole.length; i++) known[i] = hole[i] ? 0 : 1;
  await inpaint(ctx, hole, onProgress);
  return { canvas, known };
}
