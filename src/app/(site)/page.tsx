import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Eraser,
  FileDown,
  Grid3X3,
  Lock,
  MonitorSmartphone,
  Palette,
  ScanText,
  Shapes,
  Upload,
  Wand2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { BRAND, fullTitle } from "@/lib/brand";

export const metadata: Metadata = {
  title: { absolute: fullTitle },
  description: BRAND.description,
};

// Boxes Decon detects on the bundled matchday example (1080 × 1350 source px).
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

const STEPS = [
  { icon: Upload, title: "Drop in a design", body: "PNG, JPG, WEBP, SVG and more, up to 25 MB. Or paste straight from your clipboard." },
  { icon: ScanText, title: "Decon takes it apart", body: "Text, objects, background, colours and layout are separated automatically, right in your browser." },
  { icon: FileDown, title: "Edit and export", body: "Adjust the rebuilt layers, then download images, individual assets or a full layer file." },
];

const EXPORTS = ["PNG", "JPG", "SVG", "PDF", "PSD-style JSON", "Figma JSON", "Canva JSON", "Asset ZIP"];

const FAQ = [
  {
    q: "Is my image uploaded anywhere?",
    a: "No. The analysis runs inside your browser, and your projects are saved in your browser's storage on your device. Nothing is sent to a server unless you switch on an optional cloud feature where one is offered, and it is clearly labelled when it is.",
  },
  {
    q: "How accurate is it?",
    a: "It works best on clean digital graphics — posters, banners, flyers and social posts with clear text and shapes. Busy photographs, heavy textures and very stylised lettering are harder: you may need to fix some text or adjust a cut-out by hand in the editor.",
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
      <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 pb-16 pt-12 sm:px-6 lg:grid-cols-[1fr_1.05fr] lg:pt-20">
        <div>
          <p className="text-sm font-medium text-brand">{BRAND.tagline}</p>
          <h1 className="mt-3 font-display text-4xl font-bold leading-[1.08] tracking-tight text-white sm:text-5xl">
            Turn any poster back into editable layers.
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted-foreground">
            Lost the source file? Drop in the finished design. {BRAND.name} separates its text, images, logos, background, colours and layout —
            then rebuilds it so you can edit and export it again.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link href="/upload">
                Start a breakdown <ArrowRight />
              </Link>
            </Button>
            <Button asChild size="lg" variant="secondary">
              <Link href="/upload?sample=matchday">See an example</Link>
            </Button>
          </div>
          <ul className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
            <li className="flex items-center gap-1.5"><Lock className="h-3.5 w-3.5" /> Runs in your browser</li>
            <li className="flex items-center gap-1.5"><MonitorSmartphone className="h-3.5 w-3.5" /> No sign-up</li>
            <li className="flex items-center gap-1.5"><FileDown className="h-3.5 w-3.5" /> PNG, SVG, PDF and layer exports</li>
          </ul>
        </div>

        {/* Annotated example */}
        <figure className="panel p-4 sm:p-5">
          <div className="grid gap-4 sm:grid-cols-[1fr_150px]">
            <div className="relative mx-auto w-full max-w-[380px]" style={{ aspectRatio: `${W} / ${H}` }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/samples/matchday.svg" alt="Example sports poster with Decon's detected elements outlined" className="absolute inset-0 h-full w-full rounded-md" />
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
          <figcaption className="mt-4 text-xs text-muted-foreground">An example breakdown. Each outlined element becomes its own layer or asset.</figcaption>
        </figure>
      </section>

      {/* Features */}
      <section id="features" className="scroll-mt-20 border-t border-white/[0.06] bg-surface/40">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <h2 className="font-display text-3xl font-bold tracking-tight text-white">Everything in the design, separated</h2>
          <p className="mt-3 max-w-2xl text-muted-foreground">One upload gives you the parts you would normally rebuild by hand.</p>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title} className="panel p-6">
                <f.icon className="h-5 w-5 text-brand" />
                <h3 className="mt-4 font-semibold text-white">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20 sm:px-6">
        <h2 className="font-display text-3xl font-bold tracking-tight text-white">How it works</h2>
        <ol className="mt-10 grid gap-6 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <li key={s.title} className="flex gap-4">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/10 font-mono text-sm text-white">{i + 1}</span>
              <div>
                <h3 className="flex items-center gap-2 font-semibold text-white">
                  <s.icon className="h-4 w-4 text-muted-foreground" /> {s.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
        <div className="mt-12 flex flex-wrap items-center gap-2">
          <span className="mr-2 text-sm text-muted-foreground">Export as</span>
          {EXPORTS.map((e) => (
            <span key={e} className="rounded-md border border-white/[0.08] bg-surface px-2.5 py-1 font-mono text-xs text-white">
              {e}
            </span>
          ))}
        </div>
      </section>

      {/* Privacy */}
      <section id="privacy" className="scroll-mt-20 border-y border-white/[0.06] bg-surface/40">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-20 sm:px-6 md:grid-cols-[1fr_1.2fr]">
          <div>
            <Lock className="h-6 w-6 text-brand" />
            <h2 className="mt-4 font-display text-3xl font-bold tracking-tight text-white">Your designs stay on your device</h2>
          </div>
          <div className="space-y-4 text-muted-foreground">
            <p>
              {BRAND.name} does the analysis in your browser. The image you drop in isn&apos;t uploaded to us, and your projects are saved in your
              browser&apos;s own storage on your device.
            </p>
            <p>
              That also means your projects don&apos;t follow you to another browser or device. Use <span className="text-white">Settings → Export backup</span> to
              keep a copy or move them.
            </p>
            <Link href="/privacy" className="inline-flex items-center gap-1 text-sm font-medium text-brand hover:underline">
              Read the privacy policy <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="mx-auto max-w-3xl scroll-mt-20 px-4 py-20 sm:px-6">
        <h2 className="font-display text-3xl font-bold tracking-tight text-white">Questions</h2>
        <div className="mt-8 divide-y divide-white/[0.08] border-y border-white/[0.08]">
          {FAQ.map((f) => (
            <details key={f.q} className="group py-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium text-white [&::-webkit-details-marker]:hidden">
                {f.q}
                <span className="text-muted-foreground transition group-open:rotate-45" aria-hidden>
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
        <div className="panel flex flex-col items-start gap-6 p-8 sm:flex-row sm:items-center sm:justify-between sm:p-10">
          <div>
            <h2 className="font-display text-2xl font-bold tracking-tight text-white">Have a design to take apart?</h2>
            <p className="mt-2 text-muted-foreground">No account needed — open the app and drop in an image.</p>
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
