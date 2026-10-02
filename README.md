# Decon — Visual Reverse Engineering

**Reverse-engineer any poster into editable layers.**

Upload a poster, sports graphic, banner, flyer, infographic, ad, magazine page, diagram or artwork. Decon breaks it down into its text, objects, logos, background layers, colour system and layout grid, then rebuilds it as a fully editable, layered design you can export again.

![stack](https://img.shields.io/badge/Next.js-15-black) ![ts](https://img.shields.io/badge/TypeScript-strict-3178c6) ![tailwind](https://img.shields.io/badge/Tailwind-shadcn%2Fui-38bdf8) ![prisma](https://img.shields.io/badge/Prisma-PostgreSQL-2d3748)

## Quick start

```bash
npm install          # also generates the Prisma client and copies the OCR assets
npm run dev          # http://localhost:3000
```

On the Home page, choose one of the three sample posters (**Matchday Semi-Final**, **Airstride Launch** or **Summer Live Banner**) to watch the whole pipeline run without uploading anything.

You don't need an API key or a database. Everything runs on your device, and projects are saved in the browser (IndexedDB).

### Optional configuration (`.env`, see `.env.example`)

| Variable | Effect |
| --- | --- |
| `OPENAI_API_KEY`, `GEMINI_API_KEY`, `ANTHROPIC_API_KEY` | Adds OpenAI, Gemini and Claude Vision to the ensemble for better object labels, font identification and design-type votes |
| `VISION_SERVICE_URL` | Points at the YOLO + SAM + rembg microservice in `services/vision` |
| `DATABASE_URL` | Also syncs every analysis to PostgreSQL. Run `npm run db:push` once |

## What the pipeline extracts

| Area | Output |
| --- | --- |
| **Text** | Every line via Tesseract OCR (WASM, self-hosted), with role (headline, sub-headline, caption, statistic, score, date, name, CTA, body), box, colour, and estimated font family, weight, size, tracking, case and alignment |
| **Images** | People and players, faces, products, vehicles, buildings, logos, team badges, sponsor marks and icons. Each one is a transparent PNG with a crop and position data. Word-mark logos are read (e.g. *Sponsor logo · VOLTA*) |
| **Backgrounds** | A clean inpainted background plate, plus gradient, texture/grain, depth-blur, colour-overlay and lighting-map layers, each downloadable |
| **Colours** | Primary, secondary, accent and neutral palettes in HEX, RGB and HSL, with contrast ratios and CSS for gradients |
| **Layout** | Columns, rows, gutters, margins, padding, baseline, alignment, symmetry and visual hierarchy, drawn as a wireframe |
| **Metadata** | Dimensions, aspect ratio, orientation, and design type with confidence (e.g. *Sports Poster — 97%*) plus alternatives |
| **Design DNA** | Scores for typography (consistency, hierarchy, scale), colour (WCAG contrast, 60-30-10 balance, harmony) and layout (alignment, spacing rhythm, hierarchy, margins, symmetry) |

### Reconstruction editor

The editor is Figma-style: a layer list with visibility and lock toggles, and an inspector for position, width, height, rotation, opacity and layer order. You can edit text by double-clicking it, change fonts and colours (with palette swatches), replace images, add text and shapes, and undo or redo. Keyboard: arrow keys nudge (⇧ for 10px), Delete removes, ⌘Z / ⇧⌘Z undo and redo.

The preview compares the original with the reconstruction in **Split**, **Overlay** or **Difference** view.

### Export

PNG, JPG, SVG (with live text), PDF, PSD-style JSON, Figma JSON, Canva JSON, and a ZIP of every extracted asset with JSON reports.

The three JSON formats are layer trees modelled on each tool's document structure. They are not native `.psd`, `.fig` or Canva import files.

### Smart Search (⌘K)

Natural-language queries over the breakdown, for example: *"Find all player images"*, *"Show all blue colors"*, *"Show all text layers"*, *"Show sponsor logos"*, *"headlines"*, *"gradients"*, *"fonts over 60px"*. Results highlight the matching elements on the poster.

## Architecture

```
src/
  app/(app)/            Home, Upload, Projects, Projects/[id] workspace, Templates, Analytics, Downloads, Settings
  app/api/              health · analyze (vision ensemble) · projects (Prisma sync)
  components/shell/     Sidebar, top nav (search, notifications, workspace switcher, profile), mobile nav, ⌘K palette
  components/workspace/ Breakdown tabs, preview (split/overlay/difference), scene renderer, editor, inspector, export
  components/ui/        shadcn/ui-style primitives (Radix)
  lib/vision/           On-device CV pipeline
    raster.ts           Canvas and raster helpers, morphology, Otsu, push-pull inpainting
    segment.ts          Border-learnt background model + edge saliency → components (splits merged subjects)
    text.ts             Two-pass OCR (positive + inverted, sparse-text mode), region OCR, typography estimation
    objects.ts          Region → object classification, skin/face cues, colour-key matting cut-outs
    background.ts       Plate reconstruction, gradient fitting, texture/blur/overlay/lighting layers
    layout.ts · classify.ts · dna.ts · reconstruct.ts · pipeline.ts
  lib/ai/               Provider adapters (OpenAI, Gemini, Claude, CV service), schema, ensemble merge
  lib/export.ts         Scene → PNG/JPG/SVG/PDF/PSD-JSON/Figma-JSON/Canva-JSON, asset ZIP
  lib/search.ts         Smart Search intent parser
  lib/store/            Zustand stores (app settings, library, editor + history, analysis runner), IndexedDB
prisma/schema.prisma    Users, Workspaces, Projects, Uploads, Assets, Layers, Colors, Fonts,
                        Reconstructions, Exports, AnalysisResults
services/vision/        FastAPI reference service: YOLO detection → SAM masks → rembg fallback → OpenCV clean-up
```

### How detection works without cloud models

The on-device engine stands in for YOLO and SAM:

1. It learns the background colours from the image border.
2. It combines colour distance with Sobel edge energy into a saliency map, thresholds it (Otsu) and cleans it with morphology.
3. It labels connected components. Large, loosely filled regions are re-thresholded locally or opened, to split subjects joined by a glow.

OCR boxes remove text regions. The remaining regions are classified from their geometry, position, fill, skin share (RGB ∩ YCbCr rule on flat pixels) and the poster's own wording. For example, sporty text turns badges into "Team badge", and ad text makes the hero item a "Product". Cut-outs are colour-keyed against the background model, gated by the mask, with overlapping text ink removed so the rebuild doesn't show ghosted text.

When providers are configured, `/api/analyze` runs them in parallel and merges their answers. Design-type votes are averaged, and duplicate boxes collapse. The client then merges the result with the local pass: LLMs refine typefaces, roles and labels, while OCR keeps precise geometry.

## Scripts

| Script | |
| --- | --- |
| `npm run dev` / `build` / `start` | Next.js |
| `npm run typecheck` / `lint` | Type-check and lint |
| `npm run db:push` / `db:migrate` / `db:studio` | Prisma |

## Mobile

Mobile has its own layouts: a bottom tab bar with a central Upload action, a preview-first project view, and full asset browsing and downloads. Layer editing stays on desktop.
