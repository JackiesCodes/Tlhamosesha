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
text, font-size error, text colour (within ΔRGB 60), headline, objects found
(IoU ≥ 0.5), object type, false objects, design type and seconds per poster.
