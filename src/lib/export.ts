// Scene exporters: PNG, JPG, SVG, PDF and design-tool JSON interchange.
import { hexToRgb } from "./color";
import type { Project, Scene, SceneLayer, TextLayer } from "./types";
import { loadImage, makeCanvas } from "./vision/raster";

export type ExportFormat = "png" | "jpg" | "svg" | "pdf" | "psd-json" | "figma-json" | "canva-json";

export const EXPORT_FORMATS: { id: ExportFormat; label: string; ext: string; description: string }[] = [
  { id: "png", label: "PNG", ext: "png", description: "Lossless raster with transparency" },
  { id: "jpg", label: "JPG", ext: "jpg", description: "Compressed raster for sharing" },
  { id: "svg", label: "SVG", ext: "svg", description: "Vector container with live text" },
  { id: "pdf", label: "PDF", ext: "pdf", description: "Print-ready single page" },
  { id: "psd-json", label: "PSD-style JSON", ext: "psd.json", description: "Photoshop-like layer tree" },
  { id: "figma-json", label: "Figma JSON", ext: "figma.json", description: "Figma node document" },
  { id: "canva-json", label: "Canva JSON", ext: "canva.json", description: "Canva-style page elements" },
];

export const GOOGLE_FONTS = ["Inter", "Oswald", "Anton", "Bebas Neue", "Montserrat", "Playfair Display", "JetBrains Mono", "Poppins", "Roboto", "Archivo Black"];

export function cssFontStack(family: string) {
  return `"${family}", Inter, system-ui, sans-serif`;
}

export async function renderScene(scene: Scene, opts: { scale?: number; background?: boolean } = {}) {
  const scale = opts.scale ?? 1;
  const { canvas, ctx } = makeCanvas(scene.width * scale, scene.height * scale);
  ctx.scale(scale, scale);
  if (opts.background !== false) {
    ctx.fillStyle = scene.background;
    ctx.fillRect(0, 0, scene.width, scene.height);
  }
  if (typeof document !== "undefined" && document.fonts) await document.fonts.ready;
  for (const l of scene.layers) {
    if (!l.visible) continue;
    ctx.save();
    ctx.globalAlpha = l.opacity;
    ctx.translate(l.x + l.width / 2, l.y + l.height / 2);
    ctx.rotate((l.rotation * Math.PI) / 180);
    if (l.type === "image" || l.type === "background") {
      const img = await loadImage(l.src);
      ctx.drawImage(img, -l.width / 2, -l.height / 2, l.width, l.height);
    } else if (l.type === "text") {
      drawText(ctx, l);
    } else {
      ctx.fillStyle = l.fill;
      roundRect(ctx, -l.width / 2, -l.height / 2, l.width, l.height, l.radius);
      ctx.fill();
    }
    ctx.restore();
  }
  return canvas;
}

function drawText(ctx: CanvasRenderingContext2D, l: TextLayer) {
  ctx.fillStyle = l.color;
  ctx.font = `${l.fontWeight} ${l.fontSize}px ${cssFontStack(l.fontFamily)}`;
  if ("letterSpacing" in ctx) (ctx as unknown as { letterSpacing: string }).letterSpacing = `${l.letterSpacing}px`;
  ctx.textBaseline = "middle";
  ctx.textAlign = l.align;
  const text = l.uppercase ? l.text.toUpperCase() : l.text;
  const x = l.align === "left" ? -l.width / 2 : l.align === "right" ? l.width / 2 : 0;
  ctx.fillText(text, x, 0, l.width * 1.04);
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function sceneToSvg(scene: Scene) {
  const families = [...new Set(scene.layers.filter((l): l is TextLayer => l.type === "text").map((l) => l.fontFamily))];
  const fontCss = families.length
    ? `@import url('https://fonts.googleapis.com/css2?${families.map((f) => `family=${encodeURIComponent(f)}:wght@100..900`).join("&")}&display=swap');`
    : "";
  const body = scene.layers
    .filter((l) => l.visible)
    .map((l) => {
      const t = `transform="rotate(${l.rotation} ${l.x + l.width / 2} ${l.y + l.height / 2})" opacity="${l.opacity}"`;
      if (l.type === "image" || l.type === "background")
        return `  <image id="${l.id}" x="${l.x}" y="${l.y}" width="${l.width}" height="${l.height}" preserveAspectRatio="none" href="${l.src}" ${t}><title>${esc(l.name)}</title></image>`;
      if (l.type === "text") {
        const anchor = l.align === "left" ? "start" : l.align === "right" ? "end" : "middle";
        const x = l.align === "left" ? l.x : l.align === "right" ? l.x + l.width : l.x + l.width / 2;
        return `  <text id="${l.id}" x="${x}" y="${l.y + l.height / 2}" dominant-baseline="central" text-anchor="${anchor}" font-family="${esc(cssFontStack(l.fontFamily))}" font-size="${l.fontSize}" font-weight="${l.fontWeight}" letter-spacing="${l.letterSpacing}" fill="${l.color}" ${t}>${esc(l.uppercase ? l.text.toUpperCase() : l.text)}</text>`;
      }
      return `  <rect id="${l.id}" x="${l.x}" y="${l.y}" width="${l.width}" height="${l.height}" rx="${l.radius}" fill="${l.fill}" ${t}/>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${scene.width}" height="${scene.height}" viewBox="0 0 ${scene.width} ${scene.height}">
  <style>${fontCss}</style>
  <rect width="100%" height="100%" fill="${scene.background}"/>
${body}
</svg>`;
}

/** Minimal single-page PDF embedding a JPEG render (DCTDecode). */
export async function sceneToPdf(scene: Scene) {
  const canvas = await renderScene(scene, { scale: 2 });
  const jpeg = atob(canvas.toDataURL("image/jpeg", 0.92).split(",")[1]);
  const w = scene.width * 0.75; // px → pt
  const h = scene.height * 0.75;
  const content = `q ${w} 0 0 ${h} 0 0 cm /Im0 Do Q`;
  const objects = [
    `<< /Type /Catalog /Pages 2 0 R >>`,
    `<< /Type /Pages /Kids [3 0 R] /Count 1 >>`,
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`,
    null, // image
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    `<< /Producer (Decon) /Title (Reconstruction) >>`,
  ];
  const parts: string[] = ["%PDF-1.4\n%\xE2\xE3\xCF\xD3\n"];
  const offsets: number[] = [];
  let length = parts[0].length;
  objects.forEach((o, i) => {
    offsets.push(length);
    const body =
      o ??
      `<< /Type /XObject /Subtype /Image /Width ${canvas.width} /Height ${canvas.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n${jpeg}\nendstream`;
    const chunk = `${i + 1} 0 obj\n${body}\nendobj\n`;
    parts.push(chunk);
    length += chunk.length;
  });
  const xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  parts.push(xref, `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info 6 0 R >>\nstartxref\n${length}\n%%EOF`);
  const bin = parts.join("");
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i) & 0xff;
  return new Blob([bytes], { type: "application/pdf" });
}

const rgb01 = (hex: string) => {
  const [r, g, b] = hexToRgb(hex);
  return { r: r / 255, g: g / 255, b: b / 255, a: 1 };
};

export function sceneToPsdJson(p: Project) {
  const s = p.scene;
  return {
    $schema: "decon/psd-style@1",
    document: { name: p.name, width: s.width, height: s.height, resolution: 72, colorMode: "RGB", bitsPerChannel: 8 },
    layers: [...s.layers].reverse().map((l) => ({
      id: l.id,
      name: l.name,
      kind: l.type === "text" ? "textLayer" : l.type === "shape" ? "solidColorLayer" : l.type === "background" ? "backgroundLayer" : "pixelLayer",
      visible: l.visible,
      locked: l.locked,
      opacity: Math.round(l.opacity * 255),
      blendMode: "normal",
      bounds: { top: Math.round(l.y), left: Math.round(l.x), bottom: Math.round(l.y + l.height), right: Math.round(l.x + l.width) },
      rotation: l.rotation,
      ...(l.type === "text"
        ? {
            text: {
              content: l.text,
              font: { family: l.fontFamily, weight: l.fontWeight, size: l.fontSize, tracking: Math.round((l.letterSpacing / l.fontSize) * 1000) },
              color: (() => { const [r, g, b] = hexToRgb(l.color); return { r, g, b }; })(),
              justification: l.align,
              allCaps: l.uppercase,
            },
          }
        : l.type === "shape"
          ? { fill: l.fill, cornerRadius: l.radius }
          : { image: { dataUrl: l.src } }),
    })),
    analysis: { designType: p.analysis.metadata.designType, palette: p.analysis.palette.map((c) => c.hex) },
  };
}

export function sceneToFigmaJson(p: Project) {
  const s = p.scene;
  const node = (l: SceneLayer) => {
    const base = {
      id: l.id,
      name: l.name,
      visible: l.visible,
      locked: l.locked,
      opacity: l.opacity,
      rotation: l.rotation,
      absoluteBoundingBox: { x: l.x, y: l.y, width: l.width, height: l.height },
      constraints: { vertical: "TOP", horizontal: "LEFT" },
    };
    if (l.type === "text")
      return {
        ...base,
        type: "TEXT",
        characters: l.text,
        style: {
          fontFamily: l.fontFamily,
          fontWeight: l.fontWeight,
          fontSize: l.fontSize,
          letterSpacing: l.letterSpacing,
          lineHeightPx: l.fontSize * l.lineHeight,
          textAlignHorizontal: l.align.toUpperCase(),
          textAlignVertical: "CENTER",
          textCase: l.uppercase ? "UPPER" : "ORIGINAL",
        },
        fills: [{ type: "SOLID", color: rgb01(l.color) }],
      };
    if (l.type === "shape")
      return { ...base, type: "RECTANGLE", cornerRadius: l.radius, fills: [{ type: "SOLID", color: rgb01(l.fill) }] };
    return {
      ...base,
      type: "RECTANGLE",
      fills: [{ type: "IMAGE", scaleMode: "FILL", imageRef: l.id }],
    };
  };
  return {
    $schema: "decon/figma-document@1",
    name: p.name,
    document: {
      id: "0:0",
      type: "DOCUMENT",
      children: [
        {
          id: "0:1",
          type: "CANVAS",
          name: "Reconstruction",
          backgroundColor: rgb01("#1E1E1E"),
          children: [
            {
              id: "1:1",
              type: "FRAME",
              name: p.name,
              absoluteBoundingBox: { x: 0, y: 0, width: s.width, height: s.height },
              fills: [{ type: "SOLID", color: rgb01(s.background) }],
              clipsContent: true,
              children: s.layers.map(node),
            },
          ],
        },
      ],
    },
    images: Object.fromEntries(s.layers.filter((l) => l.type !== "text" && l.type !== "shape").map((l) => [l.id, (l as { src: string }).src])),
    styles: {
      colors: p.analysis.palette.map((c) => ({ name: `${c.role}/${c.name}`, color: rgb01(c.hex) })),
      text: [...new Set(p.analysis.texts.map((t) => `${t.font.family}|${t.font.weight}|${t.font.sizePx}|${t.role}`))].map((k) => {
        const [fontFamily, fontWeight, fontSize, role] = k.split("|");
        return { name: role, fontFamily, fontWeight: +fontWeight, fontSize: +fontSize };
      }),
    },
  };
}

export function sceneToCanvaJson(p: Project) {
  const s = p.scene;
  return {
    $schema: "decon/canva-design@1",
    title: p.name,
    dimensions: { width: s.width, height: s.height, units: "px" },
    pages: [
      {
        background: { color: s.background },
        elements: s.layers.map((l) => ({
          id: l.id,
          name: l.name,
          top: l.y,
          left: l.x,
          width: l.width,
          height: l.height,
          rotation: l.rotation,
          transparency: 1 - l.opacity,
          locked: l.locked,
          hidden: !l.visible,
          ...(l.type === "text"
            ? {
                type: "TEXT",
                text: {
                  content: l.uppercase ? l.text.toUpperCase() : l.text,
                  fontFamily: l.fontFamily,
                  fontWeight: l.fontWeight >= 600 ? "bold" : "normal",
                  fontSize: l.fontSize,
                  color: l.color,
                  textAlign: l.align,
                  letterSpacing: l.letterSpacing,
                },
              }
            : l.type === "shape"
              ? { type: "SHAPE", fill: { color: l.fill }, cornerRadius: l.radius }
              : { type: "IMAGE", image: { src: l.src, fit: l.fit } }),
        })),
      },
    ],
    brandKit: {
      colors: p.analysis.palette.map((c) => c.hex),
      fonts: [...new Set(p.analysis.texts.map((t) => t.font.family))],
    },
  };
}

export async function exportProject(p: Project, format: ExportFormat): Promise<{ blob: Blob; fileName: string }> {
  const base = p.name.replace(/[^\w-]+/g, "-").toLowerCase() || "poster";
  const ext = EXPORT_FORMATS.find((f) => f.id === format)!.ext;
  const fileName = `${base}.${ext}`;
  const json = (o: unknown) => new Blob([JSON.stringify(o, null, 2)], { type: "application/json" });
  switch (format) {
    case "png":
    case "jpg": {
      const c = await renderScene(p.scene);
      const blob = await new Promise<Blob>((res) =>
        c.toBlob((b) => res(b!), format === "png" ? "image/png" : "image/jpeg", 0.93),
      );
      return { blob, fileName };
    }
    case "svg":
      return { blob: new Blob([sceneToSvg(p.scene)], { type: "image/svg+xml" }), fileName };
    case "pdf":
      return { blob: await sceneToPdf(p.scene), fileName };
    case "psd-json":
      return { blob: json(sceneToPsdJson(p)), fileName };
    case "figma-json":
      return { blob: json(sceneToFigmaJson(p)), fileName };
    case "canva-json":
      return { blob: json(sceneToCanvaJson(p)), fileName };
  }
}

export async function assetsZip(p: Project) {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  const b64 = (d: string) => d.split(",")[1];
  const ext = (d: string) => (d.startsWith("data:image/png") ? "png" : "jpg");
  const objs = zip.folder("objects")!;
  p.analysis.objects.forEach((o, i) => {
    if (o.cutout) objs.file(`${String(i + 1).padStart(2, "0")}-${o.kind}-${o.label.replace(/\W+/g, "-").toLowerCase()}.png`, b64(o.cutout), { base64: true });
  });
  const bgs = zip.folder("backgrounds")!;
  p.analysis.backgrounds.forEach((b) => bgs.file(`${b.kind}.${ext(b.image)}`, b64(b.image), { base64: true }));
  zip.file("original." + ext(p.original), b64(p.original), { base64: true });
  zip.file(
    "text.json",
    JSON.stringify(p.analysis.texts, null, 2),
  );
  zip.file(
    "palette.json",
    JSON.stringify({ palette: p.analysis.palette, gradients: p.analysis.gradients }, null, 2),
  );
  zip.file("layout.json", JSON.stringify(p.analysis.layout, null, 2));
  zip.file("metadata.json", JSON.stringify({ ...p.analysis.metadata, dna: p.analysis.dna, engines: p.analysis.engines }, null, 2));
  return zip.generateAsync({ type: "blob" });
}
