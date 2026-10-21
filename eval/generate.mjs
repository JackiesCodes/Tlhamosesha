// Generates a deterministic set of synthetic posters with exact ground truth.
//
//   node generate.mjs [count=36] [seed=7]
//
// Each poster is rendered as HTML in Chromium and screenshotted to PNG. Text
// and object boxes come from the DOM, so the answer key is exact. Output goes
// to eval/fixtures/ (PNG + one ground-truth JSON per poster + index.json).
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const COUNT = +(process.argv[2] ?? 36);
const SEED = +(process.argv[3] ?? 7);
// EVAL_SET=heldout writes to fixtures-heldout/ (a second set, never tuned on).
const OUT = path.join(import.meta.dirname, process.env.EVAL_SET ? `fixtures-${process.env.EVAL_SET}` : "fixtures");
fs.mkdirSync(OUT, { recursive: true });

// ---------------------------------------------------------------- randomness
function mulberry32(a) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(SEED);
const pick = (a) => a[Math.floor(rnd() * a.length)];
const between = (a, b) => a + rnd() * (b - a);

// ---------------------------------------------------------------- fonts
const FONT_DIR = path.join(import.meta.dirname, "node_modules/@fontsource");
const FONTS = [
  { family: "Anton", pkg: "anton", weights: [400], display: true },
  { family: "Bebas Neue", pkg: "bebas-neue", weights: [400], display: true, caps: true },
  { family: "Oswald", pkg: "oswald", weights: [400, 700] },
  { family: "Montserrat", pkg: "montserrat", weights: [400, 700, 900] },
  { family: "Poppins", pkg: "poppins", weights: [400, 600, 800] },
  { family: "Inter", pkg: "inter", weights: [400, 600, 800] },
  { family: "Playfair Display", pkg: "playfair-display", weights: [400, 700, 900] },
  { family: "Archivo Black", pkg: "archivo-black", weights: [400], display: true },
  { family: "Roboto Slab", pkg: "roboto-slab", weights: [400, 700] },
];
const fontFace = FONTS.flatMap((f) =>
  f.weights.map((w) => {
    const file = path.join(FONT_DIR, f.pkg, "files", `${f.pkg}-latin-${w}-normal.woff2`);
    const b64 = fs.readFileSync(file).toString("base64");
    return `@font-face{font-family:"${f.family}";font-weight:${w};src:url(data:font/woff2;base64,${b64}) format("woff2");}`;
  }),
).join("\n");

// ---------------------------------------------------------------- content
const THEMES = {
  sports: {
    type: "Sports Poster",
    headlines: ["MATCH DAY", "THE BIG GAME", "CUP FINAL", "DERBY NIGHT", "GAME ON"],
    lines: [
      { text: () => `${pick(["Lions", "Eagles", "Sharks", "Bulls", "Stormers", "Pirates", "Chiefs"])} vs ${pick(["United", "City", "Rovers", "Rangers", "Wanderers"])}`, role: "name" },
      { text: () => `${Math.floor(between(0, 5))} - ${Math.floor(between(0, 5))}`, role: "score" },
      { text: () => `${pick(["Saturday", "Sunday", "Friday"])} ${Math.floor(between(1, 28))} ${pick(["March", "June", "August", "November"])} 2026`, role: "date" },
      { text: () => `Kick-off ${pick(["15:00", "17:30", "19:30", "20:00"])}`, role: "body" },
      { text: () => pick(["Kings Park Stadium, Durban", "Ellis Park, Johannesburg", "Cape Town Stadium", "Loftus Versfeld, Pretoria"]), role: "caption" },
    ],
    cta: ["GET TICKETS", "BOOK NOW"],
    objects: ["person", "logo", "logo", "logo"],
  },
  sale: {
    type: "Marketing Banner",
    headlines: ["SUMMER SALE", "BLACK FRIDAY", "MEGA DEALS", "CLEARANCE", "FLASH SALE"],
    lines: [
      { text: () => `Up to ${pick([30, 40, 50, 60, 70])}% off`, role: "statistic" },
      { text: () => pick(["On everything in store", "Selected items only", "This weekend only", "While stocks last"]), role: "subheadline" },
      { text: () => `Ends ${Math.floor(between(1, 28))} ${pick(["January", "July", "December"])}`, role: "date" },
      { text: () => pick(["Terms and conditions apply", "Online and in store", "Free delivery over R500"]), role: "caption" },
    ],
    cta: ["SHOP NOW", "ORDER TODAY"],
    objects: ["product", "icon", "logo"],
  },
  product: {
    type: "Product Advertisement",
    headlines: ["NEW ARRIVAL", "FRESH DROP", "MEET NOVA", "PURE ENERGY", "THE ORIGINAL"],
    lines: [
      { text: () => pick(["Crafted for everyday comfort", "Engineered for speed", "Made with real fruit", "Lighter. Faster. Better."]), role: "subheadline" },
      { text: () => `R${pick([99, 149, 249, 499, 1299])}`, role: "statistic" },
      { text: () => pick(["Available now", "Limited edition", "Only at selected stores"]), role: "body" },
      { text: () => pick(["www.nova.co.za", "Follow us @novabrand", "Proudly local since 1998"]), role: "caption" },
    ],
    cta: ["BUY NOW", "SHOP NOW"],
    objects: ["product", "logo", "icon"],
  },
  event: {
    type: "Event Flyer",
    headlines: ["JAZZ NIGHT", "LIVE MUSIC", "WINTER FEST", "OPEN HOUSE", "TECH SUMMIT"],
    lines: [
      { text: () => `${pick(["Friday", "Saturday"])} ${Math.floor(between(1, 28))} ${pick(["April", "May", "October"])} 2026`, role: "date" },
      { text: () => pick(["Doors open at 19:00", "Free entry before 10pm", "Three stages, one night", "Talks, workshops and more"]), role: "subheadline" },
      { text: () => pick(["The Old Biscuit Mill, Cape Town", "Maboneng Precinct", "The Venue, Melrose Arch"]), role: "caption" },
      { text: () => `Tickets from R${pick([80, 120, 150, 250])}`, role: "statistic" },
    ],
    cta: ["GET TICKETS", "REGISTER", "BOOK NOW"],
    objects: ["person", "icon", "logo"],
  },
};

// ---------------------------------------------------------------- shapes (inline SVG)
const SKIN = ["#8D5524", "#C68642", "#E0AC69", "#F1C27D", "#5C3A21"];
function svgObject(kind, color, accent, letters) {
  if (kind === "person") {
    const skin = pick(SKIN);
    return `<svg viewBox="0 0 200 300" preserveAspectRatio="none"><ellipse cx="100" cy="55" rx="34" ry="42" fill="${skin}"/><path d="M38 120 Q100 95 162 120 L176 300 L24 300 Z" fill="${color}"/><path d="M38 122 L6 250 L28 256 L58 150 Z" fill="${skin}"/><path d="M162 122 L194 250 L172 256 L142 150 Z" fill="${skin}"/><rect x="86" y="92" width="28" height="22" fill="${skin}"/></svg>`;
  }
  if (kind === "product") {
    return pick([
      `<svg viewBox="0 0 120 300" preserveAspectRatio="none"><rect x="42" y="0" width="36" height="40" rx="6" fill="${accent}"/><path d="M30 60 Q30 40 60 40 Q90 40 90 60 L100 110 Q110 130 110 160 L110 285 Q110 300 95 300 L25 300 Q10 300 10 285 L10 160 Q10 130 20 110 Z" fill="${color}"/><rect x="18" y="170" width="84" height="70" fill="${accent}"/></svg>`,
      `<svg viewBox="0 0 300 160" preserveAspectRatio="none"><path d="M10 120 Q0 70 40 60 Q90 50 120 5 Q150 -10 175 20 Q205 60 260 75 Q300 85 296 125 Q295 140 280 140 L25 140 Q12 140 10 120Z" fill="${color}"/><rect x="8" y="128" width="290" height="24" rx="10" fill="${accent}"/></svg>`,
      `<svg viewBox="0 0 160 300" preserveAspectRatio="none"><rect x="5" y="5" width="150" height="290" rx="24" fill="${color}"/><rect x="18" y="30" width="124" height="230" rx="8" fill="${accent}"/></svg>`,
    ]);
  }
  if (kind === "logo") {
    return pick([
      `<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="46" fill="${color}" stroke="${accent}" stroke-width="6"/><text x="50" y="62" text-anchor="middle" font-family="Archivo Black" font-size="30" fill="${accent}">${letters}</text></svg>`,
      `<svg viewBox="0 0 100 110"><path d="M50 4 L94 18 V54 Q94 90 50 106 Q6 90 6 54 V18 Z" fill="${color}" stroke="${accent}" stroke-width="6"/><text x="50" y="66" text-anchor="middle" font-family="Archivo Black" font-size="28" fill="${accent}">${letters}</text></svg>`,
      `<svg viewBox="0 0 160 70"><rect x="3" y="3" width="154" height="64" rx="14" fill="${color}" stroke="${accent}" stroke-width="5"/><text x="80" y="47" text-anchor="middle" font-family="Archivo Black" font-size="26" fill="${accent}">${letters}</text></svg>`,
    ]);
  }
  // icon
  return pick([
    `<svg viewBox="0 0 100 100"><path d="M50 4 L62 38 L98 38 L69 59 L80 94 L50 73 L20 94 L31 59 L2 38 L38 38 Z" fill="${color}"/></svg>`,
    `<svg viewBox="0 0 100 100"><path d="M58 2 L14 58 H46 L38 98 L86 38 H54 Z" fill="${color}"/></svg>`,
    `<svg viewBox="0 0 100 100"><path d="M50 90 C-20 40 20 -5 50 25 C80 -5 120 40 50 90Z" fill="${color}"/></svg>`,
  ]);
}

// ---------------------------------------------------------------- palettes / backgrounds
const PALETTES = [
  { bg: ["#0B1A3B", "#16336F"], fg: "#FFFFFF", accent: "#F2C14E", obj: "#E63946" },
  { bg: ["#FF7A18", "#AF002D"], fg: "#FFFFFF", accent: "#FFE8D6", obj: "#1D1D1D" },
  { bg: ["#F5F0E8", "#E9DFCF"], fg: "#1B1B1B", accent: "#C0392B", obj: "#2E86AB" },
  { bg: ["#1A0B3D", "#E0457B"], fg: "#FFFFFF", accent: "#FFD166", obj: "#06D6A0" },
  { bg: ["#0F3D2E", "#1E7A55"], fg: "#F7F3E3", accent: "#F4D35E", obj: "#EE964B" },
  { bg: ["#FFFFFF", "#F1F3F6"], fg: "#111827", accent: "#2563EB", obj: "#F97316" },
  { bg: ["#111111", "#2B2B2B"], fg: "#F5F5F5", accent: "#E9C46A", obj: "#2A9D8F" },
  { bg: ["#FFD60A", "#FFC300"], fg: "#14213D", accent: "#D62828", obj: "#003049" },
];
const FORMATS = [
  { w: 1080, h: 1350 },
  { w: 1080, h: 1080 },
  { w: 1600, h: 900 },
  { w: 1080, h: 1920 },
];

function background(p, tier) {
  if (tier === "clean") return pick([`background:${p.bg[0]}`, `background:linear-gradient(${pick([135, 180, 90])}deg,${p.bg[0]},${p.bg[1]})`]);
  if (tier === "textured") return `background:linear-gradient(${pick([160, 200])}deg,${p.bg[0]},${p.bg[1]})`; // + grain canvas
  return `background:${p.bg[0]}`; // + photo-like canvas
}

// ---------------------------------------------------------------- poster builder
function buildPoster(i) {
  const themeKey = pick(Object.keys(THEMES));
  const theme = THEMES[themeKey];
  const tier = i % 3 === 0 ? "clean" : i % 3 === 1 ? "textured" : "photo";
  const fmt = pick(FORMATS);
  const p = pick(PALETTES);
  const align = pick(["center", "left", "left", "center"]);
  const headFont = pick(FONTS.filter((f) => f.display || f.weights.includes(700)));
  const bodyFont = pick(FONTS.filter((f) => !f.display));
  const M = Math.round(Math.min(fmt.w, fmt.h) * 0.07);
  const scale = Math.min(fmt.w, fmt.h) / 1080;

  const texts = [];
  const head = pick(theme.headlines);
  const headSize = Math.round(between(96, 150) * scale * (fmt.w > fmt.h ? 0.9 : 1));
  texts.push({ text: head, role: "headline", size: headSize, font: headFont.family, weight: Math.max(...headFont.weights), color: p.fg, caps: true, spacing: headFont.display ? 0 : pick([0, 2]) });
  const lines = [...theme.lines].sort(() => rnd() - 0.5).slice(0, Math.floor(between(2, theme.lines.length + 1)));
  for (const l of lines) {
    const big = ["score", "statistic"].includes(l.role);
    texts.push({
      text: l.text(),
      role: l.role,
      size: Math.round((big ? between(54, 84) : l.role === "caption" ? between(22, 30) : between(30, 46)) * scale),
      font: big ? headFont.family : bodyFont.family,
      weight: big ? Math.max(...headFont.weights) : pick(bodyFont.weights),
      color: l.role === "caption" ? p.fg : pick([p.fg, p.accent]),
      caps: rnd() < 0.3 && l.role !== "caption",
      spacing: rnd() < 0.2 ? 3 : 0,
    });
  }
  // Hard tier: a low-contrast line, like real posters often have.
  if (tier === "photo" && texts.length > 2) texts[texts.length - 1].lowContrast = true;

  const cta = rnd() < 0.7 ? pick(theme.cta) : null;
  const objectKinds = theme.objects.slice(0, Math.floor(between(1, theme.objects.length + 1)));
  const letters = pick(["LU", "RFC", "NV", "KO", "AX", "SB", "MX"]);
  return { i, themeKey, theme, tier, fmt, p, align, M, scale, texts, cta, objectKinds, letters, bodyFont };
}

function posterHTML(P) {
  const { fmt, p, align, M, scale, texts, cta, objectKinds, letters, bodyFont } = P;
  // Objects occupy a band; text flows top and bottom of it.
  const objs = [];
  const heroKind = objectKinds.find((k) => k === "person" || k === "product");
  const heroH = Math.round(fmt.h * between(0.32, 0.42));
  const heroTop = Math.round(fmt.h * between(0.34, 0.4));
  if (heroKind) {
    const w = Math.round(heroH * (heroKind === "person" ? 0.68 : between(0.45, 1.3)));
    const left = align === "center" || fmt.w > fmt.h ? Math.round((fmt.w - w) / 2 + (fmt.w > fmt.h ? fmt.w * 0.22 : 0)) : Math.round(fmt.w - M - w);
    objs.push({ kind: heroKind, x: left, y: heroTop, w, h: heroH, svg: svgObject(heroKind, p.obj, p.accent, letters) });
  }
  let logoCount = 0;
  for (const k of objectKinds.filter((k) => k === "logo" || k === "icon")) {
    const s = Math.round((k === "logo" ? between(110, 160) : between(70, 100)) * scale);
    // Corner marks sit in the right-hand corners; text blocks keep clear of them.
    const corner = logoCount++ % 2 === 0 ? "tr" : "br";
    const x = fmt.w - M - s;
    const y = corner === "tr" ? M : fmt.h - M - s;
    objs.push({ kind: k, x, y, w: k === "logo" && rnd() < 0.3 ? Math.round(s * 1.6) : s, h: s, svg: svgObject(k, k === "icon" ? p.accent : p.obj, k === "icon" ? p.accent : p.fg, letters) });
  }

  const ctaH = Math.round(84 * scale);
  const ctaHtml = cta
    ? `<div data-cta style="height:${ctaH}px;padding:0 ${Math.round(40 * scale)}px;border-radius:${ctaH / 2}px;background:${p.accent};display:flex;align-items:center;margin-top:${Math.round(10 * scale)}px"><span data-t="cta" style="font-family:'${bodyFont.family}';font-weight:${Math.max(...bodyFont.weights)};font-size:${Math.round(30 * scale)}px;line-height:1;color:${p.bg[0]};white-space:nowrap">${cta}</span></div>`
    : "";

  // Text blocks: headline + first line above the hero band, rest below.
  const above = texts.slice(0, 2);
  const below = texts.slice(2);
  const reserve = objs.filter((o) => o.kind === "logo" || o.kind === "icon").reduce((m, o) => Math.max(m, o.w + Math.round(24 * scale)), 0);
  const block = (arr, top, id) =>
    `<div id="${id}" style="position:absolute;left:${M + (align === "center" ? reserve : 0)}px;right:${M + reserve}px;top:${top}px;text-align:${align};display:flex;flex-direction:column;align-items:${align === "center" ? "center" : "flex-start"};gap:${Math.round(18 * scale)}px">${arr
      .map(
        (t, k) =>
          `<span data-t="${id}-${k}" style="font-family:'${t.font}';font-weight:${t.weight};font-size:${t.size}px;line-height:1.05;color:${t.color};${t.lowContrast ? "opacity:0.55;" : ""}letter-spacing:${t.spacing}px;white-space:nowrap;${t.caps ? "text-transform:uppercase;" : ""}">${t.text}</span>`,
      )
      .join("")}${id === "b" ? ctaHtml : ""}</div>`;
  const heroBottom = heroKind ? heroTop + heroH : Math.round(fmt.h * 0.55);
  return `<!doctype html><html><head><style>${fontFace}
  html,body{margin:0;padding:0}
  #poster{position:relative;width:${fmt.w}px;height:${fmt.h}px;overflow:hidden;${background(p, P.tier)}}
  #fx{position:absolute;inset:0}
  .obj{position:absolute}
  .obj svg{width:100%;height:100%;display:block}
  </style></head><body><div id="poster"><canvas id="fx" width="${fmt.w}" height="${fmt.h}"></canvas>
  ${objs.map((o, k) => `<div class="obj" data-o="${k}" data-kind="${o.kind}" style="left:${o.x}px;top:${o.y}px;width:${o.w}px;height:${o.h}px">${o.svg}</div>`).join("")}
  ${block(above, M, "a")}
  ${block(below, heroBottom + Math.round(30 * scale), "b")}
  </div><script>window.__heroTop=${heroKind ? heroTop : Math.round(fmt.h * 0.55)};window.__M=${M};</script></body></html>`;
}

// Background effects drawn in the page (grain for textured, photo-like scene for photo).
function fxScript(tier, seed, p) {
  return `(() => {
    let a = ${seed};
    const r = () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const c = document.getElementById("fx"); const x = c.getContext("2d"); const W = c.width, H = c.height;
    if (${JSON.stringify(tier)} === "clean") return;
    if (${JSON.stringify(tier)} === "photo") {
      const cols = ${JSON.stringify([p.bg[0], p.bg[1], p.obj, p.accent, "#ffffff", "#000000"])};
      x.filter = "blur(" + Math.round(W / 22) + "px)";
      for (let i = 0; i < 26; i++) { x.globalAlpha = 0.25 + r() * 0.5; x.fillStyle = cols[Math.floor(r() * cols.length)]; x.beginPath(); x.ellipse(r() * W, r() * H, W * (0.08 + r() * 0.3), H * (0.05 + r() * 0.2), r() * 3, 0, 7); x.fill(); }
      x.filter = "none"; x.globalAlpha = 1;
      const g = x.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.2, W / 2, H / 2, Math.max(W, H) * 0.75); g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(1, "rgba(0,0,0,0.55)"); x.fillStyle = g; x.fillRect(0, 0, W, H);
    }
    const d = x.getImageData(0, 0, W, H); const amt = ${tier === "photo" ? 28 : 18};
    for (let i = 0; i < d.data.length; i += 4) { const n = (r() - 0.5) * amt; if (d.data[i + 3] === 0) { d.data[i + 3] = ${tier === "photo" ? 0 : 38}; d.data[i] = d.data[i + 1] = d.data[i + 2] = n > 0 ? 255 : 0; } else { d.data[i] += n; d.data[i + 1] += n; d.data[i + 2] += n; } }
    x.putImageData(d, 0, 0);
  })()`;
}

// ---------------------------------------------------------------- render
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? "/opt/pw-browsers/chromium" });
const index = [];
for (let i = 0; i < COUNT; i++) {
  const P = buildPoster(i);
  const page = await browser.newPage({ viewport: { width: P.fmt.w, height: P.fmt.h }, deviceScaleFactor: 1 });
  await page.setContent(posterHTML(P), { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  // Fit text like a designer would: no line wider than its column, block A
  // above the hero, block B inside the poster.
  await page.evaluate(() => {
    const H = document.getElementById("poster").clientHeight;
    const scaleBlock = (blk, f) => blk.querySelectorAll("[data-t]").forEach((el) => (el.style.fontSize = parseFloat(getComputedStyle(el).fontSize) * f + "px"));
    for (const blk of document.querySelectorAll("#a,#b")) {
      for (const el of blk.querySelectorAll("[data-t]")) {
        const avail = blk.clientWidth - (el.closest("[data-cta]") ? 90 : 0);
        const w = el.getBoundingClientRect().width;
        if (w > avail) el.style.fontSize = (parseFloat(getComputedStyle(el).fontSize) * avail * 0.97) / w + "px";
      }
    }
    const a = document.getElementById("a");
    for (let k = 0; k < 12 && a.getBoundingClientRect().bottom > window.__heroTop - 12; k++) scaleBlock(a, 0.92);
    const b = document.getElementById("b");
    for (let k = 0; k < 12 && b.getBoundingClientRect().bottom > H - window.__M * 0.6; k++) scaleBlock(b, 0.92);
  });
  await page.evaluate(fxScript(P.tier, SEED * 1000 + i, P.p));
  const gt = await page.evaluate(() => {
    const box = (el) => {
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) };
    };
    // Tight vertical ink box for a text span: use the font's actual glyph bounds.
    const inkBox = (el) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      const c = document.createElement("canvas").getContext("2d");
      c.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      const txt = cs.textTransform === "uppercase" ? el.textContent.toUpperCase() : el.textContent;
      const m = c.measureText(txt);
      const base = r.top + (r.height - (m.fontBoundingBoxAscent + m.fontBoundingBoxDescent)) / 2 + m.fontBoundingBoxAscent;
      return { x: Math.round(r.x), y: Math.round(base - m.actualBoundingBoxAscent), width: Math.round(r.width), height: Math.round(m.actualBoundingBoxAscent + m.actualBoundingBoxDescent) };
    };
    const texts = [...document.querySelectorAll("[data-t]")].map((el) => {
      const cs = getComputedStyle(el);
      return {
        text: cs.textTransform === "uppercase" ? el.textContent.toUpperCase() : el.textContent,
        box: inkBox(el),
        fontSize: parseFloat(cs.fontSize),
        fontFamily: cs.fontFamily.replace(/"/g, ""),
        fontWeight: +cs.fontWeight,
        color: cs.color,
        lowContrast: cs.opacity !== "1",
      };
    });
    const objects = [...document.querySelectorAll(".obj")].map((el) => ({ kind: el.dataset.kind, box: box(el) }));
    const cta = document.querySelector("[data-cta]");
    return { texts, objects, button: cta ? box(cta) : null };
  });
  // Roles come from the builder (DOM order: block a, block b, cta).
  const roles = [...P.texts.map((t) => t.role), ...(P.cta ? ["cta"] : [])];
  gt.texts.forEach((t, k) => (t.role = roles[k]));
  const file = `poster-${String(i).padStart(2, "0")}.png`;
  await page.locator("#poster").screenshot({ path: path.join(OUT, file) });
  const truth = { file, width: P.fmt.w, height: P.fmt.h, tier: P.tier, theme: P.themeKey, designType: P.theme.type, ...gt };
  fs.writeFileSync(path.join(OUT, file.replace(".png", ".json")), JSON.stringify(truth, null, 2));
  index.push({ file, tier: P.tier, theme: P.themeKey, format: `${P.fmt.w}x${P.fmt.h}`, texts: gt.texts.length, objects: gt.objects.length });
  await page.close();
}
fs.writeFileSync(path.join(OUT, "index.json"), JSON.stringify({ seed: SEED, count: COUNT, posters: index }, null, 2));
await browser.close();
console.log(`Generated ${COUNT} posters in ${OUT}`);
