# Accuracy evaluation

Measures how well the breakdown pipeline reads real-looking posters. Synthetic
posters are rendered in Chromium with real fonts, so every text line, colour
and object position is known exactly; each poster is then uploaded through the
running app and the results are scored against that answer key.

```bash
cd eval && npm install
node generate.mjs 36 7                         # tuning set   -> fixtures/
EVAL_SET=heldout node generate.mjs 36 11       # held-out set -> fixtures-heldout/

# in the repo root: npm run build && npx next start -p 3100
node run.mjs baseline                          # first run: the reference
node run.mjs my-change                         # later runs print the change vs baseline
EVAL_SET=heldout node run.mjs my-change        # same, on the held-out set
node failures.mjs my-change                    # list what was missed
node contact.mjs                               # contact sheet with answer-key boxes
```

Posters come in three tiers: `clean` (flat colour), `textured` (gradients,
noise, shapes) and `photo` (blurred photographic backgrounds). Tune on the
default set and confirm on a held-out seed you have not looked at, so a change
that only fits the tuning posters shows up.

Metrics: text lines found (≥80% characters right), character accuracy, false
text, font-size error, text colour (within ΔRGB 60), font family and weight,
headline, objects found (IoU ≥ 0.5), object type, false objects, design type,
cut-out matte IoU (missed objects count as 0), background error where text
and objects were removed (mean |ΔRGB| against the true background) and
seconds per poster. The generators also save each poster's true background
(`.plate.png`) and each object's true matte (`.obj-N.png`) for the last two.

`EVAL_AI=0` runs the classical pipeline (AI models off) for A/B comparisons;
`SAVE_PLATES=<dir>` keeps each rebuilt background.

### Real-photo posters

`real-generate.mjs` builds posters around real photographs: a photographic
cut-out (people, animals, cars, a coffee cup) over a different real photo,
with the usual text, logos and icons. The kit (`subj-*.png` cut-outs and
`bg-*.jpg` backgrounds with their subject removed) was made from the rembg
example photos and scikit-image sample images with a stronger reference
matting model (BiRefNet) and MI-GAN; it isn't in the repository.

```bash
REALKIT=/path/to/kit node real-generate.mjs 24 21   # -> fixtures-real/
EVAL_SET=real node run.mjs my-change
```

## Video (Phase 0 prototype)

`video-generate.mjs` turns posters into short videos: each scene's text and
objects animate in (fade, slide or scale) and some leave early, and scenes are
joined by hard cuts or 0.6 s crossfades. Frames are rendered from known
keyframes, so cut times, layer boxes and in/out times are exact.

```bash
node video-generate.mjs 12 101                 # -> videos/ (WebM + MP4 + answer keys)
EVAL_SET=heldout node video-generate.mjs 12 202
EVAL_SET=long node video-generate.mjs 3 303 13 16    # 44–53 s videos
EVAL_SET=long60 node video-generate.mjs 1 404 16 16  # one 59 s video, at the length limit
# app running on :3100; the prototype lives at /labs/video (not linked in the app)
node video-run.mjs my-change
EVAL_SET=heldout node video-run.mjs my-change
```

Scores: hard cuts found within 2 frames, crossfades within 0.3 s, false cuts,
text lines found per scene, layer in/out timing error, entrance motion (type
named correctly; path error as a share of frame width, sampled through the
entrance; opacity error), processing time as a multiple of video length, and
peak memory of the browser running the test. Motion truth comes from the
generator's animation spec (0.5 s, cubic-bezier(0.2, 0.8, 0.2, 1), slide 48 px
up or 64 px left, or scale from 0.82); entrances that overlap the scene's own
crossfade are left out.
The eval plays the WebM copies because the open-source Chromium used here has
no H.264 decoder; the MP4 copies are for checking in Chrome or Safari.

### Rebuilt-video and Lottie export

```bash
node video-export-check.mjs 6    # app running on :3100
```

Uploads each test video, exports the rebuilt video through the app's dialog
(adding a copy of the video with a test tone as the soundtrack), then checks
the file with ffprobe (format, video and audio streams, duration) and compares
it with the original at 4 frames per second (mean greyscale difference and
PSNR). It also exports the Lottie from the same project, renders it with
lottie-web at the same moments and compares it with the rebuilt video, which
checks that keyframes and easing survived the conversion.

