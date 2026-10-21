// Lists failures from a results file to show where accuracy is lost.
import fs from "node:fs";
import path from "node:path";
const r = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, "results", (process.argv[2] ?? "baseline") + ".json")));
const fix = (f) => JSON.parse(fs.readFileSync(path.join(import.meta.dirname, "fixtures", f.replace(".png", ".json"))));
console.log("== MISSED / MISREAD TEXT (acc<0.8)");
for (const row of r.rows) {
  const gt = fix(row.file);
  row.score.texts.forEach((t, i) => {
    if (t.found) return;
    const g = gt.texts[i];
    console.log(`${row.file} ${row.tier.padEnd(8)} ${g.role.padEnd(11)} ${String(g.fontSize).padStart(4)}px h${String(g.box.height).padStart(3)} ${g.fontFamily.padEnd(16)} ${g.lowContrast ? "LOWC " : ""}acc ${t.acc.toFixed(2)}  "${t.text}" -> "${t.pred}"`);
  });
}
console.log("\n== COLOUR WRONG");
for (const row of r.rows) { const gt = fix(row.file); row.score.texts.forEach((t, i) => { if (t.colorOk === false) console.log(`${row.file} "${t.text}" gt ${gt.texts[i].color}`); }); }
console.log("\n== OBJECTS MISSED");
for (const row of r.rows) row.score.objects.forEach((o) => { if (!o.found) console.log(`${row.file} ${row.tier.padEnd(8)} ${o.kind.padEnd(8)} best IoU ${o.iou} (pred ${o.predKind})`); });
console.log("\n== OBJECT KIND WRONG");
for (const row of r.rows) row.score.objects.forEach((o) => { if (o.found && !o.kindOk) console.log(`${row.file} gt ${o.kind} -> ${o.predKind}`); });
console.log("\n== FALSE OBJECTS");
for (const row of r.rows) if (row.score.fpObjects.length) console.log(`${row.file} ${row.tier.padEnd(8)} ${row.score.fpObjects.join(", ")}`);
console.log("\n== DESIGN TYPE WRONG");
for (const row of r.rows) if (!row.score.designOk) console.log(`${row.file} ${fix(row.file).designType} -> ${row.score.designPred}`);
