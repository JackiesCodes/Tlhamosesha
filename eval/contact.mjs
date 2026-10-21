// Contact sheet: posters with ground-truth boxes (pink = text, green = objects).
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";
const dir = path.join(import.meta.dirname, "fixtures");
const out = process.argv[2];
const files = fs.readdirSync(dir).filter((f) => /^poster-\d+\.json$/.test(f)).slice(0, +(process.argv[3] ?? 12));
const cells = files.map((f) => {
  const g = JSON.parse(fs.readFileSync(path.join(dir, f)));
  const img = fs.readFileSync(path.join(dir, g.file)).toString("base64");
  const s = 300 / Math.max(g.width, g.height);
  const boxes = [...g.texts.map((t) => ["#ff2d95", t.box]), ...g.objects.map((o) => ["#00c853", o.box])]
    .map(([c, b]) => `<div style="position:absolute;left:${b.x * s}px;top:${b.y * s}px;width:${b.width * s}px;height:${b.height * s}px;outline:1.5px solid ${c}"></div>`).join("");
  return `<div style="position:relative;width:${g.width * s}px;height:${g.height * s}px;background:url(data:image/png;base64,${img}) 0 0/100% 100%">${boxes}</div><div style="font:11px sans-serif">${g.file} · ${g.tier} · ${g.theme}</div>`;
});
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const p = await b.newPage({ viewport: { width: 1300, height: 800 } });
await p.setContent(`<body style="margin:8px;display:flex;flex-wrap:wrap;gap:14px;align-items:flex-start">${cells.map((c) => `<div>${c}</div>`).join("")}</body>`);
await p.screenshot({ path: out, fullPage: true });
await b.close();
