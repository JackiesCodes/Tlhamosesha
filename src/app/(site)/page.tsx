import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Eraser,
  FileDown,
  Grid3X3,
  Lock,
  MonitorSmartphone,
  Palette,
  ScanText,
  Shapes,
  Wand2,
} from "lucide-react";
import { LogoMark } from "@/components/shell/logo";
import { Button } from "@/components/ui/button";
import { BRAND, fullTitle } from "@/lib/brand";

export const metadata: Metadata = {
  title: { absolute: fullTitle },
  description: BRAND.description,
};

// Boxes RevVisual detects on the bundled matchday example (1080 × 1350 source px).
const W = 1080;
const H = 1350;
type Kind = "text" | "image" | "logo";
const DETECTIONS: { label: string; kind: Kind; x: number; y: number; w: number; h: number }[] = [
  { label: "Headline · 124px", kind: "text", x: 183, y: 147, w: 721, h: 91 },
  { label: "Eyebrow", kind: "text", x: 243, y: 98, w: 285, h: 19 },
  { label: "Eyebrow", kind: "text", x: 589, y: 98, w: 240, h: 19 },
  { label: "Player · cut-out", kind: "image", x: 173, y: 341, w: 735, h: 683 },
  { label: "Team badge", kind: "logo", x: 64, y: 596, w: 173, h: 199 },
  { label: "Team badge", kind: "logo", x: 833, y: 593, w: 195, h: 195 },
  { label: "Fixture", kind: "text", x: 186, y: 967, w: 708, h: 43 },
  { label: "Date", kind: "text", x: 166, y: 1056, w: 747, h: 28 },
  { label: "Venue", kind: "text", x: 226, y: 1118, w: 627, h: 25 },
  { label: "Sponsor", kind: "logo", x: 79, y: 1223, w: 214, h: 105 },
  { label: "Sponsor", kind: "logo", x: 319, y: 1223, w: 214, h: 105 },
  { label: "Sponsor", kind: "logo", x: 559, y: 1223, w: 214, h: 105 },
  { label: "Sponsor", kind: "logo", x: 799, y: 1223, w: 214, h: 105 },
];
const PAD = 5; // breathing room so outlines don't sit on the lettering
const LABELLED = new Set(["Headline · 124px", "Player · cut-out", "Sponsor"]);
const KIND_STYLE: Record<Kind, { box: string; tag: string; name: string }> = {
  text: { box: "border-pink-400 bg-pink-400/5", tag: "bg-pink-500 text-white", name: "Text" },
  image: { box: "border-emerald-400 bg-emerald-400/5", tag: "bg-emerald-600 text-white", name: "Images" },
  logo: { box: "border-amber-400 bg-amber-400/10", tag: "bg-amber-500 text-black", name: "Logos" },
};
const PALETTE = ["#16336F", "#0B1A3B", "#C32C38", "#FBFCFA", "#C28C43", "#FDD50C"];

const FEATURES = [
  { icon: ScanText, title: "Text and typography", body: "Every line of text, its role (headline, date, score, call to action…), estimated font, weight, size and colour." },
  { icon: Shapes, title: "Images and logos", body: "People, products, badges, sponsor marks and icons, each saved as a transparent PNG with its position." },
  { icon: Eraser, title: "Clean background", body: "The background rebuilt without the foreground, plus gradient, texture, blur, overlay and lighting layers." },
  { icon: Palette, title: "Colour system", body: "Primary, secondary and accent colours in HEX, RGB and HSL, with contrast ratios and gradient CSS." },
  { icon: Grid3X3, title: "Layout and grid", body: "Columns, rows, margins and spacing, shown as a wireframe with the visual hierarchy." },
  { icon: Wand2, title: "Editable rebuild", body: "A layered version you can move, resize, recolour and retype, then export again." },
];

// The two halves of the mark's cycle: take the design apart, build it back up.
const CYCLE = [
  {
    icon: ArrowDown,
    title: "Reverse",
    body: "Drop in a finished design. RevVisual reads every line of text, cuts out each image and logo, rebuilds the background and maps the colours and grid.",
    points: ["Text with estimated fonts", "Transparent cut-outs", "Clean background plate", "Palette and layout grid"],
  },
  {
    icon: ArrowUp,
    title: "Rebuild",
    body: "Get the design back as editable layers. Move, resize, retype and recolour, then export the result or any single piece.",
    points: ["Layer editor with undo", "PNG, JPG, SVG and PDF", "Layer files for design tools", "Every asset as a ZIP"],
  },
];

const EXPORTS = ["PNG", "JPG", "SVG", "PDF", "PSD-style JSON", "Figma JSON", "Canva JSON", "Asset ZIP"];

const FAQ = [
  {
    q: "Is my image or video uploaded anywhere?",
    a: "No. The analysis runs inside your browser, and your projects are saved in your browser's storage on your device. Nothing is sent to a server unless you switch on an optional cloud feature where one is offered, and it is clearly labelled when it is.",
  },
  {
    q: "How accurate is it?",
    a: "RevVisual uses AI models that run on your device to read text, cut out people and products, and fill in the background behind them. In our tests it reads about 95–98% of text lines, including text over photos, cuts out people and products with clean edges, and matches the font in most cases from a library of 22 popular typefaces. Very stylised or handwritten lettering, fonts outside that library, and small logos on busy photos are the hardest cases, so you may still adjust a few things in the editor. The first breakdown downloads the models (about 75 MB) once; on computers with a modern graphics chip they run in a few seconds.",
  },
  {
    q: "Does it work on videos?",
    a: "Yes, for motion-graphic videos up to 60 seconds, such as ads, promos and social reels. RevVisual splits the video into scenes, breaks each scene down into editable layers, and works out when every layer appears, how it moves in and out (slides, fades, scaling, with their easing) and when it leaves. You can play the result back, retime and retype layers on a timeline, and export the rebuilt video as MP4 or WebM (with the original soundtrack if you add the source file), as a Lottie animation, as every scene's layers with a timeline, or the on-screen text as captions (SRT or WebVTT). Live-action footage stays as one layer; only titles, logos and captions on top are pulled out. A video takes about one to three times its length to analyse.",
  },
  {
    q: "Do I need an account?",
    a: "No. Open the app and start. Because there is no account, your projects live only in the browser you used — export a backup from Settings if you want to keep them safe or move them to another device.",
  },
  {
    q: "Can I open the results in Photoshop, Figma or Canva?",
    a: "You can export a layered JSON file shaped like each tool's document structure, plus every asset as PNG and the design as SVG or PDF. These JSON files are for developers and plug-ins; they are not native .psd or .fig files that open directly.",
  },
  {
    q: "Can I use designs that aren't mine?",
    a: "Only upload images you have the right to use. Breaking down a design to study or update your own work is fine; reusing someone else's artwork, photos or logos may infringe their rights. See the Terms of Use.",
  },
  {
    q: "Does it work on my phone?",
    a: "Yes — you can upload, view a breakdown and download assets on mobile. Editing layers is designed for a desktop or laptop screen.",
  },
];

export default function LandingPage() {
  return (
    <>
      {/* Hero */}
      <section className="mx-auto grid max-w-6xl items-center gap-14 px-4 pb-20 pt-14 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:pt-24">
        <div className="min-w-0">
          <p className="inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-1 text-xs font-medium text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-brand" /> {BRAND.tagline}
          </p>
          <h1 className="mt-6 font-display text-[2.6rem] font-bold leading-[1.02] tracking-[-0.03em] text-white sm:text-6xl">
            Take any design apart.
            <br />
            <span className="text-muted-foreground">Build it back as layers.</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">
            Lost the source file? Drop in the finished poster, banner or flyer. {BRAND.name} separates its text, images, logos, background, colours
            and layout, then rebuilds it so you can edit and export it again.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link href="/upload">
                Start a breakdown <ArrowRight />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/upload?sample=matchday">See an example</Link>
            </Button>
          </div>
          <ul className="mt-7 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
            <li className="flex items-center gap-1.5"><Lock className="h-3.5 w-3.5" /> Runs in your browser</li>
            <li className="flex items-center gap-1.5"><MonitorSmartphone className="h-3.5 w-3.5" /> No sign-up</li>
            <li className="flex items-center gap-1.5"><FileDown className="h-3.5 w-3.5" /> PNG, SVG, PDF and layer exports</li>
          </ul>
        </div>
        <LayerStack />
      </section>

      {/* Reverse / Rebuild — the two arrows of the mark */}
      <section id="how-it-works" className="scroll-mt-20 border-y border-white/[0.07] bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <h2 className="max-w-2xl font-display text-3xl font-bold tracking-tight text-white sm:text-4xl">One cycle: reverse it, then rebuild it.</h2>
          <div className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.08] md:grid-cols-2">
            {CYCLE.map((c) => (
              <div key={c.title} className="bg-surface p-8 sm:p-10">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-600 text-onbrand">
                  <c.icon className="h-5 w-5" strokeWidth={2.5} />
                </span>
                <h3 className="mt-6 font-display text-2xl font-bold text-white">{c.title}</h3>
                <p className="mt-3 leading-relaxed text-muted-foreground">{c.body}</p>
                <ul className="mt-6 grid gap-2 text-sm text-white sm:grid-cols-2">
                  {c.points.map((pt) => (
                    <li key={pt} className="flex items-center gap-2">
                      <span className="h-1 w-3 rounded-full bg-brand" /> {pt}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="mt-10 flex flex-wrap items-center gap-2">
            <span className="mr-2 text-sm text-muted-foreground">Exports</span>
            {EXPORTS.map((e) => (
              <span key={e} className="rounded-md border border-white/[0.1] px-2.5 py-1 font-mono text-xs text-white">
                {e}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* What gets detected */}
      <section className="mx-auto grid max-w-6xl items-center gap-14 px-4 py-24 sm:px-6 lg:grid-cols-[1fr_1fr]">
        <AnnotatedExample />
        <div>
          <h2 className="font-display text-3xl font-bold tracking-tight text-white sm:text-4xl">See exactly what was found.</h2>
          <p className="mt-4 leading-relaxed text-muted-foreground">
            Every element is outlined and labelled, so you can check the breakdown at a glance: text lines and their roles, cut-out images,
            logos and sponsor marks, the colour palette and the design type.
          </p>
          <p className="mt-4 leading-relaxed text-muted-foreground">
            This is the real result for the example poster. Each outlined element becomes its own layer or downloadable asset.
          </p>
          <Button asChild variant="outline" className="mt-8">
            <Link href="/upload?sample=matchday">
              Open this example <ArrowRight />
            </Link>
          </Button>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="scroll-mt-20 border-t border-white/[0.07]">
        <div className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
          <h2 className="font-display text-3xl font-bold tracking-tight text-white sm:text-4xl">Everything in the design, separated.</h2>
          <p className="mt-3 max-w-2xl text-muted-foreground">One upload gives you the parts you would otherwise rebuild by hand.</p>
          <div className="mt-12 grid gap-x-10 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title}>
                <f.icon className="h-6 w-6 text-white" strokeWidth={1.75} />
                <h3 className="mt-4 font-display text-lg font-semibold text-white">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Privacy */}
      <section id="privacy" className="scroll-mt-20 bg-brand-600 text-onbrand">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-20 sm:px-6 md:grid-cols-[1fr_1.2fr]">
          <div>
            <Lock className="h-7 w-7" />
            <h2 className="mt-5 font-display text-3xl font-bold tracking-tight sm:text-4xl">Your designs stay on your device.</h2>
          </div>
          <div className="space-y-4 text-onbrand/75">
            <p>
              {BRAND.name} does the analysis in your browser. The image you drop in isn&apos;t uploaded to us, and your projects are saved in your
              browser&apos;s own storage on your device.
            </p>
            <p>
              That also means your projects don&apos;t follow you to another browser or device. Use <span className="text-onbrand">Settings → Export backup</span>{" "}
              to keep a copy or move them.
            </p>
            <Link href="/privacy" className="inline-flex items-center gap-1 text-sm font-medium text-onbrand underline underline-offset-2">
              Read the privacy policy <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="mx-auto max-w-3xl scroll-mt-20 px-4 py-24 sm:px-6">
        <h2 className="font-display text-3xl font-bold tracking-tight text-white sm:text-4xl">Questions</h2>
        <div className="mt-8 divide-y divide-white/[0.1] border-y border-white/[0.1]">
          {FAQ.map((f) => (
            <details key={f.q} className="group py-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium text-white [&::-webkit-details-marker]:hidden">
                {f.q}
                <span className="text-xl leading-none text-muted-foreground transition group-open:rotate-45" aria-hidden>
                  +
                </span>
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* Final CTA */}
      <section className="mx-auto max-w-6xl px-4 pb-24 sm:px-6">
        <div className="flex flex-col items-start gap-6 rounded-2xl border border-white/[0.1] p-8 sm:flex-row sm:items-center sm:justify-between sm:p-12">
          <div className="flex items-center gap-5">
            <LogoMark className="hidden h-14 w-14 sm:block" />
            <div>
              <h2 className="font-display text-2xl font-bold tracking-tight text-white sm:text-3xl">Have a design to take apart?</h2>
              <p className="mt-2 text-muted-foreground">No account needed — open the app and drop in an image.</p>
            </div>
          </div>
          <Button asChild size="lg">
            <Link href="/upload">
              Start a breakdown <ArrowRight />
            </Link>
          </Button>
        </div>
      </section>
    </>
  );
}

/**
 * Hero visual: the real layers extracted from the example poster, stacked as
 * three panels that grow from left to right — the same move as the panels in
 * the RevVisual mark.
 */
function LayerStack() {
  // Heights grow left to right like the mark's panels (sm and up / mobile).
  const panels = [
    { label: "Text", src: "/landing/layer-text.png", bg: "#0B1A3B", h: "h-[110px] sm:h-[190px]" },
    { label: "Cut-outs", src: "/landing/layer-objects.png", bg: "checker", h: "h-[140px] sm:h-[245px]" },
    { label: "Background", src: "/landing/layer-background.jpg", bg: "#0B1A3B", h: "h-[170px] sm:h-[305px]" },
  ];
  return (
    <figure className="min-w-0">
      <div className="flex items-center justify-center gap-3 py-4 sm:gap-5">
        {panels.map((p, i) => (
          <div key={p.label} className="flex flex-col items-center gap-3">
            <div
              className={`relative aspect-[4/5] ${p.h} overflow-hidden rounded-lg border border-white/15 shadow-[0_24px_40px_-24px_rgb(0_0_0/0.55)] ${p.bg === "checker" ? "checkerboard" : ""}`}
              style={{ background: p.bg === "checker" ? undefined : p.bg, transform: "perspective(900px) rotateY(-24deg)" }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.src} alt={`${p.label} layer extracted from the example poster`} className="absolute inset-0 h-full w-full object-cover" />
            </div>
            <figcaption className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground sm:text-[11px]">
              {String(i + 1).padStart(2, "0")} · {p.label}
            </figcaption>
          </div>
        ))}
      </div>
    </figure>
  );
}

/** The example poster with every detected element outlined. */
function AnnotatedExample() {
  return (
    <figure className="rounded-2xl border border-white/[0.1] bg-surface p-4 sm:p-5">
      <div className="grid gap-5 sm:grid-cols-[1fr_140px]">
        <div className="relative mx-auto w-full max-w-[360px]" style={{ aspectRatio: `${W} / ${H}` }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/samples/matchday.svg" alt="Example sports poster with RevVisual's detected elements outlined" className="absolute inset-0 h-full w-full rounded-md" />
          {DETECTIONS.map((d, i) => {
            const first = DETECTIONS.findIndex((x) => x.label === d.label) === i;
            const below = d.label.startsWith("Headline");
            const right = d.label.startsWith("Player");
            return (
              <div
                key={i}
                className={`absolute rounded-[3px] border-[1.5px] ${KIND_STYLE[d.kind].box}`}
                style={{
                  left: `${((d.x - PAD) / W) * 100}%`,
                  top: `${((d.y - PAD) / H) * 100}%`,
                  width: `${((d.w + PAD * 2) / W) * 100}%`,
                  height: `${((d.h + PAD * 2) / H) * 100}%`,
                }}
              >
                {first && LABELLED.has(d.label) && (
                  <span
                    className={`absolute whitespace-nowrap rounded-sm px-1 py-px text-[10px] font-semibold ${right ? "right-[-1.5px]" : "left-[-1.5px]"} ${below ? "top-full mt-0.5" : "-top-[18px]"} ${KIND_STYLE[d.kind].tag}`}
                  >
                    {d.label}
                  </span>
                )}
              </div>
            );
          })}
        </div>
        <div className="flex flex-col gap-4 text-xs">
          <div>
            <div className="panel-title mb-2">Detected</div>
            <ul className="space-y-1.5">
              {(Object.keys(KIND_STYLE) as Kind[]).map((k) => (
                <li key={k} className="flex items-center justify-between gap-2 text-white">
                  <span className="flex items-center gap-2">
                    <span className={`h-2.5 w-2.5 rounded-sm border-2 ${KIND_STYLE[k].box}`} />
                    {KIND_STYLE[k].name}
                  </span>
                  <span className="font-mono text-muted-foreground">{DETECTIONS.filter((d) => d.kind === k).length}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <div className="panel-title mb-2">Palette</div>
            <div className="flex flex-wrap gap-1">
              {PALETTE.map((c) => (
                <span key={c} title={c} className="h-6 w-6 rounded border border-white/15" style={{ background: c }} />
              ))}
            </div>
          </div>
          <div>
            <div className="panel-title mb-2">Design type</div>
            <div className="text-white">Sports poster</div>
          </div>
          <div>
            <div className="panel-title mb-2">Layers rebuilt</div>
            <div className="text-white">14 editable layers</div>
          </div>
        </div>
      </div>
    </figure>
  );
}
